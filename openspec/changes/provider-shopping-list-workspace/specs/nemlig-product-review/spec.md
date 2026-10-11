## ADDED Requirements

### Requirement: Submission preparation builds an exact temporary provider list

For an authenticated Local basket, the assistant SHALL create and verify an
assistant-named provider shopping list only when the user prepares submission.
It SHALL add the exact current Ready product IDs and quantities serially, then
require a matching readback before it can prepare real-basket authority. A
malformed or mismatched list SHALL fail preparation without a real-basket
mutation.

#### Scenario: Prepared list matches Ready products

- **WHEN** a user prepares a Local basket with verified Ready products
- **THEN** the assistant creates and reads back a provider list with exactly
  those product IDs and quantities before showing a submittable confirmation

### Requirement: Local basket remains authoritative before submission

Until a separately approved workspace cutover, normal Local basket edits SHALL
remain local and SHALL NOT create or synchronize provider shopping lists.
Closing, reopening, or clearing a Local basket SHALL preserve the existing
Local-basket behavior and SHALL NOT restore any prepared submission authority.

#### Scenario: Quantity changes before preparation

- **WHEN** a user changes a Ready quantity before preparing submission
- **THEN** the Local basket updates under its existing contract and no provider
  shopping-list request is sent
