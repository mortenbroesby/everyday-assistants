## Context

See proposal.md for motivation and epic #347 for delivery ownership. Main #346 attaches rendering metadata to both start and conversation update. `reviewOwner` already binds authenticated principals, exact draft/context handles, and optional `openai/session`; without that session a stateless call intentionally gets a fresh owner. `ProductReviewService.active` returns an existing snapshot and performs expiry/activity housekeeping. Reuse these boundaries instead of adding an account-wide draft registry.

## Goals / Non-Goals

**Goals:** make rendering an explicit, read-only operation; keep the complete existing viewer and app callbacks; make routing intent clear without loosening target identity. Test catalog, MCP execution, browser rendering, and model routing as distinct boundaries.

**Non-Goals:** no keyword parser, new editor, background draft reconstruction, persistence redesign, auth change, submission change, new dependencies, or automatic provider actions. Read-only display can refresh safe activity metadata; it cannot alter selected products or lifecycle authorization.

## Decisions

1. **One renderer, eight model tools.** Add `show_product_review` with `view: "draft" | "saved_lists"` defaulting to draft. Draft IDs are an optional strict pair (`draft_id`, `review_context_id`); saved-list mode rejects that pair. The tool uses hosted UI metadata and accurate read-only/idempotent annotations. Existing start/update results remain useful structured/text data but cease attaching the review resource. Guidance explicitly calls the display tool after preparation/edit when a visual result is wanted. Keeping all tools as renderers would continue unnecessary card remounts; replacing editing with display would confuse authorization.

2. **Exact handle first; session-only implicit target.** Supplied handles must resolve to the authenticated owner and exact active draft; any invalid explicit target fails without fallback. With no handles, only a real trusted session/connection can select its existing active draft. No principal-wide scan, name matching, guessed ID, or newest-draft fallback. A stateless request lacking handles returns actionable unavailability. This supports ordinary follow-up language without pretending lost context is recoverable. Do not change mutation identity requirements.

3. **Display is not loading.** `saved_lists` reads and renders the existing picker; selecting a source still explicitly uses the existing load-to-draft behavior. Draft display reuses the current snapshot (including empty, busy, submitted, or uncertain state), without provider login, reads, hydration, or hidden writes. Use the ordinary error boundary for this process-local lookup; only saved-list discovery needs the authenticated provider-read wrapper. MCP authentication and exact owner validation remain required. Preserve current unavailable-result rendering and meaningful content-only text fallback; an empty direct draft stays in the draft editor rather than entering the legacy unselected-list picker.

4. **Natural intent is model guidance, not lexical authorization.** A concise “Use this when…” description includes show/display/open/review/browse/compare and Danish examples in draft context. Negative cases distinguish actual basket reads, explanations, unrelated displays, and ambiguous targets. Clarify the target only when it cannot safely be determined. Mentioning “show” never creates a draft or approves Submit. Record prompt cases with expected routing plus preconditions; passing a string/metadata test is not a model-selection result.

5. **Preserve host and widget contracts.** Keep `ui://nemlig/shell.html`, model/app visibility, supported app-only actions and their exact identity validation. Stdio remains text-only. Update production catalog classification, exact inventory tests, browser adapters and README together. Retain existing conversation `show` compatibility as a data-only operation and direct new calls to the dedicated renderer; do not reintroduce retired prepare/discard actions.

6. **Proportionate verification.** Terra adds focused MCP tests and changes existing browser fixtures rather than inventing another simulator. Astra reviews owner/target negative cases and the real render journey. Native ChatGPT evaluation uses bounded read-only cases only after the candidate is available through an approved host connection; record tools, argument correctness, visible card, and absence of writes separately. No live external additions for this epic. Unknown native outcomes stay unrun/blocked with a concrete prerequisite.

7. **Truthful concurrent display and receipts.** Reopening a draft while its service operation is in progress must expose that state without enabling conflicting actions. Provide an exact-target refresh path after completion; do not weaken passive stale-payload isolation, infer completion from elapsed time, or automatically retry submission. A durable verified `completed/replayed` result is a confirmed success with no new addition, even when it contains no review snapshot. Handle that receipt explicitly and recover the exact current review where available; an expired or missing draft must not turn verified success into uncertainty or recreate submission authority. Test both in-flight display and a stale card used after another card completes. The runbook must obtain authorization before the single Add action and must not imply that clicking it opens a non-applying confirmation screen.

## Risks / Trade-offs

- An extra model tool increases catalog size and one deliberate render call can add latency. Keep descriptions/schema compact and measure the serialized catalog delta; do not add a new paid model/evaluation dependency.
- ChatGPT may still choose incorrectly despite good metadata. Use direct/indirect/negative prompt observations and do not promise guaranteed keyword triggers.
- Older cached catalogs expect start/update rendering. Preserve structured data and app callbacks, document supported forward migration, and refresh metadata only when stale inventory is demonstrated. Do not rotate the stable resource or reconnect OAuth speculatively.
- Session-less requests cannot infer an active draft safely. Exact returned handles are the normal path; an actionable unavailable state is preferable to exposing another conversation's draft.
- A native-host test of an unmerged candidate may require separate staging/deployment access. Repository delivery and native acceptance remain explicitly separate gates.

## Migration Plan

Deliver one PR with catalog/metadata, caller/test and documentation updates together. Use normal hooks and exact-head CI. No automatic deployment or production setting changes from this worktree. A later approved release verifies its served tool inventory and then tests fresh native host calls. If the contract regresses, revert the coherent change through a reviewed PR; do not weaken identity or submission safeguards as a fallback.
