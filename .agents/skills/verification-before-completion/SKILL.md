---
name: verification-before-completion
description: Use before completion claims or PR handoff; apply the canonical Definition of Done and conditional independent review guidance.
---

# Verification Before Completion

Apply [Definition of Done](../../instructions/definition-of-done.md) for
verification scope, evidence reuse, running checks, and reporting. This skill
adds no separate test suite or gate.

## Independent challenge review

For significant deletion, architectural restructuring, or a change whose safety
depends on uncertain consumers or non-obvious invariants, seek one focused,
read-only review from an independent reviewer when one is available. Give it
the original task, actual diff, relevant source/contracts, and verification
evidence. Ask:

> Find the strongest evidence-backed reason this change should be revised or
> reverted. What behavior, consumer, invariant, or maintenance property would
> be better protected by the previous implementation? Could the intended
> improvement be achieved with a smaller change?

The reviewer should inspect relevant contracts, describe concrete failure
scenarios or tradeoffs, separate supported findings from hypotheses, recommend
the smallest useful correction, and state when no material objection is
supported. Do not manufacture criticism from style preferences or speculative
future needs. Resolve supported findings, investigate material uncertainty,
and explain evidence-based disagreements; do not apply suggestions
mechanically. One pass is enough unless a material revision creates a new risk
or leaves an identified risk unresolved. This does not apply to routine local
edits. If no independent reviewer is available for a change that warrants one,
continue with available evidence and state that limitation.
