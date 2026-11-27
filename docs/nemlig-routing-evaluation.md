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

For context=expired-draft cases, start a separate fixture with:

```sh
pnpm --filter nemlig-assistant eval:routing:fixture --expired-draft
```

It creates one synthetic draft through ProductReviewService, then advances only
its injected clock by three hours beyond the two-hour idle TTL. The readiness
record includes expiredDraft.draftId/reviewContextId. Use those once-valid
handles; do not seed another draft for this mode. The clock does not affect the
host or production. Keep active and expired batches separate.

The deterministic fixture check is:

```sh
pnpm --filter nemlig-assistant exec node --test scripts/agent-routing-fixture.test.mjs
```

It verifies exact readback, unavailable without handles, and a deliberately
blocked basket-read attempt in both active and expired modes. Its expected
forbidden counter is one per mode. This is
fixture safety evidence, not a model trial.

## Native host procedure

Use the native host API/CLI, not a custom model loop. The initial pilot used
Codex 0.169.0-alpha.11.1 app-server stdio and existing ChatGPT authentication.
Check its generated protocol schema for the installed version. Do not silently
switch to an API-key backend or an unbounded paid run.

1. Record commit/dirty diff, model and host versions, prompt dataset version,
   non-secret native configuration choices, exposed tool names, and
   discoverable skill versions. Never copy credentials or an entire host config.
   Disable other MCP servers/plugin tools only in this process. Plugin-tool
   disabling does not prove installed skills disappeared: record actual reads.
2. Initialize the native API, acknowledge initialized, and start a fresh
   read-only thread with approvalPolicy=never and a fixed model. Use the same
   repository cwd for both conditions. Register the fixture URL only in that
   process and verify the server reports connected. Do not bypass trust.
3. For expired-draft cases, use the pair from the fixture readiness record and
   skip fresh seeding. Otherwise, before the measured model turn, call
   start_product_review through the native
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
   expiry. Save the supplied invalid pair separately from the hidden seeded
   pair so grading cannot confuse them. For context=expired-draft, use the
   same prefixed message with the once-valid readiness pair. Do not add advice about which tool,
   skill or arguments the model should use.
5. Start one native model turn. Record completed tool/command items, exact
   arguments, results, final text, native final cumulative usage and elapsed
   time. Measure elapsed from turn submission through completion, excluding
   startup/seeding. Bound observation at 150 seconds; on expiry interrupt and
   record incomplete, never silently restart a live turn.
6. Finish each case in a fresh thread. Choose and record a bounded batch before
   execution; do not silently extend it after failures. The original
   valid-draft comparison used English, Danish, Danish, English (four turns
   per condition). Later negative batches use named case IDs from the dataset
   and their expectedOutcome; they do not require a returned draft.
   Record failed trials as well as successful ones. Keep differing skill
   activation, cache and context as potential confounders.
7. Close the native client and fixture; retain aggregate counters and verify
   both processes exited. Keep raw traces local and ignored as described
   below. Commit only synthetic prompts and sanitized outcome metrics.

## Grading and interpretation

Grade each dimension independently:

- Selection: the selected MCP tool matches expectedTool. When expectedTool is null,
  no MCP call is expected; grade the text against expectedOutcome separately.
- Arguments: valid-draft calls must use the independently saved seed pair.
  Expired-draft calls must preserve the once-valid readiness pair.
  Invalid-draft calls must preserve the supplied invalid pair, never substitute
  the hidden seed pair. No-call cases have no argument grade. Record an initial
  omission and a later correction separately rather than calling both
  first-attempt success.
- Outcome: returned identities match the seed, with the seeded one-product
  quantity-one draft. An unavailable result or fabricated textual list fails
  a valid-draft case.
  Invalid-handle and expired-draft cases instead require rejection/unavailable without selecting
  the seeded draft, recreating one or submitting; a truthful error is a pass.
- Effects: no edit, submission or additional creation by the model; zero
  forbidden provider attempts. Count shell calls and failed commands separately.
- Recovery: record retries, unavailable handling and any request for human help.
  Grade unsupported recovery advice separately: rejecting an expired draft
  safely does not establish that a suggestion to reopen it is workable.
- Rendering: NOT RUN unless the actual target host component is observed.

Do not grade identity merely by agreement between arguments and returned output:
both could target the wrong draft. Missing/unknown observations are not passes.
The final cumulative native usage counter is not the final request's usage and
must not be summed across cumulative updates. Catalogue JSON bytes are neither
prompt bytes nor tokens. Record cost as unavailable unless actually measured.

Separate first-attempt completion, calls, failed operations, time and usage.
The small exploratory samples in the programme record do not establish a
robust improvement. Keep results by revision, dependency version and case
rather than pooling different conditions. Repeat comparable trials and expand
the existing negative/ambiguous matrix before claiming general reliability. Do not remove ownership checks or
infer an active draft across sessions to make evaluations pass.


## Local artifacts and privacy

Store raw native events only under
`apps/nemlig-assistant/.codex/routing-evaluations/` or an equivalently private
temporary directory. The repository ignores the former explicitly. Create
artifacts with a restrictive umask (077) or file mode 0600; Git ignore prevents
accidental staging, not access by other local users. Never force-add raw traces.

Before recording, verify the path is ignored:

```sh
git check-ignore apps/nemlig-assistant/.codex/routing-evaluations/run.json
```

Retain only the evidence necessary to inspect the trial. A synthetic provider
does not make the native host transcript public: it may contain repository
instructions, installed skill content or shell output. Keep host configuration,
credentials, unrelated user content and private tool results out of committed
evidence. Publish only case/revision/version identifiers, dimension grades,
aggregate counters and usage, sanitized error categories, and remaining
uncertainty. Do not publish generated draft/context handles or full transcripts.
