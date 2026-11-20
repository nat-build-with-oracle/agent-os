// The library brain scene, shared by the landing hero and /brain/ (full screen). Everything is scoped to one root element
// holding [data-b=...] children. Data: /brain/data/* built by scripts/brain.py (ANE vectors, UMAP 3D).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export async function mountBrain(root: HTMLElement, opts: { home?: [number, number, number]; base?: string } = {}) {
  const BASE = (opts.base ?? "/").replace(/\/?$/, "/");

  const BOOKC = ["#56B4E9", "#E69F00", "#F0E442", "#CC79A7", "#009E73", "#D55E00"];   // Okabe-Ito: distinct under protan/deutan/tritan (min ΔE 17 vs 10.7 before, measured)
  const $ = (id: string) => root.querySelector(`[data-b="${id}"]`) as HTMLElement;
  const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const bin = async (f: string, T: any) => new T(await (await fetch(`${BASE}brain/data/${f}`)).arrayBuffer());
  const [meta, raw, book, knn, rows] = await Promise.all([
    fetch(`${BASE}brain/data/meta.json`).then((r) => r.json()), bin("xyz.f32", Float32Array), bin("book.u8", Uint8Array),
    bin("knn.u32", Uint32Array), fetch(`${BASE}brain/data/passages.json`).then((r) => r.json()),
  ]);
  const N: number = meta.n, K: number = meta.k;
  $("stat").textContent = `${N.toLocaleString()} passages · ${meta.books.length} books · Apple Neural Engine`;
  $("status").textContent = `build ${meta.built.slice(0, 16).replace("T", " ")} · EmbeddingGemma ${meta.dim}d · UMAP 3D`;

  // layout: each book gets its own cloud on a ring (the books share one subject, so one common UMAP piles them on top of
  // each other). Inside a cloud the UMAP shape is kept: centred on the book's median point, scaled on its median distance.
  // Lines between clouds = passages of different books that are near in meaning.
  const xyz = new Float32Array(raw.length);
  const NB = meta.books.length, RING = NB > 1 ? 52 : 0, CLOUD = 12;
  meta.books.forEach((b: any, k: number) => {
    const ids = Array.from({ length: b.count }, (_, j) => b.start + j);
    const med = [0, 1, 2].map((a) => { const v = ids.map((i) => raw[i * 3 + a]).sort((p, q) => p - q); return v[v.length >> 1]; });
    const d = ids.map((i) => Math.hypot(raw[i*3] - med[0], raw[i*3+1] - med[1], raw[i*3+2] - med[2])).sort((p, q) => p - q);
    const s = CLOUD / (d[d.length >> 1] || 1), ang = (k / NB) * Math.PI * 2;
    const c = [Math.cos(ang) * RING, (k % 2 ? 10 : -10), Math.sin(ang) * RING];
    for (const i of ids) for (let a = 0; a < 3; a++) xyz[i * 3 + a] = Math.max(-CLOUD * 2.6, Math.min(CLOUD * 2.6, (raw[i * 3 + a] - med[a]) * s)) + c[a];
  });
  // two layouts from the SAME vectors: "separate" = one cloud per book (above), "combined" = one shared meaning space (the raw UMAP),
  // where books that say the same thing land on top of each other. xyz is the live buffer, morphed between the two.
  const sepXYZ = xyz.slice(), allXYZ = new Float32Array(raw.length);
  { const med = [0, 1, 2].map((a) => { const v = Array.from({ length: N }, (_, i) => raw[i * 3 + a]).sort((p, q) => p - q); return v[N >> 1]; });
    const d = Array.from({ length: N }, (_, i) => Math.hypot(raw[i*3] - med[0], raw[i*3+1] - med[1], raw[i*3+2] - med[2])).sort((p, q) => p - q);
    const s = 40 / (d[N >> 1] || 1);
    for (let i = 0; i < N; i++) for (let a = 0; a < 3; a++) allXYZ[i * 3 + a] = Math.max(-110, Math.min(110, (raw[i * 3 + a] - med[a]) * s)); }
  let layout: "sep" | "all" = "sep", morph = { from: sepXYZ, to: sepXYZ, t0: -1 };

  const renderer = new THREE.WebGLRenderer({ canvas: $("c") as unknown as HTMLCanvasElement, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(root.clientWidth, root.clientHeight, false);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x07080c, 0.004);
  const camera = new THREE.PerspectiveCamera(55, root.clientWidth / root.clientHeight, 0.1, 2000);
  const HOME = new THREE.Vector3(...(opts.home ?? [0, 70, 230])); camera.position.copy(HOME);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.4;
  new ResizeObserver(() => { renderer.setSize(root.clientWidth, root.clientHeight, false); camera.aspect = root.clientWidth / root.clientHeight; camera.updateProjectionMatrix(); }).observe(root);

  const sprite = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.3, "rgba(255,255,255,.6)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(xyz, 3));
  const base = new Float32Array(N * 3), col = new Float32Array(N * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  // points shader: emerge (each point flies out of its book's centre on load), breathe (own phase), per-point size for focus
  const size = new Float32Array(N).fill(1), phase = new Float32Array(N), home0 = new Float32Array(N * 3);
  meta.books.forEach((b: any) => { let cx = 0, cy = 0, cz = 0; for (let i = b.start; i < b.start + b.count; i++) { cx += xyz[i*3]; cy += xyz[i*3+1]; cz += xyz[i*3+2]; }
    cx /= b.count; cy /= b.count; cz /= b.count; for (let i = b.start; i < b.start + b.count; i++) { home0.set([cx, cy, cz], i * 3); phase[i] = Math.random() * 6.283; } });
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("phase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("origin", new THREE.BufferAttribute(home0, 3));
  const uni = { time: { value: 0 }, emerge: { value: 0 }, map: { value: sprite }, scale: { value: innerHeight * 0.9 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute float phase; attribute vec3 origin; uniform float time; uniform float emerge; uniform float scale; varying vec3 vC;
      void main(){ float e = 1.0 - pow(1.0 - clamp(emerge, 0.0, 1.0), 3.0); vec3 p = mix(origin, position, e);
        float breathe = 1.0 + 0.12 * sin(time * 1.1 + phase);
        vC = color * (0.94 + 0.06 * sin(time * 1.4 + phase * 1.7));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 2.4 * size * breathe * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, 1.0) * t; }`,
  }));
  scene.add(pts);
  // the active point: a big pulsing halo + ring, so the reader sees at once which passage is "the one"
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  // paths: light pulses run from the active passage to each of its nearest passages (the "why these are related" trail)
  const pulses = Array.from({ length: 12 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.visible = false; scene.add(sp); return sp; });
  const pathGeo = new THREE.BufferGeometry(); pathGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4 * 6), 3));
  const pathLines = new THREE.LineSegments(pathGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pathLines.visible = false; scene.add(pathLines);
  let pathTo: number[] = [];
  halo.visible = false; scene.add(halo);
  // the dot's book: a thin light line from the active dot up to its cover; that cover grows, the others fade
  const bookGeo = new THREE.BufferGeometry(); bookGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const bookLine = new THREE.Line(bookGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 2, gapSize: 1.5, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
  bookLine.visible = false; scene.add(bookLine);
  let hover = -1; let tipTimer: any = 0;
  // links: in "separate" only short links inside a cloud (long ones read as noise); in "combined" every link, so lines between books show where they agree
  const pairsSep: number[] = [], pairsAll: number[] = [], cross: number[] = []; const seen = new Set<number>();
  for (let i = 0; i < N; i++) for (let t = 0; t < K; t++) { const j = knn[i * K + t]; if (j >= N || j === i) continue; const a = Math.min(i, j), b = Math.max(i, j); if (seen.has(a * N + b)) continue; seen.add(a * N + b);
    pairsAll.push(a, b); if (book[a] !== book[b]) cross.push(a, b);
    if (Math.hypot(xyz[a*3]-xyz[b*3], xyz[a*3+1]-xyz[b*3+1], xyz[a*3+2]-xyz[b*3+2]) <= 30) pairsSep.push(a, b); }
  const pairs = pairsSep;
  const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute("position", geo.attributes.position); lgeo.setAttribute("color", geo.attributes.color); lgeo.setIndex(pairs);
  const links = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(links);
  $("links").onclick = () => { links.visible = !links.visible; $("links").textContent = links.visible ? "links: on" : "links: off"; };

  // floating covers above each book's cloud
  const covers: THREE.Mesh[] = []; const loader = new THREE.TextureLoader();
  meta.books.forEach((b: any, k: number) => {
    let cx = 0, cy = 0, cz = 0, top = -1e9;
    for (let i = b.start; i < b.start + b.count; i++) { cx += xyz[i*3]; cy += xyz[i*3+1]; cz += xyz[i*3+2]; top = Math.max(top, xyz[i*3+1]); }
    cx /= b.count; cy /= b.count; cz /= b.count;
    const tex = loader.load(`${BASE}covers/${b.slug}.png`); tex.colorSpace = THREE.SRGBColorSpace;
    const H = 22, W = H * 0.707;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, fog: false }));
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.8, H + 1.8), new THREE.MeshBasicMaterial({ color: BOOKC[k % 6], transparent: true, opacity: 0.4, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    edge.position.z = -0.05; m.add(edge);
    const ang = (k / meta.books.length) * Math.PI * 2 + 0.5;
    m.userData = { book: k, home: new THREE.Vector3(cx, top + H * 0.5 + 4, cz), sepHome: new THREE.Vector3(cx, top + H * 0.5 + 4, cz),
      allHome: new THREE.Vector3(Math.cos(ang) * 95, 62 + (k % 2) * 10, Math.sin(ang) * 95) };   // separate: above its own cloud · combined: on a ring around the shared space
    m.position.copy(m.userData.home); scene.add(m); covers.push(m);
  });

  // colour modes + legend toggles
  let mode = "book", hidden = new Set<string>(), focus: Set<number> | null = null, focusMain = -1;
  const chapKeys: string[] = [...new Set<string>(rows.map((r: any) => `${r[0]}|${r[1]}`))];
  const keyOf = (i: number) => mode === "book" ? String(book[i]) : `${rows[i][0]}|${rows[i][1]}`;
  const colorOf = (key: string) => { if (mode === "book") return new THREE.Color(BOOKC[+key % 6]);
    const idx = chapKeys.indexOf(key), b = +key.split("|")[0]; const c = new THREE.Color(BOOKC[b % 6]); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    return new THREE.Color().setHSL((hsl.h + (idx % 7) * 0.035) % 1, 0.75, 0.5 + ((idx % 3) - 1) * 0.1); };
  function legend() {
    const counts = new Map<string, number>(); for (let i = 0; i < N; i++) counts.set(keyOf(i), (counts.get(keyOf(i)) || 0) + 1);
    const label = (k: string) => mode === "book" ? meta.books[+k].title : rows.find((r: any) => `${r[0]}|${r[1]}` === k)[2];
    $("fams").innerHTML = [...counts].map(([k, n]) => `<div class="fam ${hidden.has(k) ? "off" : ""}" data-k="${esc(k)}"><i style="background:#${colorOf(k).getHexString()}"></i><span>${esc(label(k))}</span><span class="n">${n}</span></div>`).join("");
  }
  function paint() {
    for (let i = 0; i < N; i++) {
      const c = colorOf(keyOf(i)); let f = hidden.has(keyOf(i)) ? 0.04 : 1.0;
      if (focus) f = focus.has(i) ? (i === focusMain ? 1.8 : 1.3) : 0.1;
      base[i*3] = c.r; base[i*3+1] = c.g; base[i*3+2] = c.b; col[i*3] = c.r * f; col[i*3+1] = c.g * f; col[i*3+2] = c.b * f;
      size[i] = i === focusMain ? 4.5 : focus && focus.has(i) ? 2.4 : hidden.has(keyOf(i)) ? 0.5 : 1;
    }
    geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true;
    const on = focusMain >= 0 && !!focus; halo.visible = on; pathLines.visible = on;
    pathTo = on ? Array.from({ length: K }, (_, k) => knn[focusMain * K + k]) : [];
    if (on) { const c = colorOf(keyOf(focusMain)); halo.material.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.35);
      halo.position.set(xyz[focusMain*3], xyz[focusMain*3+1], xyz[focusMain*3+2]);
      const a = pathGeo.attributes.position.array as Float32Array;
      pathTo.forEach((j, k) => a.set([xyz[focusMain*3], xyz[focusMain*3+1], xyz[focusMain*3+2], xyz[j*3], xyz[j*3+1], xyz[j*3+2]], k * 6));
      pathGeo.attributes.position.needsUpdate = true; (pathLines.material as THREE.LineBasicMaterial).color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.4); }
    pulses.forEach((p) => (p.visible = on));
    const fb = on ? book[focusMain] : -1; bookLine.visible = on;
    covers.forEach((m) => { const mine = m.userData.book === fb; m.userData.emph = !on ? 1 : mine ? 1.35 : 0.8;
      (m.material as THREE.MeshBasicMaterial).opacity = !on || mine ? 1 : 0.35; ((m.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = mine ? 0.95 : 0.4; });
    if (on) (bookLine.material as THREE.LineDashedMaterial).color.copy(colorOf(String(book[focusMain])));
    (links.material as THREE.LineBasicMaterial).opacity = focus ? 0.6 : 0.28;
  }
  root.querySelectorAll(".modes button[data-m]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll(".modes button[data-m]").forEach((x) => x.classList.remove("on")); b.classList.add("on");
    mode = (b as HTMLElement).dataset.m!; hidden.clear(); legend(); paint(); }));
  $("fams").addEventListener("click", (e) => { const f = (e.target as HTMLElement).closest(".fam") as HTMLElement | null; if (!f) return;
    const k = f.dataset.k!; hidden.has(k) ? hidden.delete(k) : hidden.add(k); legend(); paint(); });
  legend(); paint();

  // reading panel
  const link = (i: number) => { const [b, f, , , t] = rows[i]; const frag = t.replace(/\s+/g, " ").slice(0, 24).trim(); return `${BASE}${meta.books[b].slug}/${f}/#:~:text=${encodeURIComponent(frag)}`; };
  function flyTo(i: number) { const t = new THREE.Vector3(xyz[i*3], xyz[i*3+1], xyz[i*3+2]); const dir = camera.position.clone().sub(controls.target).normalize(); controls.target.copy(t); camera.position.copy(t.clone().add(dir.multiplyScalar(110))); controls.autoRotate = false; }   // keep the map in view: same viewing angle, 110 units back
  function open(i: number, extra = "") {
    const [b, , chap, sec, text] = rows[i]; const nb = Array.from({ length: K }, (_, k) => knn[i * K + k]);
    focus = new Set([i, ...nb]); focusMain = i; paint(); flyTo(i);
    $("panel").innerHTML = `<button class="btn x" data-b="close">✕</button>
      <a class="bookchip" href="${BASE}${meta.books[b].slug}/" style="--c:${BOOKC[b % 6]}"><img src="${BASE}covers/${meta.books[b].slug}.png" alt="" /><span><small>from the book</small><b>${esc(meta.books[b].title)}</b></span></a><h3>${esc(chap)}</h3><p class="meta">${esc(sec || "")}</p>
      <p class="t">${esc(text)}</p><p><a href="${link(i)}">Read in chapter →</a></p>
      <p class="meta" style="margin-top:16px">Nearest in meaning</p><div class="hits">${nb.map((j) => `<button data-i="${j}"><small style="color:${BOOKC[rows[j][0] % 6]}">${esc(meta.books[rows[j][0]].title)} · ${esc(rows[j][2])}</small><br>${esc(rows[j][4].slice(0, 110))}…</button>`).join("")}</div>${extra}`;
    $("panel").classList.add("open");
  }
  root.addEventListener("click", (e) => { const t = e.target as HTMLElement;
    if (t.dataset.b === "close") { $("panel").classList.remove("open"); focus = null; focusMain = -1; paint(); return; }
    const h = t.closest("[data-i]") as HTMLElement | null; if (h) open(+h.dataset.i!, lastHits); });
  $("reset").onclick = () => { focus = null; focusMain = -1; paint(); controls.target.set(0, 0, 0); camera.position.copy(HOME); controls.autoRotate = true; $("panel").classList.remove("open"); };

  // pick + hover
  const ray = new THREE.Raycaster(); (ray.params.Points as any).threshold = 1.6;
  const mouse = new THREE.Vector2(); let down = [0, 0];
  const pick = (e: PointerEvent) => { const rc = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(mouse, camera);
    const c = ray.intersectObjects(covers)[0]; if (c) return { cover: (c.object as any).userData.book ?? (c.object.parent as any).userData.book };
    const p = ray.intersectObject(pts)[0]; return p?.index != null ? { i: p.index } : null; };
  renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener("pointerup", (e) => { if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const r = pick(e);
    if (r?.cover != null) location.href = `${BASE}${meta.books[r.cover].slug}/`; else if (r?.i != null) open(r.i, ""); });
  renderer.domElement.style.cursor = "grab";
  let wasRotating = true;
  renderer.domElement.addEventListener("pointerenter", () => { wasRotating = controls.autoRotate; controls.autoRotate = false; });
  renderer.domElement.addEventListener("pointerleave", () => { if (!focus) controls.autoRotate = wasRotating; $("tip").style.opacity = "0"; });
  renderer.domElement.addEventListener("pointerdown", () => (renderer.domElement.style.cursor = "grabbing"));
  renderer.domElement.addEventListener("pointermove", (e) => { const r = pick(e), tip = $("tip");
    renderer.domElement.style.cursor = r ? "pointer" : e.buttons ? "grabbing" : "grab";   // hand on anything clickable
    hover = r?.i ?? -1;   // no repaint on hover: a size pop on every dot crossed read as blinking
    clearTimeout(tipTimer); if (!r) { tipTimer = setTimeout(() => (tip.style.opacity = "0"), 180); return; } tip.style.display = "block"; tip.style.opacity = "1"; const rr = root.getBoundingClientRect(); tip.style.left = e.clientX - rr.left + 14 + "px"; tip.style.top = e.clientY - rr.top + 10 + "px";
    tip.textContent = r.cover != null ? `${meta.books[r.cover].title} · click to open the book` : `${meta.books[rows[r.i!][0]].title} · ${rows[r.i!][2]}`; });

  // search: meaning + exact words. With a server (bun server.ts) the query is embedded on the ANE there; on a static host
  // (GitHub Pages) the same EmbeddingGemma runs in the visitor's browser (ONNX q4, ~197 MB, fetched once on the first search,
  // then cached) and is ranked against the prebuilt vec768.i8. Measured 2026-11-20 on 80 heading queries over 812 passages:
  // browser q4 MRR 0.380 vs ANE 0.383, hit@5 0.512 both, top-10 overlap 0.88.
  let lastHits = "";
  const show = (q: string, hits: number[], how: string) => {
    if (!hits.length) { $("status").textContent = `Nothing found for "${q}"`; return; }
    lastHits = `<p class="meta" style="margin-top:16px">Results for "${esc(q)}" · ${hits.length} results · ${esc(how)}</p><div class="hits">${hits.map((i) => `<button data-i="${i}"><small style="color:${BOOKC[rows[i][0] % 6]}">${esc(meta.books[rows[i][0]].title)} · ${esc(rows[i][2])}</small><br>${esc(rows[i][4].slice(0, 110))}…</button>`).join("")}</div>`;
    open(hits[0], lastHits); focus = new Set(hits); focusMain = hits[0]; paint(); };
  const words = (q: string) => { const lq = q.toLowerCase(), h: number[] = []; rows.forEach((r: any, i: number) => { if ((r[3] + " " + r[4]).toLowerCase().includes(lq)) h.push(i); }); return h; };
  let webEmbed: Promise<(t: string) => Promise<Float32Array>> | null = null, V768: Promise<Int8Array> | null = null;
  const loadEmbed = (say: (s: string) => void) => (webEmbed ??= (async () => {
    const { AutoModel, AutoTokenizer } = await import("@huggingface/transformers");
    const ID = "onnx-community/embeddinggemma-300m-ONNX", got: Record<string, [number, number]> = {};
    const progress_callback = (p: any) => { if (p.status !== "progress" || !p.total) return; got[p.file] = [p.loaded, p.total];
      const [l, t] = Object.values(got).reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]); say(`loading the meaning model in your browser · ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB (once)`); };
    const tok = await AutoTokenizer.from_pretrained(ID);
    let model: any;
    try { if (!(navigator as any).gpu) throw 0; model = await AutoModel.from_pretrained(ID, { dtype: "q4", device: "webgpu", progress_callback }); }
    catch { model = await AutoModel.from_pretrained(ID, { dtype: "q4", device: "wasm", progress_callback }); }
    return async (t: string) => (await model(tok([t], { padding: true }))).sentence_embedding.data as Float32Array;
  })().catch((e) => { webEmbed = null; throw e; }));
  async function meaning(q: string, say: (s: string) => void) {
    const [embed, V] = await Promise.all([loadEmbed(say), (V768 ??= bin("vec768.i8", Int8Array))]);
    say("searching by meaning…");
    const v = await embed((meta.query_prompt || "task: search result | query: ") + q), d = meta.dim_full, s = new Float32Array(meta.n);
    for (let i = 0; i < meta.n; i++) { let a = 0; for (let j = 0, o = i * d; j < d; j++) a += V[o + j] * v[j]; s[i] = a; }
    return Array.from(s.keys()).sort((a, b) => s[b] - s[a]).slice(0, 30);
  }
  let seq = 0;
  $("f").addEventListener("submit", async (e) => { e.preventDefault(); const q = ($("q") as HTMLInputElement).value.trim(); if (!q) return;
    const my = ++seq;
    try { const r = await fetch(`${BASE}brain/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, k: 30 }) });
      if (!r.ok) throw 0; const j = await r.json();
      return show(q, [...new Set<number>([...(j.keyword || []), ...(j.hits || []).map((h: any) => h.i)])].slice(0, 30), j.vector_from); }
    catch {}
    const kw = words(q);
    if (!meta.dim_full) return show(q, kw.slice(0, 30), "exact words");
    if (kw.length) show(q, kw.slice(0, 30), "exact words · meaning results on the way");
    const say = (t: string) => { if (my === seq) $("status").textContent = t; };
    try { const m = await meaning(q, say); if (my !== seq) return; say("");
      show(q, [...new Set([...kw, ...m])].slice(0, 30), "meaning (EmbeddingGemma in your browser) + exact words"); }
    catch (err) { console.warn("meaning search", err); if (my === seq) { say("the meaning model could not load here; exact words only"); if (!kw.length) show(q, [], ""); } } });

  // separate / combined toggle: morph every point (and the lines riding on the same buffer) to the other layout in 1.4 s
  function setLayout(next: "sep" | "all") {
    if (next === layout) return; layout = next;
    morph = { from: xyz.slice(), to: next === "all" ? allXYZ : sepXYZ, t0: clock.getElapsedTime() };
    lgeo.setIndex(next === "all" ? pairsAll : pairsSep);
    covers.forEach((m) => (m.userData.home = next === "all" ? m.userData.allHome : m.userData.sepHome));
    root.querySelectorAll("[data-layout]").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.layout === next));
    $("seg")?.setAttribute("data-at", next);
    $("crossinfo") && ($("crossinfo").textContent = next === "all" ? `${(cross.length / 2).toLocaleString()} places where different books say the same thing · press ▶ Explore` : "each book in its own cloud");
  }
  root.querySelectorAll("[data-layout]").forEach((b) => b.addEventListener("click", () => setLayout((b as HTMLElement).dataset.layout as any)));
  $("crossinfo") && ($("crossinfo").textContent = "each book in its own cloud");
  // ▶ Explore: a tour over the cross-book links (two books saying the same thing), one pair every 5 s; any user click pauses it
  let tour: any = 0, tourAt = 0;
  const tourOrder = Array.from({ length: cross.length / 2 }, (_, k) => k).sort(() => Math.random() - 0.5);
  function tourStep() { const k = tourOrder[tourAt++ % tourOrder.length], a = cross[k * 2], b = cross[k * 2 + 1];
    open(a, `<p class="meta" style="margin-top:16px">Cross-book tour · ${tourAt}/${tourOrder.length} · a pair close in meaning</p><div class="hits"><button data-i="${b}"><small style="color:${BOOKC[rows[b][0] % 6]}">${esc(meta.books[rows[b][0]].title)} · ${esc(rows[b][2])}</small><br>${esc(rows[b][4].slice(0, 140))}…</button></div>`);
    focus = new Set([a, b, ...Array.from({ length: K }, (_, t) => knn[a * K + t])]); focusMain = a; paint(); }
  function stopTour() { clearInterval(tour); tour = 0; $("play").textContent = "▶ Explore"; $("play").classList.remove("on"); }
  $("play").onclick = (e) => { e.stopPropagation(); if (tour) return stopTour(); setLayout("all"); $("play").textContent = "⏸ Stop"; $("play").classList.add("on");
    setTimeout(tourStep, 900); tour = setInterval(tourStep, 5000); };
  renderer.domElement.addEventListener("pointerdown", () => tour && stopTour());
  // auto loop: the layout flips separate ↔ combined every 7 s and the switch floats, until the user does anything at all
  let flips = 0;   // auto loop runs 5 flips, then rests (Nat, 2026-11-20)
  let auto: any = setInterval(() => { setLayout(layout === "sep" ? "all" : "sep"); if (++flips >= 5) stopAuto(); }, 7000);
  $("seg")?.classList.add("auto");
  function stopAuto() { if (!auto) return; clearInterval(auto); auto = 0; $("seg")?.classList.remove("auto"); }
  root.addEventListener("pointerdown", stopAuto, { capture: true });
  addEventListener("keydown", stopAuto, { once: true });
  // test hook (UX state checks): project a point to page pixels, open a point, read state
  (window as any).__brain = { n: N, open: (i: number) => open(i, ""), state: () => ({ layout, auto: !!auto, panelOpen: $("panel").classList.contains("open"), focus: focus ? focus.size : 0, mode, hidden: hidden.size, autoRotate: controls.autoRotate }),
    project: (i: number) => { const v = new THREE.Vector3(xyz[i*3], xyz[i*3+1], xyz[i*3+2]).project(camera); const r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; } };
  const clock = new THREE.Clock();
  (function loop() { const t = clock.getElapsedTime();
    if (morph.t0 >= 0) { const u = Math.min(1, (t - morph.t0) / 1.4), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      for (let q = 0; q < xyz.length; q++) xyz[q] = morph.from[q] + (morph.to[q] - morph.from[q]) * e;
      geo.attributes.position.needsUpdate = true; geo.computeBoundingSphere(); if (u >= 1) morph.t0 = -1; if (focusMain >= 0) paint(); } uni.time.value = t; uni.emerge.value = Math.min(1, t / 2.2); uni.scale.value = renderer.domElement.clientHeight * 0.9;
    if (halo.visible) { halo.scale.setScalar(15 * (1 + 0.12 * Math.sin(t * 2.6)));
      pulses.forEach((p, n) => { const L = Math.max(1, pathTo.length), j = pathTo[n % L]; if (j == null) { p.visible = false; return; }
        const u = (t * 0.55 + Math.floor(n / L) / 3) % 1, e = u * u * (3 - 2 * u);
        p.position.set(xyz[focusMain*3] + (xyz[j*3] - xyz[focusMain*3]) * e, xyz[focusMain*3+1] + (xyz[j*3+1] - xyz[focusMain*3+1]) * e, xyz[focusMain*3+2] + (xyz[j*3+2] - xyz[focusMain*3+2]) * e);
        p.scale.setScalar(3.2 * Math.sin(Math.PI * u) + 0.4); p.material.opacity = Math.sin(Math.PI * u); p.material.color.copy(halo.material.color); }); } covers.forEach((m, k) => { const h = m.userData.home;   // glide to home (x, y, z) so covers travel with their cloud on separate ⇄ combined
      m.position.x += (h.x - m.position.x) * 0.06; m.position.z += (h.z - m.position.z) * 0.06;
      m.position.y += (h.y + Math.sin(t * 0.6 + k) * 1.2 - m.position.y) * 0.06; m.quaternion.copy(camera.quaternion);
      const e = m.userData.emph ?? 1; m.scale.setScalar(m.scale.x + (e - m.scale.x) * 0.1); });
    if (bookLine.visible && focusMain >= 0) { const c = covers.find((m) => m.userData.book === book[focusMain]); if (c) { const a = bookGeo.attributes.position.array as Float32Array;
      a.set([xyz[focusMain*3], xyz[focusMain*3+1], xyz[focusMain*3+2], c.position.x, c.position.y - 11 * c.scale.y, c.position.z]); bookGeo.attributes.position.needsUpdate = true; bookLine.computeLineDistances(); } }
    controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();
}
