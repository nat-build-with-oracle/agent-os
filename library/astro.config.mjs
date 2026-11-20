// library-brain: Astro static + MDX + Tailwind 4. Deploy dist/ anywhere static (GitHub Pages: set BASE_PATH=/<repo>/).
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import rehypeFigure from "./src/lib/rehype-figure.mjs";
import cfg from "./library.config.mjs";

export default defineConfig({
  output: "static",
  base: cfg.base,
  integrations: [mdx()],
  markdown: { rehypePlugins: [rehypeFigure] },
  server: { host: "127.0.0.1", port: 3414, allowedHosts: cfg.allowedHosts },
  vite: { plugins: [tailwindcss()] },
});
