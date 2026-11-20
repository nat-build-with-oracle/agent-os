#!/usr/bin/env python3
"""
brain.py: the library brain. Every chapter of every book in <BOOKS_DIR>/<date>_<slug>/NN-*.md (default ./books), cut into passages, embedded on the
Apple Neural Engine, laid out as a 3D meaning map.

    uv run --quiet --no-project --python 3.12 --with numpy --with umap-learn python scripts/brain.py   (= `bun run brain`)

Passages: markdown paragraphs joined up to ~900 characters (never across chapters); code blocks and image lines are left out;
each keeps book, chapter file, chapter title and the section heading in force.
Vectors: EmbeddingGemma through Chippy (127.0.0.1:11435, embeddinggemma:ane-w8a16) = ANE only, document prompt
"title: none | text: ", sha1 cache in .brain-cache/ so a rebuild embeds only new passages.
Map: first 256 dims (Matryoshka, renormalised), UMAP 3D (cosine, n_neighbors 15, min_dist 0.15, random_state 7), K=4 links.
Output public/brain/data/: xyz.f32 book.u8 knn.u32 vec.i8 passages.json meta.json  (build output, git-ignored: book text).
"""
import glob, hashlib, json, os, re, time, urllib.request
from pathlib import Path
import numpy as np

SITE = Path(__file__).resolve().parent.parent
ROOT = Path(os.environ.get("BOOKS_DIR", SITE / "books")).resolve()   # folders YYYY-MM-DD_slug with OUTLINE.md + NN-*.md
OUT = SITE / "public" / "brain" / "data"
CACHE = SITE / ".brain-cache"
DIM, K = 256, 4
DOC = "title: none | text: "
QUERY = "task: search result | query: "
CHIPPY = os.environ.get("CHIPPY_URL", "http://127.0.0.1:11435")
MODEL = os.environ.get("CHIPPY_MODEL", "embeddinggemma:ane-w8a16")
MAXC, MINC = 450, 160


def log(m): print(m, flush=True)


def front(text, key):
    m = re.search(rf'^{key}: "?(.+?)"?\s*$', text, re.M)
    return m.group(1) if m else ""


def passages_of(md):
    """yield (section, text) from one chapter's markdown."""
    md = re.sub(r"```.*?```", "\n", md, flags=re.S)
    section, buf, out = "", [], []

    def flush():
        if buf:
            out.append((section, "\n".join(buf).strip()))
            buf.clear()
    for para in re.split(r"\n\s*\n", md):
        p = para.strip()
        if not p or p.startswith("!["):
            continue
        h = re.match(r"^(#{1,4})\s+(.*)$", p)
        if h:
            flush()
            section = h.group(2).strip()
            continue
        p = re.sub(r"\*\*|`", "", p)
        p = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", p)
        if buf and sum(len(b) for b in buf) + len(p) > MAXC:
            flush()
        buf.append(p)
        if sum(len(b) for b in buf) >= MAXC:
            flush()
    flush()
    merged = []
    for sec, t in out:   # glue very short passages to the previous one in the same section
        if merged and len(t) < MINC and merged[-1][0] == sec and len(merged[-1][1]) + len(t) <= MAXC + MINC:
            merged[-1] = (sec, merged[-1][1] + "\n" + t)
        else:
            merged.append((sec, t))
    return merged


def embed(texts):
    CACHE.mkdir(parents=True, exist_ok=True)
    strs = [DOC + t[:2400] for t in texts]
    keys = [hashlib.sha1(s.encode()).hexdigest()[:20] for s in strs]
    vfile, kfile = CACHE / "vec.f16.npy", CACHE / "keys.txt"
    have, OV = {}, np.zeros((0, 768), np.float16)
    if vfile.exists() and kfile.exists():
        OV, ks = np.load(vfile), kfile.read_text().split()
        if len(ks) == len(OV):
            have = {k: i for i, k in enumerate(ks)}
        else:
            OV = np.zeros((0, 768), np.float16)
    todo = sorted({k: i for i, k in enumerate(keys) if k not in have}.values(), key=lambda i: len(strs[i]))
    log(f"vectors: {len(keys) - len(todo):,} from cache, {len(todo):,} to embed on the ANE ({CHIPPY} {MODEL})")
    new_v, new_k, t0 = [], [], time.time()
    for s in range(0, len(todo), 64):
        part = todo[s:s + 64]
        req = urllib.request.Request(f"{CHIPPY}/api/embed", headers={"content-type": "application/json"},
                                     data=json.dumps({"model": MODEL, "input": [strs[i] for i in part]}).encode())
        new_v.extend(np.asarray(json.load(urllib.request.urlopen(req, timeout=300))["embeddings"], np.float32))
        new_k.extend(keys[i] for i in part)
        log(f"  embed {min(s + 64, len(todo)):,}/{len(todo):,}  {min(s + 64, len(todo)) / (time.time() - t0):,.0f} texts/s")
    if new_v:
        OV = np.concatenate([OV, np.asarray(new_v, np.float16)])
        np.save(vfile, OV)
        kfile.write_text("\n".join(list(have) + new_k))
        have = {k: i for i, k in enumerate(list(have) + new_k)}
    took = time.time() - t0
    return np.stack([OV[have[k]].astype(np.float32) for k in keys]), len(todo), took


