# Design mockup guidance

This directory keeps durable, reviewed UI design references. It is not shipped
application code and does not establish ChatGPT-host acceptance.

- Treat `2026-10-07/` as the editable source for the current review-flow
  gallery, look-and-feel exploration, and focused-list reference.
- Change the source HTML or SVG directly. Do not edit a generated browser
  wrapper or a copy under `~/.codex/visualizations`.
- Keep every artifact standalone, UTF-8 encoded, fixture-only, and free of
  network, MCP, provider, basket, or account calls.
- Preserve the gallery's local click-through interactions when making visual
  changes. They are intentionally reversible and must not imitate a real
  Nemlig write.
- Test the changed state in a local browser at a narrow mobile width as well as
  the normal compact view. Confirm Danish characters render correctly.
- Serve the source folder for review with the command documented in its
  `README.md`. A cache-busting query parameter is appropriate after an edit.
- Design approval is input to later production work. Do not copy a mockup into
  the viewer or claim native ChatGPT behavior without the normal OpenSpec and
  application verification path.
