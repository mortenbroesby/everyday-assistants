# Nemlig review contract and viewer state (issue #323)

This Step 3 record builds on [Step 2's backend retirement](nemlig-backend-retirement.md) at PR #329 head `1a89ebd`. That source-level baseline had 69 focused tests and both synthetic review-UI smokes passing. It is not evidence of an installed ChatGPT plugin or live Nemlig account.

## Data ownership

| Data | Owner and boundary |
| --- | --- |
| Draft membership, account binding, busy flag and submission fence | `ProductReviewService` and the durable journal. None of these can be inferred from a rendered card. |
| Serialized review snapshot | `src/review-schema.ts` defines the Zod shape used by MCP output and the shared TypeScript review type. The published `tools/list` JSON Schema remains unchanged from PR #329. |
| Product facts | `product-view-schema.ts` remains the advertised current wire shape. The viewer retains its narrower product guard for cached host cards whose old facts omit fields now required by that schema; this does not authorize an edit or Submit. |
| Cached-card presentation | `viewerReviewSchema` derives from the current review schema, relaxing only old cards' absent alternative origin and submission expiry. It validates nested submission details before rendering. Its parsed data is display input, never proof that the server still has a draft. |
| UI-only interaction state | `ProductViewer` owns the visible screen and navigation, pending quantity edits, dialogs and messages. `ViewerPage` remains presentation-only and Storybook uses it directly. |

The backend's `ReviewSnapshot` type narrows product views to the projections it actually produces. `ViewerReview` allows two omitted historical display fields without maintaining a second full review interface. Unknown additional fields are not treated as authority; invalid current IDs, quantities and nested submission details fail parsing.

`draftId`, `reviewContextId` and `draftExpiresAt` are wire-public context, but only a fresh server lookup establishes that a draft still exists. `items`, `alternatives`, `shoppingListName` and `actionNotice` are wire-public display data. `submissionAttempted` and `submission` describe a result to the UI; the durable journal remains authoritative for replay prevention. `shoppingListId`, `saveStatus`, `updateStatus`, `conflictItems` and `saveProgress` remain optional compatibility fields for older cards; current direct drafts do not use a provider list as their editable state. Retired `basketId` is not accepted as a current review target. `screen`, pending quantities, selected target, dialogs and presentation destination are UI-local.

## Host transitions and retained guards

| Event | Decision | Retained guard |
| --- | --- | --- |
| Initial or passive host output | Render a valid snapshot as inactive until the server confirms its current context; ignore passive results during a correlated call or after a consumed/uncertain submission. | `ignorePassivePayloads`, current draft target and `callLock` |
| Correlated tool result | Validate the envelope, match the selected target/epoch, then update the confirmed review and visible screen. | `selectionEpoch`, `cancellationEpoch`, `activeToolController` |
| Edit or quantity change | Keep the latest intended quantity pending until its server result; flush before navigation or Submit. | Pending quantity ref/map, timer and `quantityFlush` |
| Submit | Block an immediate duplicate while the call is pending; a correlated uncertain/attempted result keeps the block. A new valid review or known no-write result may clear it. | React `submitBlocked` state plus the server's durable no-replay fence |
| Cancellation, timeout or late response | Abort client-side work, retain last confirmed display/recovery context and never infer that a provider write was cancelled. | Abort controller, epochs and last confirmed review |

The unused `submitBlockedRef` mirror was removed: it was written in nine branches and never read. The pending/terminal Submit transition is now one pure decision with focused tests. Storybook and the host now share one fact-disclosure update rule instead of duplicating it. Other refs remain because host callbacks and in-flight effects need current values before React renders; moving them to a reducer would not remove that requirement.

The viewer now imports the shared Zod schema. The built viewer changed from 602.48 kB raw / 176.49 kB gzip at the Step 2 baseline to 602.84 kB raw / 176.92 kB gzip here. There are no new dependencies or public tool fields.

## Verification boundary

Focused parser/transition and MCP interface tests, the existing Storybook fixtures, the synthetic adapter smoke and the built-viewer host smoke are the applicable automated evidence. The adapter smoke exercises direct draft edits, saved-list read-only sourcing, one additive bulk Submit, separate whole-basket save, alternatives, and an uncertain Submit followed by stale host output and remount with a fake provider. A live ChatGPT/provider acceptance test requires separate authorization and is not claimed by this refactor.
