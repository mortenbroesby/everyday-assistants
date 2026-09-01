## ADDED Requirements

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
