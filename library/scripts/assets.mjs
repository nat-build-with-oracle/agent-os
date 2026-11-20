// Copies each book's PDF (optional) and its cover into public/: cover = <book>/cover.png, else page 1 of <book>/book.pdf.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import cfg from "../library.config.mjs";

const root = path.resolve(cfg.booksDir);
const pub = path.resolve("public");
for (const d of ["pdf", "covers"]) fs.mkdirSync(path.join(pub, d), { recursive: true });
for (const dir of fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}_/.test(d)).sort()) {
  const slug = dir.replace(/^\d{4}-\d{2}-\d{2}_/, "");
  const pdf = path.join(root, dir, "book.pdf"), cover = path.join(root, dir, "cover.png");
  if (fs.existsSync(pdf)) fs.copyFileSync(pdf, path.join(pub, "pdf", `${slug}.pdf`));
  if (fs.existsSync(cover)) fs.copyFileSync(cover, path.join(pub, "covers", `${slug}.png`));
  else if (fs.existsSync(pdf)) execFileSync("pdftoppm", ["-png", "-r", "72", "-f", "1", "-l", "1", "-singlefile", pdf, path.join(pub, "covers", slug)]);
  console.log("assets", slug);
}
