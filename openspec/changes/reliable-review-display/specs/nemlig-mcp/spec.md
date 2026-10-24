## RENAMED Requirements

- FROM: `### Requirement: Seven model-visible shopping tools and owner-scoped viewer actions`
- TO: `### Requirement: Eight model-visible shopping tools and owner-scoped viewer actions`

## MODIFIED Requirements

### Requirement: Eight model-visible shopping tools and owner-scoped viewer actions
The model-visible user tool set SHALL contain exactly `check_nemlig_connection`, `find_groceries`, `get_profile`, `show_my_basket`, `start_product_review`, `show_product_review`, `update_product_review_conversation`, and `submit_product_review_conversation`. The app-only `update_product_review` and `submit_product_review` actions SHALL target the exact active `draft_id` and `review_context_id`; submission SHALL also include a unique `submission_id` and the exact `reviewed_list`. The app-only `save_basket_as_shopping_list` action SHALL be available only after at least one verified addition. `get_profile`, search, and actual-basket reads SHALL remain read-only. Start/update SHALL change only the temporary draft; only protected submit paths MAY add to the actual basket. Retired tool names SHALL return the standard unknown-tool response without provider mutation.

#### Scenario: Model-visible tools are listed
- **WHEN** a compatible client lists tools and honors app visibility metadata
- **THEN** the model-visible set contains exactly the eight named tools with complete schemas and behavior-matched annotations

#### Scenario: A widget includes a retired identifier
- **WHEN** a widget calls `update_product_review` or `submit_product_review`
  with an obsolete card, review, revision, or `basket_id` field
- **THEN** strict input validation rejects the call before its handler and
  neither the Draft list nor Nemlig basket changes

#### Scenario: Multiple supported cards use the current Draft list
- **WHEN** a supported widget submits an action with the exact active draft
  and review-context IDs
- **THEN** the server applies it to that authenticated owner's draft without
  selecting another list or superseding the current card

#### Scenario: Retired tool is called
- **WHEN** a client calls `show_my_basket_visually`, `review_items_to_add`, `add_approved_items`, or another retired tool name
- **THEN** the server reports an unknown tool and performs no provider operation

#### Scenario: Search and basket are inspected
- **WHEN** a client searches or reads the actual Nemlig basket
- **THEN** it receives complete structured and text data without opening a Draft list or modifying the basket

### Requirement: Complete production feature acceptance
The system SHALL provide an automated, read-only production acceptance workflow that verifies the exact advertised eight-tool user catalog and shared resource inventory against the hosted service. It SHALL exercise live authenticated profile identity, product search, and actual Nemlig basket inspection, and SHALL fail on inventory drift without starting a Draft list or applying a real basket mutation.

#### Scenario: Read-only production acceptance runs
- **WHEN** the operator runs production acceptance with valid owner authentication
- **THEN** the advertised read-only features and viewer resource are checked, no local or provider mutation is applied, and failures identify the missing feature without disclosing secrets

#### Scenario: Advertised surface drifts
- **WHEN** production lists a tool or resource that the acceptance inventory does not classify, or an expected supported feature disappears
- **THEN** acceptance fails rather than silently skipping the drift

## ADDED Requirements

### Requirement: Dedicated read-only review display
The system SHALL expose `show_product_review` to display an existing temporary draft or, when explicitly requested, the saved-list picker. Display SHALL NOT create or load a draft, change products or quantities, save a list, submit to the basket, or retry an uncertain operation. It SHALL preserve the existing viewer functionality and return usable text when the client cannot render UI.

#### Scenario: Existing draft is displayed repeatedly
- **WHEN** the user displays an available draft repeatedly
- **THEN** the same draft and review-context IDs and selected contents are returned without provider writes or renewed submission authorization

#### Scenario: Saved lists are displayed
- **WHEN** display explicitly targets the saved-list picker
- **THEN** saved lists are read without loading a source into a new draft or modifying a source

#### Scenario: Submitted or uncertain draft is displayed
- **WHEN** an existing draft contains a submission result or uncertainty
- **THEN** display preserves that state and does not replay, reset, or authorize submission

