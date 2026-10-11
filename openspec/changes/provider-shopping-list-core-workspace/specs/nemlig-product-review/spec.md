## MODIFIED Requirements

### Requirement: Explicit protected submission
The system SHALL submit only the local resolved lines through an exact provider
review and subsequent explicit approval. Editing the draft SHALL invalidate its
pending submission. Unresolved lines SHALL never be submitted implicitly. All
existing freshness, single-use, principal, mutation-lock and readback safeguards
SHALL remain effective. Unrelated real basket lines SHALL remain unchanged. The
submission SHALL use a verified Nemlig shopping list and one native
list-to-basket transfer; it SHALL not fall back to individual product basket
writes.

#### Scenario: Local selection is complete
- **WHEN** the user requests submission of Ready products
- **THEN** the system prepares exact current quantities, estimated prices and effects for
  approval without applying them

#### Scenario: Approved submission succeeds
- **WHEN** the user approves the unchanged current submission review
- **THEN** the system applies it once through the native provider-list transfer,
  returns verified Nemlig basket readback, retains the Draft list and marks the
  submission outcome truthfully

#### Scenario: Provider-list submission is unavailable
- **WHEN** provider-list preparation cannot be established
- **THEN** the system fails before a provider basket write and does not substitute
  individual product additions

#### Scenario: Submission fails or becomes uncertain
- **WHEN** application or readback fails
- **THEN** the Draft list remains intact, the outcome is explicitly uncertain or
  failed, and the system does not automatically retry the submission
