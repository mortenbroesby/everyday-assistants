## ADDED Requirements

### Requirement: Honest visual basket requests in ChatGPT
The direct ChatGPT integration SHALL direct requests to see the actual Nemlig basket visually to the explicit visual basket action, and requests to see an existing temporary local review visually to that review's show action. It SHALL distinguish provider-basket products from the temporary local review and SHALL NOT infer that cards rendered merely because product data contains image URLs. When the host does not show the viewer, it SHALL offer the complete text result and describe the rendering limitation honestly.

#### Scenario: User asks to see actual basket products visually
- **WHEN** the user asks ChatGPT to show actual Nemlig basket products as images or cards
- **THEN** ChatGPT calls the visual basket action and presents its returned product facts without claiming that image URLs alone are visible cards

#### Scenario: Client suppresses viewer
- **WHEN** ChatGPT receives image URLs but the host does not display the viewer
- **THEN** the conversation does not assert that cards appeared and can continue with the returned basket facts in text

#### Scenario: User asks to see chosen local-review products visually
- **WHEN** a temporary local review exists and the user asks to see those chosen products
- **THEN** ChatGPT reopens that review's viewer without changing the actual Nemlig basket or repeatedly fetching single-product details
