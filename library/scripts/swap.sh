#!/bin/sh
# Atomic, serialized publish of a fresh build: one build at a time (mkdir lock), and the running server never sees a
# missing dist/ (2026-11-20: two overlapping builds raced their mv's and left no dist/ -> site 404).
set -e
cd "$(dirname "$0")/.."
until mkdir .build.lock 2>/dev/null; do sleep 1; done
trap 'rmdir .build.lock' EXIT
astro build --outDir dist-next
rm -rf dist-old
[ -d dist ] && mv dist dist-old
mv dist-next dist
rm -rf dist-old
