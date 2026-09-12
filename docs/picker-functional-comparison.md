# Picker Functional Comparison Decision Record

The picker comparison proof of concept is retired. Its complete research and
measured results remain in closed [PR #36](https://github.com/mortenbroesby/everyday-assistants/pull/36);
that pull request is the historical record rather than executable code in the
current product branch.

The production picker remains native TypeScript and React. The fp-ts and
Remeda candidates, their comparison-only builds, tests, scripts, and showcase
controls were removed because they do not exercise the server-side lifecycle
problem now under evaluation.

Effect 3.22.2 is used only for the whole-list product-discovery coordinator.
The follow-up evaluation in PR #40 selected it for production because fatal
failure and cancellation stop queued reads and await active-read quiescence.
Duplicate coalescing remains a separate plain-TypeScript concern. No picker
code imports Effect.
