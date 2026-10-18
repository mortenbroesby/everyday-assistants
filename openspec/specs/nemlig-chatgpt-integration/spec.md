# Nemlig ChatGPT Integration Specification

## Purpose

Defines the private allowlisted ChatGPT integration that reaches isolated Nemlig shopper accounts through the hosted Cloudflare/Auth0 service, works without Codex or the owner's Mac, defaults to the owner only, and does not enable checkout.

## Requirements

### Requirement: Rewrite prerequisite

The system SHALL apply this capability only after PR #8 is merged, the TypeScript rewrite change is complete and archived, and the merged Nemlig client, CLI, stdio MCP, tests, and shared product viewer pass focused verification.

#### Scenario: Apply begins before the rewrite is complete

- **WHEN** implementation begins and the expected rewrite baseline is absent, unmerged, unarchived, or materially different
- **THEN** application stops and reports the unmet prerequisite without copying implementation from the old feature branch

### Requirement: Direct normal ChatGPT use
The system SHALL support independent product search, actual Nemlig basket inspection, temporary draft choices, and explicitly authorized submission of the exact reviewed draft in normal ChatGPT conversations without requiring Codex or a saved planner. Draft results MAY render through one shared product viewer, with complete conversational structured and text fallbacks.

#### Scenario: User searches for products
- **WHEN** the private app is available and the user asks for products
- **THEN** ChatGPT receives richly detailed products in provider order and may summarize them without mounting a viewer, then explicitly open a temporary draft for selected products

#### Scenario: Viewer is unavailable
- **WHEN** the client cannot render the optional shared viewer
- **THEN** ChatGPT continues with the same structured and readable product data without requiring UI

#### Scenario: User authorizes an exact addition
- **WHEN** the user clearly requests addition of the unchanged reviewed draft or explicitly approves the exact additions
- **THEN** ChatGPT can invoke protected submission and receive verified Nemlig basket readback



### Requirement: Accurate MCP metadata

The system SHALL advertise titles, descriptions, input schemas, output schemas, server instructions, and accurate readOnlyHint, openWorldHint, and destructiveHint annotations for every tool.

#### Scenario: Metadata is inspected

- **WHEN** MCP Inspector or ChatGPT scans the server
- **THEN** discovered metadata matches each tool's actual side effects and contains no secret-bearing values

### Requirement: No secret disclosure

The system SHALL NOT return, render, log, persist in Git, or place in model-visible content any Nemlig password, cookie, access token, provider runtime key, authorization header, local credential, hosted secret, or internal session identifier.

#### Scenario: Complete output surface is inspected

- **WHEN** tool results, UI properties, logs, errors, tests, fixtures, and committed files are reviewed
- **THEN** no secret-bearing value or reusable session material is present

### Requirement: No ordering capability

The direct integration SHALL NOT expose checkout, payment, purchase, order placement, or delivery-slot mutation through tools, skills, UI, prompts, or endpoints.

#### Scenario: Complete surface is inspected

- **WHEN** executable tools, resources, server instructions, skills, and app metadata are enumerated
- **THEN** none can place or pay for an order or change a delivery slot

### Requirement: Single hosted production deployment

The system SHALL expose one supported private ChatGPT integration named `Nemlig Assistant` through the production Cloudflare endpoint and SHALL authenticate the configured owner with Auth0 before forwarding useful MCP requests. The repository SHALL NOT expose a supported Secure MCP Tunnel command, setup path, or fallback deployment.

#### Scenario: Owner uses Nemlig Assistant

- **WHEN** the configured owner invokes a tool through the installed production app
- **THEN** the request is authenticated at the hosted gateway and can reach the fixed backend without the owner's Mac or a tunnel client running

#### Scenario: Retired tunnel path is requested

- **WHEN** an operator searches supported commands, instructions, and deployment documentation for a tunnel setup or fallback
- **THEN** no runnable tunnel entry point or supported tunnel deployment procedure is present

### Requirement: Hosted owner and credential boundary

