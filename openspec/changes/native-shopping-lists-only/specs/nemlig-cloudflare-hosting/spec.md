## ADDED Requirements

### Requirement: No local shopping-content persistence
The hosted assistant SHALL NOT maintain local basket line storage, inventory,
identity mapping, expiry, eviction or heartbeat machinery. Native lists SHALL
remain the saved-content authority. Unrelated hosting and authentication Durable
Objects SHALL remain intact. Any retained durable submission metadata SHALL be
limited to preventing duplicate or unauthorized basket transfers.

#### Scenario: App restarts
- **WHEN** hosted process memory is lost
- **THEN** saved content is read from Nemlig, while uncertain submission fences
  survive independently and selection can be made again

### Requirement: Controlled local-storage retirement
Retiring the old storage namespace SHALL preserve unresolved submission safety
evidence and SHALL require explicit deployment approval of its data disposition.
The release SHALL validate lifecycle compatibility with the deployed tooling and
SHALL NOT claim code rollback restores permanently deleted namespace data.

#### Scenario: Old local basket is requested after cutover
- **WHEN** a caller presents a pre-cutover local ID
- **THEN** it receives an unavailable/selection response without automatic
  migration, native-list creation or restoration of provider authority

#### Scenario: Retirement finds uncertain transfers
- **WHEN** old storage contains unresolved submission attempts
- **THEN** destructive retirement waits for verified safety-metadata preservation
  or explicit reconciliation; it does not erase evidence and allow replay
