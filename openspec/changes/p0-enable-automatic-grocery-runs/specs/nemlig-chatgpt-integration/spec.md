## MODIFIED Requirements

### Requirement: Direct normal ChatGPT use

The system SHALL support the complete recipe or conversation-list interpretation, named-list opening, current product resolution, automatic or manual selection, basket view, proposal, apply, verification, and coverage-summary workflow in normal ChatGPT Chat and Work conversations without requiring Codex or a packaged personal plugin.

#### Scenario: User delegates a grocery run

- **WHEN** the private app is available and the user asks ChatGPT to use a recipe, current conversation list, or named shopping list and explicitly says to proceed
- **THEN** ChatGPT can use the MCP tools conversationally to complete sufficiently clear additions in automatic mode without another approval question

#### Scenario: User starts a normal conversation

- **WHEN** the private app is available and the user asks ChatGPT to compile or carry out a Nemlig shopping list
- **THEN** ChatGPT can use the MCP tools conversationally and return either a read-only plan or a verified authorized result without invoking Codex

#### Scenario: User asks for choices

- **WHEN** the user explicitly requests manual choice or comparison
- **THEN** ChatGPT presents the bounded current candidates and does not apply an addition before the user chooses and authorizes it

#### Scenario: Picker is unavailable

- **WHEN** the client cannot render the optional picker
- **THEN** the same automatic and manual workflows remain available through conversational tools and structured results

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
