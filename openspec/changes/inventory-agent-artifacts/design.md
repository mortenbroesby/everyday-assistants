## Context

Repository guidance is split across a root instruction file, a Nemlig-scoped
instruction file, two lifecycle gates, nine root skills, and two app-local
skills. These sources are useful in isolation, but no catalog describes their
scope, prerequisites, or task triggers. Root guidance also carries detailed
delivery mechanics that obscure its role as the entry point.

## Goals / Non-Goals

**Goals:**

- Make root guidance a concise, deterministic router.
- Inventory every maintained instruction and skill without duplicating its body.
- Detect missing paths, invalid relationships, unsafe paths, and unregistered
  guidance in the existing CI gate.
- Preserve the current instruction precedence and every authority boundary.

**Non-Goals:**

- Selecting or executing skills in code, standardizing external agent runtimes,
  cataloging every archived OpenSpec artifact individually, or adding review or
  deployment automation.

## Decisions

### Use JSON metadata and Markdown contracts

`.agents/manifest.json` is the single inventory and routing index. JSON is
machine-readable with the Node standard library, while the existing Markdown
files remain the authoritative contracts. Manifest metadata only supports
discovery: it cannot override instructions or grant authority.

Each artifact has a stable id, kind, repository-relative path, scope, and short
use condition. Relationships refer to ids. Named routes cover ordinary work,
the OpenSpec lifecycle, the explicit refactoring skills, and the distinct
Nemlig repository, production, and basket-operation paths.

The inventory also justifies two new skills. `roadmap-triage` consolidates the
repeated evidence-gathering needed to distinguish shipped, active, parked,
blocked, and stale work before recommending one next epic. `agent-artifact-
maintenance` provides the safe change procedure for this manifest and its
guidance. An `epic-delivery` skill is rejected because the mandatory repository
workflow already owns that contract; duplicating it would create drift.

### Keep the root router small without weakening policy

The root file retains mandatory readiness/completion gates, task selection,
instruction precedence, universal approval and safety boundaries, and the
manifest entry point. Detailed worktree, coordination, verification, release,
integration, and cleanup rules move verbatim or equivalently into a mandatory
`.agents/instructions/repository-workflow.md` entry.

More-specific applicable instructions add requirements. They do not replace
higher-priority platform or user instructions, and no repository artifact
authorizes secrets, costs, destructive actions, external data changes,
production mutation, or Nemlig basket mutation.

### Validate the catalog, not agent behavior

A dependency-free Node checker validates the schema, unique identities and
paths, safe repository-relative paths, existing tracked targets, relationships,
cycles, and skill frontmatter. It also discovers tracked `AGENTS.md`,
`CLAUDE.md`, instruction files, and `SKILL.md` files and rejects catalog drift.
It does not interpret natural-language triggers or attempt runtime dispatch.

## Risks / Trade-offs

- [Policy is lost while shortening root guidance] -> compare each original rule
  with the root router or mandatory workflow destination and review the final
  diff explicitly.
- [The manifest becomes another stale index] -> filesystem discovery runs in
  `pnpm verify` and fails on unregistered maintained guidance.
- [Routes imply authorization] -> state in both root guidance and manifest that
  selection is informational and cannot grant authority.
- [The catalog becomes too detailed] -> inventory guidance individually but use
  collection entries for pattern references, canonical specs, and change
  history.
- [New skills restate mandatory policy] -> keep them task-specific, reference
  root authority, and omit a general epic-delivery skill.

## Migration Plan

1. Add the manifest and focused validator tests.
2. Extract detailed repository workflow guidance and reduce root guidance to a
   router that requires it.
3. Make Nemlig routing distinguish repository, production, and basket work, and
   repair affected local references.
4. Run focused validation, strict OpenSpec validation, privacy checks, and the
   final repository gate.
5. Open a PR at the verified branch head and wait for explicit approval before
   merge. No production action is applicable.
