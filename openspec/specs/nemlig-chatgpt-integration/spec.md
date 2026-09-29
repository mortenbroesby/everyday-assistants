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

The system SHALL support independent product search, exact product lookup,
basket inspection, exact basket review, and explicitly approved apply in normal
ChatGPT conversations without requiring Codex, a saved planner, or a picker.
Selected local review results MAY render through one shared product viewer, with
complete conversational structured/text fallbacks.

#### Scenario: User searches for products

- **WHEN** the private app is available and the user asks for products
- **THEN** ChatGPT receives richly detailed products in provider order and may
  summarize them without mounting a viewer, then explicitly open one local
  review for selected products

#### Scenario: Viewer is unavailable

- **WHEN** the client cannot render the optional shared viewer
- **THEN** ChatGPT continues with the same structured and readable product data
  without requiring UI

#### Scenario: User approves an exact addition

- **WHEN** the user explicitly approves an unchanged exact review
- **THEN** ChatGPT can invoke the protected apply tool and receive verified
  basket readback

### Requirement: Honest visual basket requests in ChatGPT
The direct ChatGPT integration SHALL direct requests to see the actual Nemlig basket visually to the explicit visual basket action, and requests to see an existing temporary local review visually to that review's show action. It SHALL distinguish provider-basket products from the temporary local review and SHALL NOT infer that cards rendered merely because product data contains image URLs. When the host does not show the viewer, it SHALL offer the complete text result and describe the rendering limitation honestly.

#### Scenario: User asks to see actual basket products visually
- **WHEN** the user asks ChatGPT to show actual Nemlig basket products as images or cards
- **THEN** ChatGPT calls the visual basket action and presents its returned product facts without claiming that image URLs alone are visible cards

#### Scenario: Client suppresses viewer
- **WHEN** ChatGPT receives image URLs but the host does not display the viewer
- **THEN** the conversation does not assert that cards appeared and can continue with the returned basket facts in text

#### Scenario: User asks to see chosen local-review products visually
- **WHEN** a temporary local review exists and the user asks to see those chosen products
- **THEN** ChatGPT reopens that review's viewer without changing the actual Nemlig basket or repeatedly fetching single-product details

### Requirement: Authenticated favorites lookup

The system SHALL let an authenticated user list a positive bounded number of current Nemlig favorites as normalized products containing product ID, name, size, current price, and availability, without changing favorites or the basket.

#### Scenario: User lists favorites

- **WHEN** an authenticated user requests favorites with a positive limit
- **THEN** the client follows Nemlig's favorites-page product-group flow and returns at most that many normalized products without issuing a basket or favorite mutation

#### Scenario: Favorites lookup is unauthenticated or invalid

- **WHEN** no authenticated session exists or the requested limit is not a positive integer
- **THEN** the request fails before favorites are read and performs no mutation

#### Scenario: User selects a returned favorite

- **WHEN** a returned favorite is proposed for basket addition
- **THEN** its exact product data enters the existing proposal and basket-add workflow without a separate add-from-favorites mutation

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

The direct ChatGPT integration SHALL describe products, basket changes, and
verified results like a household shopping assistant rather than a transaction
log. It SHALL distinguish local review changes from Nemlig changes and SHALL require explicit
approval of the exact unchanged proposal before applying a basket change.

#### Scenario: ChatGPT reviews a prepared change

- **WHEN** ChatGPT receives a valid basket proposal without exact approval
- **THEN** it presents a clean summary of what would change and asks one simple
  approval question without showing opaque protocol fields by default

#### Scenario: User requests product comparison

- **WHEN** the user asks to see or compare products
- **THEN** ChatGPT presents current names, brands, package sizes, prices,
  descriptions, supported facts, and safe images when available without
  changing the basket

#### Scenario: ChatGPT confirms a verified result

- **WHEN** explicitly approved basket additions succeed and fresh readback
  matches
- **THEN** ChatGPT confirms the resulting shopping outcome without narrating
  proposal lifecycle or protocol mechanics

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

The integration SHALL use one shared product presentation for conversational
and touch review. Ready is a local selection of accepted products, not the
actual Nemlig basket. Both input modes SHALL address exact products in the same
temporary draft and support acceptance, changes, removal, quantities and safe
navigation. Business state SHALL remain server-authoritative. Actual submission
SHALL use the existing exact proposal/apply safety engine only after explicit
approval of an unchanged submission review.

#### Scenario: Product review is operated by voice

- **WHEN** the user accepts some products, changes another, or requests remaining
  unresolved items conversationally
- **THEN** the resulting snapshot matches the equivalent touch operations

#### Scenario: Complete product result is shown

- **WHEN** a search or exact lookup contains resolved products
- **THEN** every product appears once with its supported exact facts and context,
  without an automatic provider call or implied approval; local draft controls
  make no provider mutation, and a separate explicit protected confirmation may
  apply only its exact unchanged prepared submission

#### Scenario: User approves the exact basket review

- **WHEN** the user requests submission and explicitly approves the exact
  unchanged current review
- **THEN** the existing protected submission path performs fresh validation,
  single-use application and verified basket readback without clearing unrelated
  Nemlig lines or retrying an uncertain write

#### Scenario: Viewer is unavailable

- **WHEN** the client cannot render MCP Apps
- **THEN** the same snapshot, product facts, explicit submission review and local
  operations remain available through structured tools and conversation

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
- **THEN** selecting and accepting an exact product changes only Ready,
  and navigation back to In Review preserves both lists without provider writes

### Requirement: Inactive historical shopping cards
Host-supplied review snapshots SHALL start inactive without product hydration or
shopping controls. Explicit activation SHALL read the active conversation before
rendering controls. Retired known viewer resources SHALL resolve to inert notices
without backend shopping calls and offer a conversational route to the current
review. The app SHALL NOT infer message age from time or shared browser storage.

#### Scenario: Reopen or remount a transcript card
- **WHEN** the host supplies a retained review snapshot
- **THEN** the card shows an explicit Open current review action instead of historical products or mutations
- **AND** activation reads current state without replaying or restoring prior acceptance

#### Scenario: Old revision is edited
- **WHEN** another card or conversation action has advanced the revision
- **THEN** the rejected action triggers at most one read-only refresh, clears transient selection, and reports the conflict in plain language without raw protocol errors or mutation replay

#### Scenario: Service cannot confirm the action
- **WHEN** a tool fails or times out without a known stale-state result
- **THEN** the card hides shopping controls and offers explicit read-only recovery without automatic mutation retries

#### Scenario: Retired resource is requested
- **WHEN** the host requests a known retired viewer URI
- **THEN** it receives an inactive notice, not obsolete shopping controls or a missing-template response
- **AND** server changes make no claim to remove documents already cached by the host

#### Scenario: Activated current card receives a duplicate host snapshot
- **WHEN** the same mounted review receives a matching tool result or globals update
- **THEN** it stays active, preserves compatible presentation state, and does not
  reopen or replace the card
