---
name: verification-before-completion
description: Use before claiming work is complete, fixed, or passing, or before committing/creating PRs; run or inspect complete relevant verification evidence and confirm its output
---

# Verification Before Completion

## Overview

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT VERIFIED EVIDENCE
```

Use evidence for the specific claim and changed scope. A completed check remains
useful while its relevant inputs are unchanged; rerun it after a relevant edit,
when its result is incomplete or failed, or when a concrete concern remains.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What check proves this specific claim at the changed scope?
2. RUN or INSPECT: Execute the complete, relevant check after the last relevant
   edit, or inspect valid evidence already produced for the same inputs. Track
   the command, working directory, revision and relevant working-tree state,
   running process/session, and result. A timeout or yielded tool call means the
   result is unknown or still running. Resume or inspect that process before
   retrying; do not start a duplicate until the original is confirmed stopped.
3. READ: Inspect its output and result; note failures or incomplete work.
4. VERIFY: Does the evidence support the claim, and only that claim?
   - If NO: State actual status with evidence and limits
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Starting duplicate verification while the original process may still be running
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run or inspected relevant evidence**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "A partial check proves the full claim" | It supports only the checked scope |
| "A timed-out check failed" | Its result is unknown until the process/output is inspected |
| Repeating a successful check before every status or delivery step | Reuse it while relevant inputs remain unchanged |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

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

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness
