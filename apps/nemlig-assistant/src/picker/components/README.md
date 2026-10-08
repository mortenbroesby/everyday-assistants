# Viewer component suite

This is the private React component library for the Nemlig Assistant picker.
It owns reusable viewer presentation only: native controls, product summaries,
supplied factual disclosures, navigation, outcome/entry surfaces, and layout helpers.

Components receive server-owned snapshots and callbacks. They must not call MCP
tools, fetch providers, own review membership/quantity/revision state, or
weaken the protected submission boundary. Export reusable components through
`index.ts`; keep page-specific orchestration in `product-viewer.tsx`.

The suite uses Emotion styles co-located with the components in their TypeScript
files, plus host CSS variables for theming. Its runtime style injection is
intentional for this self-contained picker; keep it free of user-supplied CSS
values and external stylesheet fetches.

It remains inside the picker until a second runtime consumer demonstrates that a
workspace package would reduce duplication rather than add packaging overhead.
