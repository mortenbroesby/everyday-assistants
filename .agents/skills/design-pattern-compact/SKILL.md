---
name: design-pattern-compact
description: Evidence-based GoF pattern selection for this repository.
---

# Design patterns

Use a GoF pattern only when a demonstrated recurring design problem needs it.
Start from the concrete callers, effects, and tests; prefer direct composition,
plain functions, and existing repository conventions. Name the problem the
pattern solves, alternatives rejected, and the added maintenance cost.

Do not introduce a pattern for one implementation, speculative extensibility,
or vocabulary alone. Preserve public behavior, safety, failure handling,
performance, and test seams. Verify the focused path and the final repository
gate; report when a pattern is not justified.
