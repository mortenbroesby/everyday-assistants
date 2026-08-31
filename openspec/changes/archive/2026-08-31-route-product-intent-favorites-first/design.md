## Context

The existing `plan_shopping_list` path already implements favorites-first resolution, catalog fallback, ambiguity handling, and non-mutating discovery. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**

- Make the existing planner the documented default for ordinary product intent.
- Keep explicit source-specific discovery available.

**Non-Goals:**

- Add another resolver, tool, ranking model, or mutation path.

## Decisions

1. **Route through server guidance and current tool descriptions.** This changes client-facing intent guidance while reusing the implemented planner. A new composite tool was rejected because it would duplicate planner behavior.
2. **Protect the routing contract with one focused interface test.** Testing the exposed instructions and descriptions is sufficient because the planner's favorites-first behavior already has direct coverage.

## Risks / Trade-offs

- [A client ignores server guidance] → Keep each tool description explicit so routing intent is visible in both MCP instruction surfaces.
- [Guidance drifts from planner behavior] → Retain the existing planner tests and the focused routing contract test.