def main():
    T0 = time.time()
    books, rows = [], []
    for d in sorted(glob.glob(str(ROOT) + "/[0-9][0-9][0-9][0-9]-*_*")):
        d = Path(d)
        if not (d / "OUTLINE.md").exists():
            continue
        outline = (d / "OUTLINE.md").read_text()
        if "{{" in front(outline, "title") or not list(d.glob("[0-9][0-9]-*.md")):
            continue   # scaffold still holding template text
        slug = re.sub(r"^\d{4}-\d{2}-\d{2}_", "", d.name)
        bi = len(books)
        start = len(rows)
        for f in sorted(d.glob("[0-9][0-9]-*.md")):
            md = f.read_text()
            title = (re.search(r"^# (.+)$", md, re.M) or [None, f.stem])[1].strip()
            for sec, t in passages_of(md):
                rows.append({"b": bi, "f": f.stem, "c": title, "s": sec, "t": t})
        books.append({"slug": slug, "title": front(outline, "title"), "start": start, "count": len(rows) - start})
        log(f"{slug}: {len(rows) - start} passages")
    texts = [r["t"] for r in rows]
    V, embedded, took = embed(texts)
    X = V[:, :DIM]
    X /= np.linalg.norm(X, axis=1, keepdims=True) + 1e-9
    import umap
    t1 = time.time()
    P = umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.15, metric="cosine", random_state=7).fit_transform(X).astype(np.float32)
    P -= P.mean(0); P /= np.abs(P).max() + 1e-9
    S = X @ X.T
    np.fill_diagonal(S, -1)
    knn = np.argpartition(-S, K, axis=1)[:, :K]
    knn = np.take_along_axis(knn, np.argsort(-np.take_along_axis(S, knn, 1), axis=1), 1).astype(np.uint32)
    umap_s = time.time() - t1
    OUT.mkdir(parents=True, exist_ok=True)
    scale = 127 / float(np.abs(X).max())
    P.tofile(OUT / "xyz.f32")
    np.array([r["b"] for r in rows], np.uint8).tofile(OUT / "book.u8")
    knn.tofile(OUT / "knn.u32")
    np.clip(np.round(X * scale), -127, 127).astype(np.int8).tofile(OUT / "vec.i8")
    # full 768-d vectors for search (Matryoshka 256-d is only for the map): EmbeddingGemma v1 at 768 scored best on the ANE
    # in the arra-oracle benchmark of 2026-11-20 (MRR 0.702 vs gemma2 0.660, bge-m3 1024-d 0.597)
    XF = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    scale_full = 127 / float(np.abs(XF).max())
    np.clip(np.round(XF * scale_full), -127, 127).astype(np.int8).tofile(OUT / "vec768.i8")
    (OUT / "passages.json").write_text(json.dumps([[r["b"], r["f"], r["c"], r["s"], r["t"]] for r in rows], ensure_ascii=False, separators=(",", ":")))
    meta = {"n": len(rows), "dim": DIM, "k": K, "scale": scale, "dim_full": int(V.shape[1]), "scale_full": scale_full, "books": books, "doc_prompt": DOC, "query_prompt": QUERY,
            "model": MODEL, "embedded_now": embedded, "embed_seconds": round(took, 1), "umap_seconds": round(umap_s, 1),
            "total_seconds": round(time.time() - T0, 1), "built": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    log(f"wrote {OUT}: {len(rows)} passages, {len(books)} books, embedded now {embedded} in {took:.1f}s, UMAP {umap_s:.1f}s")


if __name__ == "__main__":
    main()
