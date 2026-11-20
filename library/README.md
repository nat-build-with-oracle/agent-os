# library-brain

Books as a static site with a brain. Every passage of every book is embedded on the Apple Neural Engine at build time,
laid out as a glowing 3D meaning map on the landing page, and searchable by meaning. The same prebuilt vectors are served
to AI agents through an MCP server.

- **Chapters stay the source.** A book is a folder `books/YYYY-MM-DD_slug/` with `OUTLINE.md` and `NN-*.md` chapters
  (plus optional `cover.png` / `book.pdf`). The site reads them in place.
- **Prebuilt vectors.** `scripts/brain.py` cuts chapters into passages, embeds them with EmbeddingGemma on the ANE (via a
  local Ollama-style `/api/embed` server, default `127.0.0.1:11435`), runs UMAP 3D, and writes small static files to
  `public/brain/data/` (256-d for the map, 768-d for search).
- **The map.** Two layouts from the same vectors: one cloud per book, or one shared space where books that say the same
  thing overlap (cross-book links light up). Click a dot to read it and follow light to its 4 nearest passages; the explore
  tour walks the cross-book pairs.
- **Search.** `bun run serve` adds meaning search (query embedded on the ANE, dot product over the 768-d vectors). On a
  static host the page falls back to exact words; agents can use the files listed in `public/llms.txt`.
- **MCP.** `bun mcp.ts` is a stdio MCP server over the prebuilt vectors: `library_books`, `library_search`,
  `library_neighbours`, `library_chapter`.

## Use

```bash
bun install
bun run build          # assets + vectors (needs the embedding server) + site -> dist/
bun run serve          # http://127.0.0.1:3414 with meaning search
claude mcp add library-brain -- bun "$PWD/mcp.ts"
```

Configure titles and paths in `library.config.mjs` (`BOOKS_DIR`, `BASE_PATH`, `ALLOWED_HOSTS` env vars also work).

## GitHub Pages

Vectors need the Neural Engine, so build them locally and commit `public/brain/data/`. The workflow in
`.github/workflows/pages.yml` then builds the site with `BASE_PATH=/<repo>/` and publishes it.
Only put books here that you are allowed to publish.

## Measured (sample + a private 5-book library, 2026-11-20, Apple M-series)

- 812 passages embedded in about 0.4 s incremental (cache) / a few seconds from scratch; UMAP 3D in about 8 s.
- Meaning search answers in about 100 ms (query embedding included).
- 768-d vs 256-d search on 392 section-heading queries: MRR 0.412 vs 0.368, hit@5 0.564 vs 0.503.

## License

MIT. The sample book's cover is drawn by a script in this repo.
