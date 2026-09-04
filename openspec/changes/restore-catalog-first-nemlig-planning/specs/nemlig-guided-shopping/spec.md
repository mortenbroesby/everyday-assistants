## REMOVED Requirements

### Requirement: Favorites-first candidate resolution
**Reason**: Automatic favourite lookup makes ordinary catalogue discovery slow and brittle, and it contradicts the owner's desired selection model.

**Migration**: Ordinary planning searches current catalogue inventory. Users who want a saved favourite request favourite browsing or selection explicitly.

## ADDED Requirements

### Requirement: Catalog-first candidate resolution
The system SHALL search the current general catalogue for each ordinary grocery line, SHALL return bounded candidates without selecting a product automatically, and SHALL NOT fetch or prefer authenticated favourites unless the user explicitly requests a favourite operation.

#### Scenario: Ordinary grocery line
- **WHEN** a user plans a grocery line without requesting favourites
- **THEN** the system searches current catalogue inventory, returns suitable catalogue candidates, and does not fetch favourites

#### Scenario: Explicit favourite request
- **WHEN** a user explicitly requests browsing or selecting from saved favourites
- **THEN** the system may fetch favourites and returns favourite candidates without silently substituting a catalogue result

#### Scenario: Several candidates remain plausible
- **WHEN** more than one catalogue candidate remains after filtering and ranking
- **THEN** the line remains unresolved until the client supplies an exact selected product ID

#### Scenario: Exact returned product is selected
- **WHEN** a client supplies the ID of a product previously returned by current discovery
- **THEN** the system resolves that exact product without requiring a differently worded text query to find it again

#### Scenario: Discovery is unavailable
- **WHEN** catalogue discovery fails or exceeds its permitted execution window
- **THEN** the line reports discovery as unavailable rather than claiming that no eligible product exists

#### Scenario: Catalogue contains no usable candidate
- **WHEN** catalogue discovery succeeds but returns no candidate satisfying the line constraints
- **THEN** the line is returned as unresolved with a concise no-candidate reason and no proposal is prepared
