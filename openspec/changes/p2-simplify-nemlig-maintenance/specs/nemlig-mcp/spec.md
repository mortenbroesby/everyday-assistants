## ADDED Requirements

### Requirement: Bounded plain-text product evidence

Product descriptions and attribute evidence returned to MCP clients SHALL decode HTML entities into readable text, omit markup and script/style content, and preserve useful text boundaries. Descriptions SHALL remain at most 2,000 characters; each of at most 20 attributes SHALL retain key/value ceilings of 100/300 characters. Conversion SHALL be bounded before processing, SHALL omit missing or empty evidence, and SHALL NOT fetch linked resources or change product identity, price, availability, or authorization.

#### Scenario: HTML contains entities and quoted delimiters

- **WHEN** provider evidence contains named/numeric entities or a greater-than sign inside a quoted HTML attribute
- **THEN** clients receive readable decoded text without leaked attribute fragments and within the existing field ceilings

#### Scenario: Evidence contains non-content elements or oversized input

- **WHEN** provider text contains scripts, styles, linked resources or an input exceeding the conversion budget
- **THEN** the system returns only bounded available textual evidence without script/style contents, resource fetches, HTML execution or raw-payload logging

#### Scenario: Evidence is absent

- **WHEN** a description or attribute is missing, non-textual or empty after conversion
- **THEN** it is omitted without inventing product facts or preventing the remaining valid product fields from being returned

### Requirement: Explicit public shopping-list response contracts

Shopping-list MCP tools SHALL publish concrete schemas for their returned public list and summary structures and SHALL return data conforming to those schemas. Valid existing public field names and meanings SHALL be preserved. Persisted ownership scope and credential/internal metadata SHALL NOT be exposed through schema reuse.

#### Scenario: A list tool returns successfully

- **WHEN** a list is created, opened, listed, updated, copied, archived or restored through a supported tool
- **THEN** its structured result conforms to the declared public schema while preserving list identity, revision and the existing tool's public fields

#### Scenario: An internal object is accidentally returned

- **WHEN** a result contains private ownership metadata or violates the declared public field types
- **THEN** contract verification rejects it rather than accepting an arbitrary object or leaking internal fields to clients
