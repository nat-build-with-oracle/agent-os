#!/usr/bin/env bun
// library-brain MCP (stdio): the library's prebuilt vectors as tools for Claude Code on this Mac.
// Static data only: dist/brain/data/* written by scripts/brain.py at build time. The one live call is embedding the QUERY
// on the Apple Neural Engine through Chippy (127.0.0.1:11435); when Chippy is down, search falls back to exact words.
// Local only: stdio, no network listener. If your books are private, keep it that way: do not expose it as a remote connector.
//   claude mcp add library-brain -- bun /absolute/path/to/library-brain/mcp.ts      (run `bun run build` first)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "node:path";

const DATA = join(import.meta.dir, "dist", "brain", "data");
const CHIPPY = process.env.CHIPPY_URL || "http://127.0.0.1:11435";
const MODEL = process.env.CHIPPY_MODEL || "embeddinggemma:ane-w8a16";
const meta: any = await Bun.file(join(DATA, "meta.json")).json();
const rows: [number, string, string, string, string][] = await Bun.file(join(DATA, "passages.json")).json();
const FULL = await Bun.file(join(DATA, "vec768.i8")).exists();
const vec = new Int8Array(await Bun.file(join(DATA, FULL ? "vec768.i8" : "vec.i8")).arrayBuffer());
if (FULL) { meta.dim = meta.dim_full; meta.scale = meta.scale_full; }   // search on the full 768-d vectors
const knn = new Uint32Array(await Bun.file(join(DATA, "knn.u32")).arrayBuffer());
const lower = rows.map((r) => `${r[3]} ${r[4]}`.toLowerCase());

async function embed(q: string): Promise<Float32Array | null> {
  try {
    const r = await fetch(`${CHIPPY}/api/embed`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: `${meta.query_prompt}${q}` }), signal: AbortSignal.timeout(5000) });
    const v: number[] | undefined = ((await r.json()) as any)?.embeddings?.[0];
    if (!Array.isArray(v)) return null;
    const out = new Float32Array(meta.dim); let s = 0;
    for (let d = 0; d < meta.dim; d++) { out[d] = v[d]; s += v[d] * v[d]; }
    s = Math.sqrt(s) || 1; for (let d = 0; d < meta.dim; d++) out[d] /= s;
    return out;
  } catch { return null; }
}
const fmt = (i: number, score?: number) => {
  const [b, f, chap, sec, text] = rows[i];
  return { id: i, book: meta.books[b].title, book_slug: meta.books[b].slug, chapter: chap, chapter_file: f, section: sec,
    url: `/${meta.books[b].slug}/${f}/`, ...(score != null ? { score: +score.toFixed(4) } : {}), text };
};

const server = new McpServer({ name: "library-brain", version: "0.1.0" });

server.registerTool("library_books", { description: "List the books in the library brain (title, slug, passage count) and when the vectors were built.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: JSON.stringify({ built: meta.built, model: meta.model, dim: meta.dim, passages: meta.n,
    books: meta.books.map((b: any) => ({ title: b.title, slug: b.slug, passages: b.count })) }, null, 2) }] }));

server.registerTool("library_search", {
  description: "Search every passage of every book by meaning (query embedded on the Apple Neural Engine, cosine over prebuilt 256-d vectors) plus exact-word matches. Thai or English.",
  inputSchema: { query: z.string().min(1), k: z.number().int().min(1).max(50).default(8), book: z.string().optional().describe("optional book slug to search inside") },
}, async ({ query, k, book }) => {
  const b = book ? meta.books.find((x: any) => x.slug === book) : null;
  const lo = b ? b.start : 0, hi = b ? b.start + b.count : meta.n;
  const q = await embed(query);
  let hits: { i: number; s: number }[] = [];
  if (q) {
    for (let i = lo; i < hi; i++) { let s = 0; const o = i * meta.dim; for (let d = 0; d < meta.dim; d++) s += vec[o + d] * q[d]; hits.push({ i, s: s / meta.scale }); }
    hits.sort((a, c) => c.s - a.s); hits = hits.slice(0, k);
  }
  const lq = query.toLowerCase(); const words: number[] = [];
  for (let i = lo; i < hi && words.length < k; i++) if (lower[i].includes(lq)) words.push(i);
  return { content: [{ type: "text", text: JSON.stringify({ vector_from: q ? `ANE via Chippy (${MODEL})` : "none: Chippy down, exact words only",
    meaning: hits.map((h) => fmt(h.i, h.s)), exact_words: words.map((i) => fmt(i)) }, null, 2) }] };
});

server.registerTool("library_neighbours", {
  description: "The 4 passages nearest in meaning to a passage id (from library_search), across all books.",
  inputSchema: { id: z.number().int().min(0) },
}, async ({ id }) => {
  if (id >= meta.n) return { isError: true, content: [{ type: "text", text: `id must be < ${meta.n}` }] };
  return { content: [{ type: "text", text: JSON.stringify({ passage: fmt(id), nearest: Array.from({ length: meta.k }, (_, t) => fmt(knn[id * meta.k + t])) }, null, 2) }] };
});

server.registerTool("library_chapter", {
  description: "Read every passage of one chapter in order (book slug + chapter file name like 04-settings-devices).",
  inputSchema: { book: z.string(), chapter_file: z.string() },
}, async ({ book, chapter_file }) => {
  const b = meta.books.findIndex((x: any) => x.slug === book);
  const ids = rows.map((r, i) => (r[0] === b && r[1] === chapter_file ? i : -1)).filter((i) => i >= 0);
  if (!ids.length) return { isError: true, content: [{ type: "text", text: "no such book/chapter (see library_books / library_search results)" }] };
  return { content: [{ type: "text", text: `${rows[ids[0]][2]}\n\n` + ids.map((i) => (rows[i][3] ? `## ${rows[i][3]}\n` : "") + rows[i][4]).join("\n\n") }] };
});

await server.connect(new StdioServerTransport());