#### Scenario: Provider access is unavailable
- **WHEN** an authenticated MCP user displays an existing cached draft while Nemlig access is unavailable
- **THEN** the draft is returned without provider login or reads, retaining exact owner checks; saved-list discovery still requires authenticated provider access

#### Scenario: Last draft row was removed
- **WHEN** the user displays a valid direct-basket draft with zero rows
- **THEN** the same empty draft remains in the editor with its identity intact rather than being replaced by a saved-list picker

#### Scenario: Client reads only text content
- **WHEN** a client consumes display text without structured content or UI support
- **THEN** the text contains the returned draft identities, rows, quantities and relevant state, or saved-list identities and names, rather than only a generic display acknowledgement

### Requirement: Safe conversational display target
Display SHALL accept an exact draft/context pair or an existing active draft selected only through a trustworthy current session. It SHALL NOT guess by account-wide recency, name, or reconstructed chat text. Explicit invalid targets SHALL NOT fall back to another draft. No-target unavailable context SHALL return actionable guidance without creating a draft.

#### Scenario: Exact owner-scoped handle
- **WHEN** the authenticated user supplies the correct active draft and review-context pair
- **THEN** only that draft is displayed, including across stateless requests

#### Scenario: Current session has an active draft
- **WHEN** no handles are supplied and a trustworthy current session owns an active draft
- **THEN** that session's draft is displayed without selecting another conversation's draft

#### Scenario: Context is missing or expired
- **WHEN** no safe target exists, including after expiry or service restart
- **THEN** the result explains unavailability and an explicit next action without recreating the lost draft or leaking another conversation

#### Scenario: Invalid explicit pair
- **WHEN** a handle is foreign, stale, mismatched, or only one member of the pair is supplied
- **THEN** the request is rejected or reported unavailable without revealing draft contents, selecting a fallback, or mutating state

### Requirement: Decoupled hosted rendering contract
Among model-visible review tools, only `show_product_review` SHALL attach the hosted review UI resource metadata. Start and conversation update SHALL return structured/text results with guidance to use the renderer for a visual result. The stable shell resource and app-only callback identity rules SHALL remain unchanged. Stdio SHALL remain text-only.

#### Scenario: Hosted client discovers tools
- **WHEN** a hosted client lists the supported model-visible tools
- **THEN** the display tool advertises the current review resource through standard and supported compatibility metadata, with read-only annotations, while start and update do not attach a review resource

#### Scenario: Existing card interaction
- **WHEN** a supported widget edits or submits through its app-only callbacks
- **THEN** existing exact-target validation and no-replay behavior remain effective without opening another card

### Requirement: Contextual natural-language discovery
Tool descriptions and server guidance SHALL direct requests to show, display, open, browse, or compare a draft to the display tool, including equivalent Danish requests and conversational follow-ups. They SHALL distinguish display from editing, saved-list loading, actual-basket inspection, and exact submission authorization. The system SHALL NOT use a keyword match as authorization for mutations.

#### Scenario: User requests a visual draft
- **WHEN** a user asks to see an available draft in ordinary English or Danish
- **THEN** the advertised contract identifies the read-only display tool and requires no special command or additional approval

#### Scenario: Display wording has another target
- **WHEN** a user asks for the actual basket, a text explanation, or an unrelated display
- **THEN** guidance preserves that intent rather than forcing a temporary-draft card

### Requirement: Display verification distinguishes evidence layers
Verification SHALL cover tool metadata, exact-target execution, browser rendering and a bounded prompt matrix. Native ChatGPT routing/rendering results SHALL be recorded separately from deterministic tests with observed tool selection, argument correctness, card rendering, and mutation outcomes. Unrun or inaccessible host cases SHALL remain explicitly unverified.

#### Scenario: Metadata test passes
- **WHEN** deterministic catalog and schema assertions pass
- **THEN** the report does not claim ChatGPT selected the tool or rendered a card

#### Scenario: Host test cannot access the candidate
- **WHEN** native ChatGPT cannot access the candidate revision under current authorization
- **THEN** the report records the prerequisite and leaves native acceptance open rather than using a synthetic result as a substitute
