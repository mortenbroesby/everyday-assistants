# Nemlig ChatGPT Integration Specification

## Purpose

Defines the private allowlisted ChatGPT integration that reaches isolated Nemlig shopper accounts through the hosted Cloudflare/Auth0 service, works without Codex or the owner's Mac, defaults to the owner only, and does not enable checkout.

## Requirements

### Requirement: Rewrite prerequisite

The system SHALL apply this capability only after PR #8 is merged, the TypeScript rewrite change is complete and archived, and the merged Nemlig client, CLI, stdio MCP, tests, and picker pass focused verification.

#### Scenario: Apply begins before the rewrite is complete

- **WHEN** implementation begins and the expected rewrite baseline is absent, unmerged, unarchived, or materially different
- **THEN** application stops and reports the unmet prerequisite without copying implementation from the old feature branch

### Requirement: Direct normal ChatGPT use

The system SHALL support the complete recipe or conversation-list interpretation, current product resolution, automatic or manual selection, basket view, proposal, apply, verification, and coverage-summary workflow in normal ChatGPT Chat and Work conversations without requiring Codex, a packaged personal plugin, or an interactive picker for ordinary planning.

#### Scenario: User delegates a grocery run

- **WHEN** the private app is available and the user asks ChatGPT to use a recipe or current conversation list and explicitly says to proceed
- **THEN** ChatGPT can use the MCP tools conversationally to complete sufficiently clear additions in automatic mode without another approval question

#### Scenario: User starts a normal conversation

- **WHEN** the private app is available and the user asks ChatGPT to compile or carry out a Nemlig shopping list
- **THEN** ChatGPT uses conversational structured results without automatically rendering a picker and returns either a read-only plan or a verified authorized result without invoking Codex

#### Scenario: Batch discovery is unavailable for a line

- **WHEN** ordinary planning reports discovery unavailable after its bounded authentication recovery
- **THEN** ChatGPT can use the advertised direct catalogue-search tool for each affected normalized line and continue the read-only conversation without requiring UI

#### Scenario: User asks for choices

- **WHEN** the user explicitly requests visual choice or comparison and usable current candidates exist
- **THEN** ChatGPT may present the bounded candidates through the interactive picker and does not apply an addition before the user chooses and authorizes it

#### Scenario: Visual choice has no usable candidate

- **WHEN** an explicit visual-choice request returns no usable current candidate
- **THEN** the integration presents a clear non-actionable status without quantity or basket-preparation controls

#### Scenario: Picker is unavailable

- **WHEN** the client cannot render the optional picker
- **THEN** the same automatic and manual workflows remain available through conversational tools and structured results

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
mapping, per-principal isolation, revocation, quotas, credential ownership, and
an explicit activation gate. It SHALL NOT extend access to arbitrary public
users, checkout, payment, ordering, or delivery-slot mutation.

#### Scenario: Another household member is requested

- **WHEN** support for another Auth0 identity or Nemlig account is requested
- **THEN** that principal remains disabled until its separate identity and
  account are configured, isolation acceptance succeeds, and the owner
  explicitly enables it under the approved tiered-access design

#### Scenario: Public access is requested

- **WHEN** an identity is not explicitly configured in the private principal
  policy
- **THEN** the current private implementation rejects it without public signup
  or fallback to another principal's account

### Requirement: Human-friendly shopping conversation

The direct ChatGPT integration SHALL describe choices, basket changes, verified results, and automatic coverage like a household shopping assistant rather than a transaction log. It SHALL show choices only when the user requests them or a line cannot be resolved clearly, SHALL not ask a redundant approval question when same-run automatic additions were explicitly authorized, and SHALL NOT repeat model-visible protocol fields in ordinary user-facing replies when they add no shopping value.

#### Scenario: Initial request authorizes automatic additions

- **WHEN** the user explicitly says to proceed with a recipe, conversation list, or named list and sufficiently clear additions resolve within that request
- **THEN** ChatGPT prepares and applies the unchanged authorized additions without displaying every candidate or asking another approval question

#### Scenario: ChatGPT reviews a prepared change

- **WHEN** ChatGPT receives a valid basket proposal that is not covered by same-run automatic authorization or exact earlier approval
- **THEN** it presents a clean summary of what would change and asks one simple approval question without showing UUIDs, expiry language, internal statuses, or product IDs by default

#### Scenario: Earlier approval covers the unchanged change

- **WHEN** the user already explicitly approved either every exact shopping detail or the same run's automatic additions scope and the prepared proposal remains unchanged
- **THEN** ChatGPT does not ask for approval again and may apply using the opaque proposal data without displaying it

#### Scenario: A line is genuinely unclear

- **WHEN** no candidate is a deterministic clear match or a hard requirement cannot be proved
- **THEN** ChatGPT leaves that line unchanged and presents only the useful product evidence needed for the user to choose or refine it

#### Scenario: User requests manual mode

- **WHEN** the user asks to see, compare, or choose products
- **THEN** ChatGPT presents current names, brands, package sizes, prices, descriptions and images when available, and does not apply an addition until the user chooses and authorizes it

#### Scenario: ChatGPT confirms a verified result

- **WHEN** authorized basket additions succeed and fresh readback matches
- **THEN** ChatGPT confirms what was added, reports automatic coverage and any unresolved lines concisely, and does not narrate proposal lifecycle or protocol mechanics

#### Scenario: User requests the underlying detail

- **WHEN** the user asks for identifiers, exact price calculations, expiry information, scoring detail, or troubleshooting data
- **THEN** ChatGPT may present the requested non-secret details without weakening authorization scope, revalidation, single-use, or readback enforcement