The production integration SHALL accept only an enabled subject in the
owner-controlled private principal policy, SHALL obtain that principal's Nemlig
credentials only from hosted secrets, and SHALL keep credentials, cookies,
access tokens, authorization headers, internal session identifiers, and
provider secret values out of tool results, logs, fixtures, committed files,
and model-visible content. Production SHALL contain only the existing owner by
default.

#### Scenario: Unauthenticated or unknown-principal request

- **WHEN** a request has no valid token or belongs to a subject absent from the
  enabled private principal policy
- **THEN** the gateway rejects it before the fixed backend performs a Nemlig
  operation

#### Scenario: Production login is required

- **WHEN** the hosted Nemlig client needs to establish or refresh a principal's
  session
- **THEN** it uses only that principal's configured hosted credential pair
  without requesting a password through ChatGPT or falling back to another
  principal's credentials

### Requirement: Private hosted distribution

The supported integration SHALL remain private and owner-controlled and SHALL
NOT require public directory submission, public review credentials, public
registration, or unrestricted account mapping.

#### Scenario: Hosted alpha is accepted

- **WHEN** the production acceptance suite passes and the owner keeps the app
  private
- **THEN** the hosted app remains the supported distribution without a tunnel
  registration or public listing

### Requirement: Hosted expansion requires a new security design

The system SHALL NOT extend the private hosted boundary to an additional Auth0
identity or Nemlig account unless an approved design defines private identity
mapping, per-principal isolation, revocation, credential ownership, and
an explicit activation gate. It SHALL NOT extend access to arbitrary public
users, checkout, payment, ordering, or delivery-slot mutation.

#### Scenario: Another household member is requested

- **WHEN** support for another Auth0 identity or Nemlig account is requested
- **THEN** that principal remains disabled until its separate identity and
  account are configured, isolation acceptance succeeds, and the owner
  explicitly enables it under the current private-family design

#### Scenario: Public access is requested

- **WHEN** an identity is not explicitly configured in the private principal
  policy
- **THEN** the current private implementation rejects it without public signup
  or fallback to another principal's account

### Requirement: Human-friendly shopping conversation
The direct ChatGPT integration SHALL describe products, temporary-draft choices, Nemlig basket changes, and verified results like a household shopping assistant rather than a transaction log. It SHALL distinguish local choices from provider state and require a clear user instruction for the exact unchanged reviewed additions before a basket write.

#### Scenario: ChatGPT reviews a prepared change
- **WHEN** a draft submission is considered without a clear instruction to add the unchanged reviewed items
- **THEN** ChatGPT presents the exact effect in plain language and asks for approval without showing opaque protocol fields by default

#### Scenario: User requests product comparison
- **WHEN** the user asks to see or compare products
- **THEN** ChatGPT presents current names, brands, package sizes, prices, descriptions, supported facts, and safe images when available without changing the basket

#### Scenario: ChatGPT confirms a verified result
- **WHEN** explicitly authorized basket additions succeed and fresh readback matches
- **THEN** ChatGPT confirms the resulting shopping outcome without narrating proposal lifecycle or protocol mechanics

### Requirement: Independent product discovery

For ordinary product requests, the integration SHALL search independently with a
concise catalogue term and SHALL allow ChatGPT to refine empty or unsuitable
results through additional searches. It SHALL NOT require a planner or inspect
the current basket to determine product search results.

#### Scenario: A long search phrase is unsuitable

- **WHEN** an ingredient can be expressed by a shorter one- or two-word Danish catalogue term
- **THEN** ChatGPT searches with the shorter term and may refine it until useful current options are found or the ingredient is reported unresolved

#### Scenario: Current basket contains related products

- **WHEN** ChatGPT creates a recipe proposal
- **THEN** discovery neither reads nor subtracts current basket contents and proposes the products requested in the current conversation

### Requirement: Shared product viewer and exact basket review
The integration SHALL use one shared product presentation for conversational and touch decisions in the temporary draft. Both input modes SHALL address exact products in that draft and support changes, removal, quantities, and safe navigation. Business state SHALL remain server-authoritative. Actual submission SHALL send the exact reviewed draft only after a clear instruction to add those unchanged products or explicit approval of the exact additions; a saved Nemlig list remains a read-only source.

