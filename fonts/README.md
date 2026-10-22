ascii-rest-mono.woff2 — the 3 KB subset of [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (SIL Open Font License 1.1) that ascii.rest serves, covering only the box-drawing, block and bullet glyphs its pieces use.

Vendored so 苍绿之眼 pages draw them locally instead of fetching from ascii.rest, and so Android, whose system monospace has none of these glyphs, still draws every row at one width. Fetched from https://ascii.rest/fonts/ascii-rest-mono.woff2.
