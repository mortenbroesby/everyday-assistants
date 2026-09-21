---
name: code-simplification-compact
description: Evidence-led behavior-preserving simplification for this repository.
---

# Simplify safely

Use this only when the request is a behavior-preserving simplification. First
trace callers, effects, error paths, tests, and the reason for the existing
shape. Prefer deletion, reuse, and clear names over new abstractions; do not
optimize for line count or change public behavior, ordering, validation,
accessibility, retries, or safety boundaries.

Work in small reviewable slices. Establish characterization coverage before a
non-trivial refactor, run the narrowest focused check after each slice, and run
the final repository gate once. If a simplification requires changing a test,
weakening error handling, or adding a dependency, stop and reassess. Report
what behavior was preserved, the code/dependency delta, checks passed, and any
uncertainty.
