// Book list, parts and chapter order come from each book's OUTLINE.md — the same file its PDF build reads.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getCollection, render } from "astro:content";

import cfg from "../../library.config.mjs";

const ROOT = path.resolve(cfg.booksDir);
export const BASE = cfg.base.endsWith("/") ? cfg.base : cfg.base + "/";
export const url = (p: string) => BASE + p.replace(/^\//, "");

export type Chapter = { id: string; file: string; num: string; title: string; short: string; href: string };
export type Part = { title: string; chapters: Chapter[] };
export type Book = {
  slug: string; dir: string; date: string; title: string; subtitle: string;
  pages: number | null; parts: Part[]; foreword: Chapter | null; chapters: Chapter[];
  pdf: string | null; cover: string; words: number;
};

function front(text: string, key: string) {
  return text.match(new RegExp(`^${key}: "?(.+?)"?\\s*$`, "m"))?.[1] ?? "";
}

function pdfPages(pdf: string): number | null {
  if (!fs.existsSync(pdf)) return null;   // PDFs are optional
  try { return Number(execFileSync("pdfinfo", [pdf]).toString().match(/Pages:\s+(\d+)/)?.[1]) || null; }
  catch { return null; }
}

let cache: Book[] | null = null;

export async function books(): Promise<Book[]> {
  if (cache) return cache;
  const entries = await getCollection("chapters");
  const out: Book[] = [];
  for (const dir of fs.readdirSync(ROOT).filter((d) => /^\d{4}-\d{2}-\d{2}_/.test(d)).sort()) {
    const outlinePath = path.join(ROOT, dir, "OUTLINE.md");
    if (!fs.existsSync(outlinePath)) continue;
    const slug = dir.replace(/^\d{4}-\d{2}-\d{2}_/, "");
    const outline = fs.readFileSync(outlinePath, "utf8");
    if (front(outline, "title").includes("{{")) continue; // scaffold still holding template text
    if (!fs.readdirSync(path.join(ROOT, dir)).some((f) => /^\d\d-.*\.md$/.test(f))) continue; // no chapters written yet
    const mine = entries.filter((e) => e.id.startsWith(slug + "/")).sort((a, b) => a.id.localeCompare(b.id));
    const chapters: Chapter[] = [];
    let words = 0;
    for (const e of mine) {
      const { headings } = await render(e);
      const file = e.id.split("/")[1];
      const num = file.slice(0, 2);
      const title = headings.find((h) => h.depth === 1)?.text ?? file;
      words += (e.body ?? "").split(/\s+/).filter(Boolean).length;
      chapters.push({ id: e.id, file, num, title, short: title.replace(/^บทที่ \d+:\s*/, ""), href: url(`${slug}/${file}/`) });
    }
    const byNum = new Map(chapters.map((c) => [c.num, c]));
    const parts: Part[] = [];
    const placed = new Set<string>();
    for (const line of outline.split("\n")) {
      const p = line.match(/^## ((?:ภาค|Part|ภาคผนวก).*?)\s*$/);
      if (p) {
        const title = p[1].replace(/\s*\(.*$/, "").replace(/\s+—\s+\d\d-[\w-]+\.md.*$/, "");
        parts.push({ title, chapters: [] });
        const appendix = p[1].match(/(\d\d)-[\w-]+\.md/);
        if (appendix && byNum.has(appendix[1])) { parts.at(-1)!.chapters.push(byNum.get(appendix[1])!); placed.add(appendix[1]); }
        continue;
      }
      const c = line.match(/^### (?:บทที่|Chapter) (\d+)/);
      if (c && parts.length) {
        const n = c[1].padStart(2, "0");
        if (byNum.has(n)) { parts.at(-1)!.chapters.push(byNum.get(n)!); placed.add(n); }
      }
    }
    const foreword = byNum.get("00") ?? null;
    if (foreword) placed.add("00");
    const rest = chapters.filter((c) => !placed.has(c.num));
    if (rest.length) parts.push({ title: "Other", chapters: rest });
    out.push({
      slug, dir, date: dir.slice(0, 10), title: front(outline, "title"), subtitle: front(outline, "subtitle"),
      pages: pdfPages(path.join(ROOT, dir, "book.pdf")), parts, foreword, chapters, words,
      pdf: fs.existsSync(path.join(ROOT, dir, "book.pdf")) ? url(`pdf/${slug}.pdf`) : null, cover: url(`covers/${slug}.png`),
    });
  }
  cache = out;
  return out;
}
