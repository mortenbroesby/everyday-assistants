## ADDED Requirements

### Requirement: Self-contained picker resource
The server SHALL serve the optional picker as a locally built, self-contained HTML resource whose executable JavaScript and styles require no network origin, SHALL allow only approved direct HTTPS product-image origins, and SHALL preserve the existing picker feature gate and conversational fallback.

#### Scenario: Render picker without executable network access
- **WHEN** a compatible client loads the enabled picker resource with external executable network access unavailable
- **THEN** the picker renders and handles structured tool results using only the served resource while approved product images remain optional

#### Scenario: Inspect picker resource policy
- **WHEN** a compatible client receives the picker resource metadata
- **THEN** its content-security policy declares no executable script or style origin and declares only the approved product-image origins

#### Scenario: Render hostile product content
- **WHEN** a tool result contains product text or image URLs that attempt markup, script execution, or an unapproved origin
- **THEN** the picker displays the text as inert content, omits the unapproved image, and performs no injected action

### Requirement: Bounded picker host lifecycle
The picker SHALL establish one host session per mounted resource, register result handling before connecting, dispose that session when the resource unmounts, and send at most one choice message for each deliberate user activation without automatic retry, reconnect, polling, or repeated send.

#### Scenario: Result arrives during connection
- **WHEN** the host delivers a tool result while the picker connection is being established
- **THEN** the picker receives and renders that result without requiring a second connection

#### Scenario: User sends a choice
- **WHEN** the user activates an available candidate action once
- **THEN** the picker sends exactly one message containing that deliberate choice and disables duplicate activation while the send is pending

#### Scenario: Choice send fails
- **WHEN** the host rejects or fails the choice message
- **THEN** the picker reports a concise failure, performs no automatic resend, and permits a new deliberate activation

#### Scenario: Picker unmounts during pending work
- **WHEN** the resource unmounts while connection or message work remains pending
- **THEN** the picker disposes its host session and ignores stale completion without sending another message
