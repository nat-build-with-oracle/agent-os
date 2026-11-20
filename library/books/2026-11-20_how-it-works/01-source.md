# Chapter 1: Chapters stay the source

## One file, two renderings

A book is a folder named `YYYY-MM-DD_slug`. Inside it, `OUTLINE.md` gives the title, the subtitle and the parts, and each chapter is a markdown file named `NN-slug.md`. The site reads those files where they are. It never copies them, so a fix in a chapter shows up in the site and in any PDF built from the same files.

## Parts and order

The parts come from the `## Part …` lines in `OUTLINE.md`, and the chapters inside a part from the `### Chapter N` lines under it. A chapter that no part claims still appears, in a group of its own, so nothing goes missing.

## Pictures

A paragraph that holds only an image becomes a figure with its alt text as the caption. Every figure gets the same frame width as the text column, so pictures line up with code blocks and with each other.
