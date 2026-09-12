# Agent routing evaluation

This record tests whether the repository's agent guidance is easier to navigate
without pretending that a documentation check proves end-to-end agent quality.
It compares the `origin/main` baseline, the first implementation on PR #38, and
the simplified revision.

## Design inputs

The owner-provided scheduled AI briefs from 9–11 September 2026 emphasized five
relevant practices: keep model selection outside repository policy, prefer
native Git/worktree isolation, load tools and skills only when relevant, enforce
mechanical behavior with deterministic checks, and judge changes by whole-task
outcomes rather than prompt or token size alone.

Two primary references support the durable parts of that direction:

- [AGENTS.md](https://agents.md/) defines a schema-free Markdown convention,
  recommends nested files for large repositories, and gives the closest file
  precedence within its scope.
- [GitHub's guidance for effective repository instructions](https://docs.github.com/en/copilot/tutorials/optimize-ai-usage)
  recommends short, specific, repository-grounded guidance and deterministic
  tests or linters for behavior that can actually be checked.

## Static comparison

Measurements use UTF-8 bytes and physical lines. The shared Definition of Ready
and Definition of Done total 84 lines and 5,351 bytes; they are excluded from
all three rows because each design requires the same gates.

| Design | Routing entry set | Lines | Bytes | Result |
| --- | --- | ---: | ---: | --- |
| `origin/main` baseline | root `AGENTS.md` | 86 | 5,723 | Compact, but no direct route to OpenSpec stages, roadmap triage, or specialized refactoring guidance |
| First PR #38 design | root + mandatory workflow + JSON manifest | 495 | 21,753 | Explicit coverage, but four hops and a validator that proves catalog consistency rather than navigation quality |
| Revised PR #38 design | root `AGENTS.md` | 96 | 6,078 | Twelve direct intent rows and fifteen valid links with no parser or manifest |

The revision adds 355 bytes (6.2%) to the baseline root while cutting the first
PR design's routing entry by 399 lines (81%) and 15,675 bytes (72%). The removed
manifest checker and its tests eliminate another 423 lines of maintenance code.

## Representative route check

Root guidance and the two lifecycle gates apply to every repository task. The
table lists only the additional file an agent should load for each example.

| Representative task | Expected additional guidance | Unrelated skills required |
| --- | --- | ---: |
| Edit ordinary repository documentation | nearest scoped `AGENTS.md`, if any | 0 |
| Explore a feature before committing to it | `.agents/skills/openspec-explore/SKILL.md` | 0 |
| Propose a non-trivial feature | `.agents/skills/openspec-propose/SKILL.md` | 0 |
| Revise an existing OpenSpec plan | `.agents/skills/openspec-update-change/SKILL.md` | 0 |
| Implement an approved OpenSpec change | `.agents/skills/openspec-apply-change/SKILL.md` | 0 |
| Identify parked work and recommend the next epic | `.agents/skills/roadmap-triage/SKILL.md` | 0 |
| Simplify working code without changing behavior | `.agents/skills/code-simplification/SKILL.md` | 0 |
| Work on Nemlig production readiness | `apps/nemlig-assistant/AGENTS.md` and its `nemlig-production` skill | 0 |
| Search or change a Nemlig basket | `apps/nemlig-assistant/AGENTS.md` and its `nemlig-basket` skill | 0 |

A focused link audit resolved all fifteen relative links in root `AGENTS.md` and
the app-local skill index. A separate search found no named runtime persona in
the active routing guidance. These checks should be rerun when routes change;
they do not justify a permanent validation framework today.

## What this proves

- Common tasks have a direct, human-readable route.
- Scoped work loads only the relevant local contract and skill.
- The revised entry point stays near the baseline size and is substantially
  smaller than the rejected manifest design.
- The route targets existed at the reviewed revision.

## What this does not prove

Static route coverage does not prove that an agent will follow instructions or
complete a task better. Over the next real epics, note task success, human
interventions, avoidable tool retries, elapsed time, and total cost. Change the
guidance again only when those observations reveal a recurring failure that a
repository instruction or skill can plausibly fix.
