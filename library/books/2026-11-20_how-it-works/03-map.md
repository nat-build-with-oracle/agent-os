# Chapter 3: The map and the search

## Two layouts from the same vectors

UMAP turns the vectors into a 3D layout. The page offers two views of it. Separate gives each book its own cloud with its cover floating above it. Combined puts every book into one shared space, so books that talk about the same thing land on top of each other, and lines appear between passages of different books that mean nearly the same.

## Clicking and exploring

Clicking a dot opens the passage, lights up its four nearest neighbours and sends light along the paths between them. The explore button walks through the cross-book pairs one by one. Any click hands control back to you.

## Searching

With the small local server running, a query is embedded the same way as the passages and compared with every vector. On a plain static host there is no server, so the page falls back to matching exact words. The same prebuilt vectors are also served to AI agents through a local MCP server.
