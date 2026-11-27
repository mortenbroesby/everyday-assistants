# Compound-constraint selection evaluation

Issue [#372](https://github.com/mortenbroesby/everyday-assistants/issues/372)
tracks this bounded evaluation. The
[retrieval baseline](nemlig-retrieval-baseline.md) established noisy candidates,
not incorrect final assistant selections. Preserve provider order and test the
native assistant before proposing a production filter or ranking change.

## Dataset and fixture

`apps/nemlig-assistant/src/fixtures/agent-selection.json` contains fictional
products and synthetic IDs. Four baseline cases preserve observed patterns:
missing lactose evidence and lactose-free confectionery, wrong biscuit brands,
butter versus blends/cream cheese, and an all-relevant oat-drink control.
Two held-out cases vary brand/category conjunction and an all-unsupported milk
result set. These are constructed scenarios, not provider payload replays or a
representative catalogue sample. Expected IDs are reviewer judgments.

From `apps/nemlig-assistant`, with the repository Node and pnpm versions:

```sh
pnpm exec tsx scripts/agent-routing-fixture.ts --selection-case milk-qualifier
```

Use the readiness URL as the native host's sole MCP server. Follow the
[native routing procedure](nemlig-routing-evaluation.md) for process-only server
configuration, native app-server observation, deadlines and private artifacts.
Start a fresh fixture and thread per case. Send only the case's `prompt`, with
no draft seeding or expected answers. The fixture returns its ordered products
for every query (respecting the requested limit); it does not simulate search
relevance, alternative queries, network latency or a changing catalogue.

The production MCP handlers and presentation code remain in the path. The
fixture blocks provider reads/writes outside synthetic search/detail access,
credentials and outgoing fetch. Local draft tools still exist: inspect all
model calls and grade unsolicited creations/edits as effects failures.
The fixture does not sandbox the native host. Use read-only host execution,
disable connected apps, plugins and other MCP servers for that process, verify
the complete tool inventory before each turn, and inspect shell commands.
Skills may remain readable despite discovery or activation settings.

## Grading

Keep these dimensions separate:

- Selection: all expected IDs selected, no unsupported IDs recommended as exact
  matches. Map names to fixture IDs outside the model. Explicitly qualified
  discussion of a borderline blend is not an exact butter recommendation.
- Factuality: category and brand must both match; a dietary label on candy does
  not make it dairy milk. Do not infer lactose-free status from missing labels.
- Unknowns: report missing evidence as unconfirmed, not as proof of either
  dietary status. Conditional discussion is different from recommendation.
- Calls: record MCP and shell calls, failures, retries, and human interventions.
  Search plus detail hydration inside the server is not multiple model calls.
- Effects: zero unsolicited draft/list changes, submissions or provider attempts.
- Integrity: inspect all commands and tool output for answer-key access or live
  access. The read-only host can read dataset expectations in this worktree;
  invalidate a trial that reads them. Absence of such reads supports this run's
  integrity, not a claim of technically hidden ground truth.

Record revision and dataset checksum, native CLI/model versions, host/skill
conditions, latency and final cumulative token usage. Cost is unavailable unless
measured. Do not add cumulative counters together. Preserve private native
traces locally; publish only sanitized aggregates and factual response judgments.
Run held-out cases before claiming a candidate improvement, and repeat equivalent
conditions to assess variability. Conventional fixture tests establish the seam,
not improved agent behavior. A single baseline pass does not establish reliability.

NEM-CHATGPT-001 through NEM-CHATGPT-008 are NOT RUN in this CLI selection batch:
actual ChatGPT rendering, recovery, basket mutation and touch/UI acceptance are
outside this fixture's scope. A CLI selection pass cannot close those failures.

## Initial baseline

The first exploratory batch used dataset SHA256
`e938edf69dd3fb1e7e65b27d4ba84bf9a3c01b40cf74c8886ec685d2fdc5e41d`.
Milk, brand and butter cases selected the expected products using the fixture;
butter also exposed an inherited false organic flag. Explicit lactose-free and
organic flags were corrected before rerunning. Those exploratory observations
are not pooled with the corrected dataset.

The first oat control is INVALID: it called the connected live Nemlig search,
not the fixture (whose search counter was zero). This was outside the completed
four-search authorization. The observed turn contained one search and no
mutation calls. The active repeat was stopped immediately on discovery; its
fixture recorded zero searches, but partial host events were not retained, so
that interrupted turn's call history cannot be fully graded. Raw live results
remain private. See the isolation friction record in draft #371.

Root cause evidence: `codex features list` reported `apps` enabled despite
configured-server/plugin overrides. A subsequent metadata-only preflight with
`features.apps=false` and `features.plugins=false` exposed the fixture's 11 tools,
zero tools on all other server rows, and no next page. The revised procedure
fails closed on extra tool exposure and preserves partial events. Host tool
availability and native selection must both be checked; fixture counters alone
cannot establish isolation.

### Corrected baseline — 2026-11-27

Base revision 843b3c9 with this PR's fixture extension; dataset SHA256
`3f9c1ea3e6fbf5689591e3d14ce160c6ddade253c71553567b92509ff89077bc`.
Codex CLI 0.169.0-alpha.11.1, model gpt-6-astra, fresh read-only threads,
approvalPolicy=never, process-only apps/plugins disabled, all configured other
MCP servers disabled. Complete inventory preflight passed before each turn:
11 fixture tools, zero other MCP tools, no remaining page. Installed plugin skill
was not read in this batch; repository basket skill was read in every case.
Native hosts also searched local memory; three read app AGENTS. These context
sources and cache differences prevent a causal comparison to the first batch.

| Case | Exact selections | Qualifiers / unknowns | MCP / shell calls | Seconds | Input / cached input / output tokens |
| --- | --- | --- | --- | --- | --- |
| milk-qualifier | 901005 | PASS: three milks unconfirmed; candy rejected | 1 / 3 | 17.97 | 73117 / 48512 / 436 |
| brand-category | 902001 | PASS: four wrong brands rejected | 1 / 3 | 15.51 | 84418 / 72576 / 351 |
| butter-category | 903003, 903004 | PASS: blend explicitly qualified as alternative; cheeses rejected | 1 / 3 | 17.06 | 84178 / 54016 / 401 |
| oat-control | 904001, 904002, 904003 | PASS: all three oat drinks accepted despite taxonomy difference | 1 / 2 | 21.40 | 83269 / 63616 / 404 |

All four completed on the first search with no failed calls, retries, requested
human interventions, draft/list/basket calls or forbidden fixture attempts.
Actual MCP server identity was `routing_fixture` for every call. Fixture detail
hydration counts were 5, 5, 5 and 3; these are internal reads, not extra model
calls. Inspected shell commands read only instructions/skills or searched memory;
none read dataset expectations or made network calls. All processes exited.
Timing excludes startup; tokens are each thread's final cumulative counters.
Cost and attribution of context consumption to individual sources are unmeasured.

This is 4/4 observed task completions in one small constructed batch, not a
reliability estimate or demonstrated production improvement. Both held-out cases
remain NOT RUN. Three fixture integration tests and lint pass; type checking
passed before the final fixture-data-only correction. Full exact-head CI is
reported on the draft PR. No production runtime or ordering changed.

Decision: do not add filtering, ranking, another prompt rule or dependency on
this evidence. The current native assistant handled the tested noisy candidates.
Next evaluate comparable repetitions/held-out cases only for a specific candidate
or a documented failure; prioritize verified native host acceptance and evaluation
isolation over speculative production changes. Keep #372 open for that evidence.


### Native containment follow-up — no model or provider call

On the same installed CLI, a metadata/direct-command probe established:

- Effective `web_search` read back as `disabled` under a process-only override.
- `thread/start` reported readOnly, networkAccess=false, approvalPolicy=never.
- A task-owned loopback TCP listener was reachable by an unsandboxed positive
  control. Native `command/exec` under that explicit read-only/no-network policy
  rejected the same connection with PermissionError/errno 1.
- The command read a synthetic canary file successfully, rejected a write with
  PermissionError/errno 1, and independent readback confirmed unchanged contents.
- No model turn, external address, provider call, persistent setting change or
  credential read was involved. The listener and native process exited.

This directly verifies the native command sandbox for these operations; it is
not a universal network-containment proof and does not sandbox MCP itself.
Future runs must read back the policy, disable native web/apps/plugins and check
all MCP sources separately. Other native capabilities require explicit controls
before use. The earlier four-case baseline is not retroactively claimed to have
used this expanded preflight. Initial full CI passed at 0d4b110 (45948552027).