#### Scenario: Product review is operated by voice
- **WHEN** the user changes a product or requests the current draft conversationally
- **THEN** the resulting draft snapshot matches the equivalent touch operations

#### Scenario: Complete product result is shown
- **WHEN** a search contains resolved products
- **THEN** every product appears once with its supported exact facts and context, without an automatic provider call or implied approval; draft controls make no provider mutation

#### Scenario: User authorizes the exact basket addition
- **WHEN** the user clearly requests addition of the unchanged reviewed draft or explicitly approves the exact additions
- **THEN** protected submission performs fresh validation, single-use application, and verified basket readback without clearing unrelated Nemlig lines or retrying an uncertain write

#### Scenario: Viewer is unavailable
- **WHEN** the client cannot render MCP Apps
- **THEN** the same draft snapshot, product facts, explicit submission effect, and local operations remain available through structured tools and conversation

### Requirement: Visible UI release acceptance
A UI release SHALL be reported delivered only after the connected ChatGPT app
advertises the intended review tools and renders an interactive review. Server
deployment acceptance SHALL verify the expected viewer HTML and resource
metadata. ChatGPT metadata refresh and live UI acceptance SHALL be separate
recorded release steps; they SHALL NOT be inferred from healthy edge endpoints.

#### Scenario: Deployment succeeds but the app catalog is stale
- **WHEN** Cloudflare accepts a release but ChatGPT still advertises old tools
- **THEN** UI delivery remains pending until app refresh readback confirms the
  intended catalog and a local review renders and supports navigation

#### Scenario: Local UI release test
- **WHEN** the operator verifies a released review UI
- **THEN** editing an exact product changes only the temporary draft,
  without a saved-list or actual-basket write

### Requirement: Exact temporary draft across supported cards
The authenticated conversation SHALL own a temporary process-local draft, and
supported current-bundle cards SHALL target its exact `draft_id` and
`review_context_id`. A remount SHALL require the current supported viewer
bundle and its current invocation snapshot; compatibility with already-mounted
predecessor bundles SHALL NOT be promised. Expiry or server restart SHALL make
the old draft unavailable without silently recreating it.

#### Scenario: Another supported card starts
- **WHEN** the host renders a new supported card for the same conversation
- **THEN** it shows the exact active draft without selecting another list or
  restoring a stale submission context

#### Scenario: Delayed passive snapshot follows a local action
- **WHEN** the mounted card receives a delayed passive snapshot after a local
  action was successfully correlated
- **THEN** the snapshot cannot roll the card back from its confirmed local state

#### Scenario: Retired identifier is submitted
- **WHEN** an old card supplies a card, review, revision, or `basket_id` field to a normal
  action
- **THEN** strict input validation rejects it before provider or Draft list
  mutation

#### Scenario: Retired resource is requested
- **WHEN** the host requests a known retired viewer URI
- **THEN** it receives an inactive notice, not obsolete shopping controls or a missing-template response
- **AND** server changes make no claim to remove documents already cached by the host

#### Scenario: Service cannot confirm the action
- **WHEN** a tool fails or times out
- **THEN** the card hides shopping controls and offers a sanitized read-only
  refresh without stale-card wording or automatic mutation retries

### Requirement: ChatGPT uses the temporary draft and Nemlig basket distinctly
The integration SHALL route product discovery to `find_groceries`, current provider-basket inspection to `show_my_basket`, and temporary choices to the draft tools. It SHALL NOT claim that image URLs or a successful tool response prove a card rendered. If the host does not render the draft viewer, it SHALL present complete text results. It SHALL NOT direct users to retired tool IDs.

#### Scenario: User asks to see the actual basket visually
- **WHEN** the user asks for cards or images of products already in the Nemlig basket
- **THEN** the assistant reads `show_my_basket`, presents the actual lines and totals, and honestly states if the host did not render cards

#### Scenario: User asks to continue deciding
- **WHEN** an active draft exists and its exact IDs are available
- **THEN** the assistant uses `update_product_review_conversation` show to inspect it without starting another draft or reading the Nemlig basket as a substitute
