## MODIFIED Requirements

### Requirement: Direct normal ChatGPT use

The system SHALL support the complete recipe or conversation-list interpretation, current product resolution, automatic or manual selection, basket view, proposal, apply, verification, and coverage-summary workflow in normal ChatGPT Chat and Work conversations without requiring Codex, a packaged personal plugin, or an interactive picker for ordinary planning.

#### Scenario: User delegates a grocery run

- **WHEN** the private app is available and the user asks ChatGPT to use a recipe or current conversation list and explicitly says to proceed
- **THEN** ChatGPT can use the MCP tools conversationally to complete sufficiently clear additions in automatic mode without another approval question

#### Scenario: User starts a normal conversation

- **WHEN** the private app is available and the user asks ChatGPT to compile or carry out a Nemlig shopping list
- **THEN** ChatGPT uses conversational structured results without automatically rendering a picker and returns either a read-only plan or a verified authorized result without invoking Codex

#### Scenario: Batch discovery is unavailable for a line

- **WHEN** ordinary planning reports discovery unavailable after its bounded authentication recovery
- **THEN** ChatGPT can use the advertised direct catalogue-search tool for each affected normalized line and continue the read-only conversation without requiring UI

#### Scenario: User asks for choices

- **WHEN** the user explicitly requests visual choice or comparison and usable current candidates exist
- **THEN** ChatGPT may present the bounded candidates through the interactive picker and does not apply an addition before the user chooses and authorizes it

#### Scenario: Visual choice has no usable candidate

- **WHEN** an explicit visual-choice request returns no usable current candidate
- **THEN** the integration presents a clear non-actionable status without quantity or basket-preparation controls

#### Scenario: Picker is unavailable

- **WHEN** the client cannot render the optional picker
- **THEN** the same automatic and manual workflows remain available through conversational tools and structured results
