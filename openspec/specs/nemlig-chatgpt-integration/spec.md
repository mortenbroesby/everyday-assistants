# Nemlig ChatGPT Integration Specification

## Purpose

Defines a private single-account ChatGPT integration that reaches the household Nemlig shopper through Secure MCP Tunnel, keeps credentials local, works without Codex, and does not enable checkout.

## Requirements

### Requirement: Rewrite prerequisite

The system SHALL apply this capability only after PR #8 is merged, the TypeScript rewrite change is complete and archived, and the merged Nemlig client, CLI, stdio MCP, tests, and picker pass focused verification.

#### Scenario: Apply begins before the rewrite is complete

- **WHEN** implementation begins and the expected rewrite baseline is absent, unmerged, unarchived, or materially different
- **THEN** application stops and reports the unmet prerequisite without copying implementation from the old feature branch

### Requirement: Private Secure MCP Tunnel deployment

The system SHALL connect the local stdio MCP server to one private ChatGPT Developer mode app through Secure MCP Tunnel and SHALL NOT expose a public network listener or unauthenticated internet endpoint.

#### Scenario: ChatGPT connects through the tunnel

- **WHEN** the local server and tunnel client are running and the private app invokes a tool
- **THEN** ChatGPT can discover and invoke the safe tool surface while the Nemlig password remains local

#### Scenario: Local tunnel is unavailable

- **WHEN** the local machine, MCP server, or tunnel client is offline
- **THEN** the app fails clearly without falling back to a public endpoint

### Requirement: Single-account access boundary

The first version SHALL use the tunnel association, its authenticated tunnel client, and the one associated ChatGPT account as its access boundary and SHALL NOT require separate app-level OAuth, user allowlists, OAuth subjects, or subject-to-account mappings.

#### Scenario: Private app is configured

- **WHEN** the owner creates the Developer mode app from the tunnel
- **THEN** the app is limited to the current private account context and does not request an additional Auth0 or OAuth sign-in

#### Scenario: Tool input supplies identity or account data

- **WHEN** a caller supplies an actor, subject, credential, or account selector as a tool argument
- **THEN** the server rejects or ignores it and continues to use only its local configured Nemlig account

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

### Requirement: Local credential boundary

The system SHALL load Nemlig credentials only from the post-PR #8 owner-only local credential mechanism and SHALL keep credentials, session state, tunnel runtime keys, cookies, and tokens out of Git and model-visible content.

#### Scenario: Nemlig authentication is needed

- **WHEN** the local client must sign in or refresh its session
- **THEN** it obtains credentials locally without requesting them through ChatGPT tool arguments or conversation

#### Scenario: Authentication or upstream failure occurs

- **WHEN** login, session refresh, tunnel access, or a Nemlig request fails
- **THEN** the user receives concise sanitized remediation without a credential, token, cookie, header, local path, stack trace, or raw upstream payload

### Requirement: Local session and mutation serialization

The system SHALL operate one local Nemlig session for the one configured household account and SHALL serialize every basket mutation with a process-local mutex.

#### Scenario: Concurrent writes arrive

- **WHEN** two apply calls target the shared basket concurrently
- **THEN** they execute one at a time and each revalidates current state inside the mutation lock

#### Scenario: Local process restarts

- **WHEN** in-memory session or proposal state is lost
- **THEN** the server reauthenticates through the local credential mechanism and never automatically retries an uncertain mutation

### Requirement: Accurate MCP metadata

The system SHALL advertise titles, descriptions, input schemas, output schemas, server instructions, and accurate readOnlyHint, openWorldHint, and destructiveHint annotations for every tool.

#### Scenario: Metadata is inspected

- **WHEN** MCP Inspector or ChatGPT scans the server
- **THEN** discovered metadata matches each tool's actual side effects and contains no secret-bearing values

### Requirement: Private developer-mode distribution

The first version SHALL remain a private Developer mode app and SHALL NOT require a packaged plugin or public Plugins Directory submission.

#### Scenario: First version is accepted

- **WHEN** the private tunnel workflow passes acceptance tests
- **THEN** it may remain privately connected without plugin packaging, public listing, public verification, review credentials, or public legal and support pages

### Requirement: Expansion requires a new security design

The system SHALL NOT extend this single-account tunnel trust boundary to hosting, public ingress, another ChatGPT account, or hosted Nemlig credentials without a separate approved specification.

#### Scenario: Broader access is requested

- **WHEN** always-on hosting, another account, public reachability, or revocable per-user access is requested
- **THEN** implementation stops until a new design covers OAuth 2.1, account binding, session isolation, hosted secrets, operations, and revocation

### Requirement: No secret disclosure

The system SHALL NOT return, render, log, persist in Git, or place in model-visible content any Nemlig password, cookie, access token, tunnel runtime API key, authorization header, local credential, or internal session identifier.

#### Scenario: Complete output surface is inspected

- **WHEN** tool results, UI properties, logs, errors, tests, fixtures, and committed files are reviewed
- **THEN** no secret-bearing value or reusable session material is present

### Requirement: No ordering capability

The direct integration SHALL NOT expose checkout, payment, purchase, order placement, or delivery-slot mutation through tools, skills, UI, prompts, or endpoints.

#### Scenario: Complete surface is inspected

- **WHEN** executable tools, resources, server instructions, skills, and app metadata are enumerated
- **THEN** none can place or pay for an order or change a delivery slot
