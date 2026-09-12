## ADDED Requirements

### Requirement: Self-contained picker resource
The server SHALL serve the optional picker as a locally built, self-contained HTML resource whose executable JavaScript and application styles require no network origin, SHALL preserve `ui://nemlig/picker.html` and `text/html;profile=mcp-app`, SHALL retain the default-on feature gate and all recognized false spellings, and SHALL preserve conversational results when the resource is disabled or unsupported.

#### Scenario: Render without executable network access
- **WHEN** a compatible client loads the enabled picker while executable network access is unavailable
- **THEN** the picker renders and handles tool results using only the served resource while approved product images remain optional

#### Scenario: Disable the picker
- **WHEN** `NEMLIG_MCP_APPS` is `0`, `false`, `no`, or `off` ignoring case and surrounding whitespace
- **THEN** the picker tool and resource are absent while every conversational tool remains available

#### Scenario: Inspect resource policy
- **WHEN** a client receives the picker resource metadata and built HTML
- **THEN** the artifact contains no external application script, stylesheet, dynamic JavaScript chunk, or API fetch and `resourceDomains` contains only the approved Nemlig product-image origins plus the exact optional OpenAI font origin

### Requirement: Safe reviewed-proposal presentation
The picker SHALL use the shared Nemlig React and OpenAI Apps SDK UI foundation, SHALL prefer structured content over the JSON-text fallback, SHALL preserve loading, malformed, rejected, empty, ingredient, quantity, confidence, favorite, pantry, proposed-product, alternative, price, description, availability, and alternative-disclosure presentation, and SHALL render all untrusted product content without executable interpretation.

#### Scenario: Render a complete reviewed proposal
- **WHEN** a valid structured tool result contains proposed products, alternatives, rejected items, favorite matches, or pantry assumptions
- **THEN** the picker displays the existing factual fields, expands the existing low-confidence detail state, and offers actions only for available non-proposed alternatives

#### Scenario: Use text fallback
- **WHEN** structured content is absent and the text result contains the same valid JSON payload
- **THEN** the picker displays the same reviewed proposal without changing its authority or selection behavior

#### Scenario: Render hostile content
- **WHEN** product text or image URLs attempt markup, script execution, or an unapproved origin
- **THEN** text remains inert, the unapproved image is omitted, and approved images retain useful alt text, lazy loading, `no-referrer`, and broken-image fallback

#### Scenario: Reuse the component system
- **WHEN** proposed and alternative product cards render shared content or an enabled alternative action
- **THEN** both use one shared card implementation and the action/status styling comes from Apps SDK UI rather than a duplicated local component system

#### Scenario: Showcase intended visual states
- **WHEN** a developer opens the local Nemlig UI showcase
- **THEN** it uses the production presentation and foundational styles with clearly synthetic state, makes no Nemlig call, and demonstrates the reviewed design across representative success, progress, empty, error, light/dark, and narrow/wide states

#### Scenario: Follow the host theme
- **WHEN** the host supplies or changes supported theme, style variables, fonts, or safe-area insets, or no host context is available yet
- **THEN** official SDK hooks apply the authenticated host context, the picker uses operating-system appearance and system fonts as fallbacks, its layout respects safe areas, and blocked optional fonts do not prevent rendering or choosing

#### Scenario: Use an accessible narrow layout
- **WHEN** the picker is used with a keyboard at a 320 px viewport or 200% text zoom
- **THEN** disclosures and enabled actions remain operable with visible focus, action targets are at least 44 px, text meets WCAG AA contrast, and content does not require horizontal or nested scrolling

### Requirement: Bounded alternative-choice lifecycle
The picker SHALL have one host-session owner per mounted resource, register result handling before connecting, dispose or invalidate that session on unmount, and send the exact existing conversational alternative-choice message at most once per deliberate activation. It SHALL perform no automatic retry, reconnect, polling, repeated send, proposal application, or basket mutation.

#### Scenario: Result arrives during connection
- **WHEN** the host delivers a tool result while the initial connection is being established
- **THEN** the picker receives and renders the result without opening another connection

#### Scenario: User chooses an alternative
- **WHEN** the user activates an available non-proposed candidate for an ingredient
- **THEN** the picker sends `Choose product <id> for <ingredient> instead.` exactly once and disables duplicate activation while the send is pending

#### Scenario: Choice send fails
- **WHEN** the host rejects or fails the choice message
- **THEN** the picker reports a concise failure, performs no automatic resend, and permits one new deliberate activation

#### Scenario: Result changes or picker unmounts during pending work
- **WHEN** a newer result replaces the view or the resource unmounts while connection or message work remains pending
- **THEN** stale completion cannot alter the current view or trigger another message, and the old session no longer remains active
