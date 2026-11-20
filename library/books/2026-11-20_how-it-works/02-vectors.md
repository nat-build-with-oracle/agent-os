# Chapter 2: Vectors on the Neural Engine

## Passages

At build time `scripts/brain.py` cuts every chapter into passages of a few hundred characters. A passage never crosses a chapter, and each one remembers its book, its chapter and the section heading it sits under. Code blocks and image lines are left out, because they carry little meaning on their own.

## Embedding

Each passage is turned into a vector by EmbeddingGemma through a local embedding server that runs the model on the Apple Neural Engine. The vectors are cached by the passage text, so a rebuild only embeds what changed.

## What gets written

The build writes small static files: the 3D positions, the book of every passage, its four nearest neighbours in meaning, the passage texts, and the vectors themselves in two sizes. The 256-dimension copy feeds the map; the full 768-dimension copy feeds search, which ranks better.
