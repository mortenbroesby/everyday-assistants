# Nemlig ChatGPT Integration Specification

## Purpose

Defines the private single-owner ChatGPT integration that reaches the household Nemlig shopper through the hosted Cloudflare/Auth0 service, works without Codex or the owner's Mac, and does not enable checkout.

## Requirements

### Requirement: Rewrite prerequisite

The system SHALL apply this capability only after PR #8 is merged, the TypeScript rewrite change is complete and archived, and the merged Nemlig client, CLI, stdio MCP, tests, and picker pass focused verification.

#### Scenario: Apply begins before the rewrite is complete

- **WHEN** implementation begins and the expected rewrite baseline is absent, unmerged, unarchived, or materially different
- **THEN** application stops and reports the unmet prerequisite without copying implementation from the old feature branch

### Requirement: Direct normal ChatGPT use

The system SHALL support the complete search, list compilation, basket view, proposal review, apply, and verification workflow in normal ChatGPT Chat and Work conversations without requiring Codex or a packaged personal plugin.

#### Scenario: User starts a normal conversation

- **WHEN** the private app is available and the user asks ChatGPT to compile a Nemlig shopping list
- **THEN** ChatGPT can use the MCP tools conversationally and return structured review information without invoking Codex

#### Scenario: Picker is unavailable

- **WHEN** the client cannot render the optional picker
- **THEN** the same workflow remains available through conversational tools and structured results

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

The production integration SHALL accept only the configured Auth0 owner, SHALL obtain Nemlig credentials only from hosted secrets, and SHALL keep credentials, cookies, access tokens, authorization headers, internal session identifiers, and provider secret values out of tool results, logs, fixtures, committed files, and model-visible content.

#### Scenario: Unauthenticated or wrong-owner request

- **WHEN** a request has no valid token or belongs to another Auth0 subject
- **THEN** the gateway rejects it before the fixed backend performs a Nemlig operation

#### Scenario: Production login is required

- **WHEN** the hosted Nemlig client needs to establish or refresh its session
- **THEN** it uses the configured hosted credential pair without requesting a password through ChatGPT

### Requirement: Private hosted distribution

The supported integration SHALL remain private and single-household and SHALL NOT require public directory submission, public review credentials, or public multi-user account mapping.

#### Scenario: Hosted alpha is accepted

- **WHEN** the production acceptance suite passes and the owner keeps the app private
- **THEN** the hosted app remains the supported distribution without a tunnel registration or public listing

### Requirement: Hosted expansion requires a new security design

The system SHALL NOT extend the configured-owner hosted boundary to arbitrary family members, public users, multiple Nemlig accounts, checkout, payment, ordering, or delivery-slot mutation without a separate approved specification and identity-to-account design.

#### Scenario: Another household member is requested

- **WHEN** support for another Auth0 identity or Nemlig account is requested
- **THEN** the current single-owner implementation remains unchanged until a separate approved design defines identity mapping, isolation, revocation, quotas, and credential ownership

### Requirement: Human-friendly shopping conversation

The direct ChatGPT integration SHALL describe basket reviews and verified
results like a household shopping assistant rather than a transaction log. It
SHALL ask at most one clear approval question for an unchanged proposal and
SHALL NOT repeat model-visible protocol fields in ordinary user-facing replies
when they add no shopping value.

#### Scenario: ChatGPT reviews a prepared change

- **WHEN** ChatGPT receives a valid basket proposal and the user has not already explicitly approved every unchanged shopping detail
- **THEN** it presents a clean summary of what would change and asks one simple approval question without showing UUIDs, expiry language, internal statuses, or product IDs by default

#### Scenario: Earlier approval covers the unchanged change

- **WHEN** the user already explicitly approved every exact shopping detail contained in the unchanged prepared proposal
- **THEN** ChatGPT does not ask for approval again and may apply using the opaque proposal data without displaying it

#### Scenario: ChatGPT confirms a verified result

- **WHEN** an approved basket change succeeds and fresh readback matches
- **THEN** ChatGPT confirms the shopping result concisely and does not narrate proposal lifecycle or protocol mechanics

#### Scenario: User requests the underlying detail

- **WHEN** the user asks for identifiers, exact price calculations, expiry information, or troubleshooting data
- **THEN** ChatGPT may present the requested non-secret details without weakening approval, revalidation, single-use, or readback enforcement
