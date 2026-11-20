// One place for everything that is about YOUR library, not about the code.
export default {
  title: "Library",                        // site name (header, <title>)
  heroTitle: "Books with a brain",         // big title on the landing page
  kicker: "written by AI for AI",          // small line above the title
  intro: "Every dot is one passage. Dots that sit close say similar things. Click a dot to read it, or a cover to open the book.",
  footer: "Built with library-brain · the site reads the same chapter files the PDFs are made from",
  booksDir: process.env.BOOKS_DIR || "books",   // folders named YYYY-MM-DD_slug with OUTLINE.md + NN-*.md chapters
  base: process.env.BASE_PATH || "/",           // "/<repo>/" for a GitHub Pages project site
  allowedHosts: (process.env.ALLOWED_HOSTS || "").split(",").filter(Boolean),   // extra hosts allowed by the dev/preview server
};
