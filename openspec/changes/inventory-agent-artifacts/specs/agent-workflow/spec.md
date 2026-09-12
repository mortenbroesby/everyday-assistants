## ADDED Requirements

### Requirement: Repository agent artifacts have one discoverable inventory

The repository SHALL maintain one machine-readable manifest that inventories
every maintained agent instruction and skill with a stable identity, path,
scope, kind, and use condition. Supporting reference collections and workflow
surfaces MAY be represented as collection-level entries instead of enumerating
historical files individually. The manifest MUST identify Markdown instruction
and skill bodies as authoritative and MUST NOT grant authority to perform an
action.

#### Scenario: An agent discovers available guidance

- **WHEN** an agent starts a repository task from the root instructions
- **THEN** it can use the manifest to discover every maintained instruction and
  skill without already knowing their paths

#### Scenario: Metadata conflicts with an instruction

- **WHEN** manifest metadata and an applicable instruction disagree
- **THEN** the instruction and higher-priority user or platform authority apply
  and the manifest grants no additional permission

### Requirement: Root guidance routes by scope and task intent

The root agent instructions SHALL require the readiness, repository workflow,
and completion instructions for repository work, define how more-specific
scoped instructions compose, and direct agents to load only manifest routes
that match the current task. Unknown tasks MUST fall back to root workflow and
the nearest scoped instructions rather than loading every skill.

#### Scenario: Nemlig production repository work is selected

- **WHEN** a task concerns Nemlig production readiness or deployment
- **THEN** the agent loads the root workflow, Nemlig-scoped instructions, and
  production skill without treating that selection as provider authorization

#### Scenario: Basket work is selected

- **WHEN** a task concerns Nemlig search, review, or a basket operation
- **THEN** the agent also loads the basket skill and retains its distinct
  mutation approval boundary

#### Scenario: No specialized route matches

- **WHEN** a repository task does not match a specialized route
- **THEN** the agent uses the universal workflow and nearest scoped instruction
  without loading unrelated skills

### Requirement: Manifest drift fails the existing verification gate

The repository SHALL validate the agent manifest with no new runtime dependency
as part of its existing verification command. Validation MUST reject malformed
entries, duplicate identities or paths, absolute or escaping paths, missing or
untracked required targets, broken or cyclic relationships, invalid skill
frontmatter, and maintained instructions or skills missing from the inventory.

#### Scenario: A maintained skill is added without registration

- **WHEN** verification discovers a tracked `SKILL.md` that is absent from the
  manifest
- **THEN** verification fails with an actionable inventory-drift error

#### Scenario: A manifest relationship is invalid

- **WHEN** a route or prerequisite references an unknown artifact, forms a
  cycle, or resolves outside the repository
- **THEN** validation fails before the change can pass CI

#### Scenario: The manifest is valid

- **WHEN** every required artifact is registered and all schema, path,
  relationship, and frontmatter checks pass
- **THEN** the focused agent-artifact check and the existing repository
  verification command succeed

### Requirement: Recurring planning and catalog maintenance have focused skills

The repository SHALL provide a planning-only roadmap-triage skill that
reconciles current specifications, backlog, branches, worktrees, pull requests,
and delivery evidence before recommending one next epic. It SHALL distinguish
shipped, active, parked, blocked, stale, and historical work and SHALL NOT
authorize cleanup or integration. The repository SHALL also provide an agent-
artifact-maintenance skill that preserves instruction precedence, manifest
coverage, validation, and repository-local scope when guidance changes.

#### Scenario: The roadmap is unclear

- **WHEN** an agent is asked what work remains or what should happen next
- **THEN** it uses current repository and delivery evidence to produce a
  short-, medium-, and long-term roadmap with one recommended next epic

#### Scenario: Guidance is added or retired

- **WHEN** an agent changes a repository-owned instruction or skill
- **THEN** it follows the maintenance skill and updates routing, inventory, and
  focused validation without modifying host-global agent configuration
