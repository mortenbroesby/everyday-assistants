## ADDED Requirements

### Requirement: Closed submission failure evidence

A failed bulk addition SHALL preserve a closed dispatch/readback stage, finite failure category and HTTP status when available. A nonempty provider ValidationFailures array MAY be represented only as a boolean presence indicator. The assistant SHALL NOT log or persist raw provider errors, responses, credentials, headers or shopping payloads as diagnostics. Diagnostic persistence failure SHALL NOT release a dispatch fence or replace the original failure. Successful response validation warnings SHALL NOT replace independent additive readback.

#### Scenario: Dispatch or readback fails

- **WHEN** an HTTP, network, timeout, cancellation, response-parse or additive-readback failure occurs after dispatch authority was claimed
- **THEN** the safe diagnostic is exposed when available and the uncertain operation remains fenced without a mutation retry

#### Scenario: Provider response has validation failures

- **WHEN** a parsed bulk response contains a nonempty ValidationFailures array and subsequent readback is unavailable or mismatched
- **THEN** diagnostics can retain only its presence, not the array, codes or messages, and no write is repeated

### Requirement: Recovery compares quantities without attributing uncertain writes

Read-only inspection SHALL compare the operation's retained baseline and actual dispatched additions with the current basket. Legacy receipts without dispatched-line evidence SHALL explicitly label their comparison as reviewed intent. Each compared line SHALL identify before, requested, expected and current quantities. Missing or invalid comparison data SHALL be reported as unavailable. Only a persisted completed receipt SHALL identify the operation as completed; matching quantities SHALL NOT complete an uncertain receipt or authorize retry.

#### Scenario: Existing product did not increase

- **WHEN** a baseline of one and requested addition of one are followed by a current quantity of one
- **THEN** recovery shows expected two and current one without treating product presence as success

#### Scenario: Another writer produces expected quantities

- **WHEN** current quantities match the expected values but the operation receipt remains unconfirmed
- **THEN** recovery reports matching quantities and unconfirmed operation status, without releasing the fence
