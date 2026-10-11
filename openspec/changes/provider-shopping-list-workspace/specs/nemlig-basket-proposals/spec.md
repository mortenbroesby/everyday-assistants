## ADDED Requirements

### Requirement: Provider list transfer is the only multi-item real-basket mutation

The assistant SHALL prepare and submit an accepted workspace through one app-owned provider shopping list and one native list-to-basket transfer. It SHALL NOT perform a per-product real-basket write loop or a per-product fallback after a transfer failure.

#### Scenario: Large accepted workspace is transferred once

- **WHEN** an exact authorized workspace contains 38 or more verified Ready products
- **THEN** the assistant issues at most one real-basket transfer request and verifies the additive final basket readback

### Requirement: Exact transfer authority is list-content bound

The assistant SHALL bind prepared authority to the authenticated owner, originating workspace/conversation, app-owned provider list ID, verified list fingerprint, reviewed product facts, expiry, and pre-transfer real-basket fingerprint. A changed list or basket SHALL invalidate the authority before transfer.

#### Scenario: Provider list changed after preparation

- **WHEN** list readback differs from the prepared fingerprint before transfer
- **THEN** no transfer is sent and the user must prepare a fresh exact review

### Requirement: Uncertain transfer is not retried

The assistant SHALL durably fence an attempted list transfer before dispatch. A timeout, malformed response, or unverified readback SHALL retain the fence and SHALL NOT automatically repeat the transfer or fall back to direct basket writes.

#### Scenario: Transfer outcome cannot be verified

- **WHEN** the provider request completes ambiguously or final basket readback fails
- **THEN** the workspace reports an uncertain outcome and blocks resubmission pending explicit inspection
