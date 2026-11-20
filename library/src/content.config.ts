// One source: every book's chapters, read in place from <booksDir>/<date>_<slug>/NN-*.md (never copied).
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import cfg from "../library.config.mjs";

const chapters = defineCollection({
  loader: glob({
    base: cfg.booksDir,
    pattern: "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_*/[0-9][0-9]-*.md",
    generateId: ({ entry }) => entry.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}_/, ""),
  }),
});

export const collections = { chapters };
