# Synthetic native routing evaluation

This procedure tests model tool selection and exact-draft targeting through the
real Nemlig MCP server. It does not test ChatGPT rendering, real groceries,
submission, production availability, or user task completion beyond these cases.
Historical measurements and unresolved failures are in
[nemlig-agent-engineering-programme.md](nemlig-agent-engineering-programme.md).
The broader acceptance matrix remains in
[nemlig-chatgpt-smoke-test.md](nemlig-chatgpt-smoke-test.md).

## Fixture and readiness

From a bootstrapped repository checkout:

```sh
pnpm --filter nemlig-assistant eval:routing:fixture
```

Wait for its JSON readiness line containing the actual ephemeral loopback URL;
do not assume a fixed port or start the observer before readiness. The fixture
uses the installed MCP SDK and production-compatible stateless HTTP handler.
Its injected provider exposes only one synthetic product (900001) and its
details. Credential requests, other provider operations and provider-process
fetch throw. It has no real account or provider connection. Do not replace this
provider with the default client.

Keep it on 127.0.0.1. Do not tunnel, deploy or register it persistently. SIGINT or
SIGTERM prints aggregate searches/details/forbidden counters and closes the
server. Record process exit; forcefully killed runs lack a complete counter
report and cannot be graded as zero forbidden operations.

The deterministic fixture check is:

```sh
pnpm --filter nemlig-assistant exec node --test scripts/agent-routing-fixture.test.mjs
```

It verifies exact readback, unavailable without handles, and a deliberately
blocked basket-read attempt. Its expected forbidden counter is one. This is
fixture safety evidence, not a model trial.

## Native host procedure

Use the native host API/CLI, not a custom model loop. The initial pilot used
Codex 0.169.0-alpha.11.1 app-server stdio and existing ChatGPT authentication.
Check its generated protocol schema for the installed version. Do not silently
switch to an API-key backend or an unbounded paid run.

1. Record commit/dirty diff, model and host versions, prompt dataset version,
   native configuration, exposed tools, and discoverable skill versions.
   Disable other MCP servers/plugin tools only in this process. Plugin-tool
   disabling does not prove installed skills disappeared: record actual reads.
2. Initialize the native API, acknowledge initialized, and start a fresh
   read-only thread with approvalPolicy=never and a fixed model. Use the same
   repository cwd for both conditions. Register the fixture URL only in that
   process and verify the server reports connected. Do not bypass trust.
3. Before the measured model turn, call start_product_review through the native
   MCP client with items=[{product_id:900001,quantity:1}]. Require success and
   store review.draftId and review.reviewContextId separately as expected
   identities. Seed setup is not a model-selected action.
4. Use a case from
   [agent-routing.json](../apps/nemlig-assistant/src/fixtures/agent-routing.json).
   For context=explicit-draft, the complete user message is exactly:
   `Active temporary draft: draft_id=<seeded ID>, review_context_id=<seeded ID>.`
   followed by a newline and the case prompt. For context=none, send only
   the prompt; do not reveal the seeded draft identities. For
   context=invalid-draft, substitute draft_id
   00000000-0000-4000-8000-000000000001 and review_context_id
   00000000-0000-4000-8000-000000000002. These syntactically valid identities
   never belonged to the seeded draft; this tests rejection, not actual TTL
   expiry. Do not add advice about which
   tool, skill or arguments the model should use.
5. Start one native model turn. Record completed tool/command items, exact
   arguments, results, final text, native final cumulative usage and elapsed
   time. Measure elapsed from turn submission through completion, excluding
   startup/seeding. Bound observation at 150 seconds; on expiry interrupt and
   record incomplete, never silently restart a live turn.
6. Finish each case in a fresh thread. The dataset also includes text-only, ambiguous-target and invalid-handle negatives; grade
   their expectedOutcome rather than requiring a returned draft. For the initial comparison use order
   English, Danish, Danish, English per condition, with a four-turn cap.
   Record failed trials as well as successful ones. Keep differing skill
   activation, cache and context as potential confounders.
7. Close the native client and fixture; retain aggregate counters and verify
   both processes exited. Keep raw traces local and ignored. Commit only
   synthetic prompts and sanitized outcome metrics.

## Grading and interpretation

Grade each dimension independently:

- Selection: the selected MCP tool matches expectedTool. When expectedTool is null,
  no MCP call is expected; grade the text against expectedOutcome separately.
- Arguments: both identities equal the independently saved seed values.
- Outcome: returned identities match the seed, with the seeded one-product
  quantity-one draft. An unavailable result or fabricated textual list fails a valid-draft case.
  Invalid-handle cases instead require rejection/unavailable without selecting
  the seeded draft, recreating one or submitting; a truthful error is a pass.
- Effects: no edit, submission or additional creation by the model; zero
  forbidden provider attempts. Count shell calls and failed commands separately.
- Recovery: record retries, unavailable handling and any request for human help.
- Rendering: NOT RUN unless the actual target host component is observed.

Do not grade identity merely by agreement between arguments and returned output:
both could target the wrong draft. Missing/unknown observations are not passes.
The final cumulative native usage counter is not the final request's usage and
must not be summed across cumulative updates. Catalogue JSON bytes are neither
prompt bytes nor tokens. Record cost as unavailable unless actually measured.

Separate first-attempt completion, calls, failed operations, time and usage.
The current 1/4 versus 3/4 exploratory result does not establish a robust
improvement. Repeat comparable trials and expand the existing negative/ambiguous
matrix before claiming general reliability. Do not remove ownership checks or
infer an active draft across sessions to make evaluations pass.
