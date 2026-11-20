// The library server: serves the built site (dist/) and searches the brain by meaning.
// Listens on 127.0.0.1 only; reach it from other devices through `tailscale serve` (tailnet only, never public).
//   GET  /...                 static files from dist/
//   POST /brain/search {query, k?}   query embedded on the ANE by Chippy, cosine over vec.i8 (256-d), plus exact-word hits
import { join, normalize } from "node:path";

const DIST = join(import.meta.dir, "dist");
const DATA = join(DIST, "brain", "data");
const PORT = Number(process.env.PORT || 3414);
const CHIPPY = process.env.CHIPPY_URL || "http://127.0.0.1:11435";
const MODEL = process.env.CHIPPY_MODEL || "embeddinggemma:ane-w8a16";

type Meta = { n: number; dim: number; scale: number; query_prompt: string };
let meta: Meta, vec: Int8Array, texts: string[], loadedAt = 0;

async function load() {
  const st = await Bun.file(join(DATA, "meta.json")).stat().catch(() => null);
  if (!st || st.mtimeMs === loadedAt) return;
  meta = await Bun.file(join(DATA, "meta.json")).json();
  const full = await Bun.file(join(DATA, "vec768.i8")).exists();
  vec = new Int8Array(await Bun.file(join(DATA, full ? "vec768.i8" : "vec.i8")).arrayBuffer());
  if (full) { meta.dim = (meta as any).dim_full; meta.scale = (meta as any).scale_full; }   // search on the full 768-d vectors
  texts = ((await Bun.file(join(DATA, "passages.json")).json()) as any[]).map((r) => `${r[3]} ${r[4]}`.toLowerCase());
  loadedAt = st.mtimeMs;
}

async function embed(q: string): Promise<Float32Array | null> {
  try {
    const r = await fetch(`${CHIPPY}/api/embed`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: `${meta.query_prompt}${q}` }), signal: AbortSignal.timeout(5000) });
    const v: number[] | undefined = ((await r.json()) as any)?.embeddings?.[0];
    if (!Array.isArray(v)) return null;
    const out = new Float32Array(meta.dim);
    let s = 0;
    for (let d = 0; d < meta.dim; d++) { out[d] = v[d]; s += v[d] * v[d]; }
    s = Math.sqrt(s) || 1;
    for (let d = 0; d < meta.dim; d++) out[d] /= s;
    return out;
  } catch { return null; }
}

function topK(q: Float32Array, k: number) {
  const { n, dim, scale } = meta;
  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * dim;
    for (let d = 0; d < dim; d++) s += vec[o + d] * q[d];
    score[i] = s / scale;
  }
  return [...score.keys()].sort((a, b) => score[b] - score[a]).slice(0, k).map((i) => ({ i, score: +score[i].toFixed(4) }));
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/brain/search" && req.method === "POST") {
      await load();
      const { query, k = 40 } = ((await req.json().catch(() => ({}))) || {}) as { query?: string; k?: number };
      const q = query?.trim();
      if (!q) return Response.json({ error: "query required" }, { status: 400 });
      const t0 = performance.now();
      const v = await embed(q);
      const ms = Math.round(performance.now() - t0);
      const lq = q.toLowerCase();
      const keyword: number[] = [];
      for (let i = 0; i < texts.length && keyword.length < 200; i++) if (texts[i].includes(lq)) keyword.push(i);
      return Response.json({ hits: v ? topK(v, Math.min(Math.max(1, k), 200)) : [], keyword,
        vector_from: v ? `chippy ${MODEL} (${ms} ms)` : "none (Chippy down): exact words only" });
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) return new Response("no", { status: 403 });
    const f = Bun.file(file);
    if (await f.exists()) return new Response(f);
    const html = Bun.file(join(file, "index.html"));
    if (await html.exists()) return new Response(html);
    return new Response(Bun.file(join(DIST, "404.html")).size ? Bun.file(join(DIST, "404.html")) : "not found", { status: 404 });
  },
});
console.log(`library on http://127.0.0.1:${PORT}/  (brain search via ${CHIPPY})`);
