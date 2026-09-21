---
name: functional-refactoring-compact
description: Functional-core refactoring with thin effectful boundaries.
---

# Functional refactoring

Trace the real entry point, callers, effects, published behavior, and concrete
maintenance cost first. Extract deterministic calculations only when the seam
enables meaningful no-I/O tests or removes coupling; keep I/O, authentication,
provider calls, persistence, retries, and mutation at explicit boundaries.

Do not add a functional library for style or speculative reuse. Preserve
ordering, validation, error behavior, request budgets, ownership, and safety.
Characterize behavior, make one focused change at a time, then run the focused
check and final `pnpm verify`. Report code and dependency impact.
