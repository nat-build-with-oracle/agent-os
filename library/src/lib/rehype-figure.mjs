// A paragraph holding only one image becomes <figure> + <figcaption> (the alt text).
// Every picture then sits in the same full-width frame, aligned with code blocks and text.
export default function rehypeFigure() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type === "element" && child.tagName === "p") {
          const kids = child.children.filter((k) => !(k.type === "text" && !k.value.trim()));
          if (kids.length === 1 && kids[0].type === "element" && kids[0].tagName === "img") {
            const img = kids[0];
            const alt = String(img.properties?.alt ?? "").trim();
            const figure = { type: "element", tagName: "figure", properties: {}, children: [img] };
            if (alt) figure.children.push({ type: "element", tagName: "figcaption", properties: {}, children: [{ type: "text", value: alt }] });
            return figure;
          }
        }
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}
