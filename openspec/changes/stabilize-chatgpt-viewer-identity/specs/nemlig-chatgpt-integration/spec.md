## ADDED Requirements

### Requirement: Permanent viewer identity

The integration SHALL advertise `ui://nemlig/shell.html` as its sole supported
current viewer identity. `_meta.ui.resourceUri` and `openai/outputTemplate`,
when both present, SHALL identify that same resource. Routine releases SHALL
retain this identity and serve a small stable shell that loads the current UI
bundle from the same-origin `/ui/nemlig/manifest.json` when mounted.

The integration SHALL distinguish server-state freshness from loaded-renderer
freshness. It SHALL NOT claim that an unchanged URI, successful tool result,
deployment, or connection acknowledgement proves that ChatGPT loaded current
HTML, JavaScript, or CSS. It SHALL NOT depend on an undocumented result-level
binding override or host cache invalidation mechanism. The shell SHALL accept
only same-origin content-addressed JavaScript and CSS assets with matching SRI
digests; its manifest request SHALL omit credentials, bypass caches, reject
redirects, and have a bounded timeout.

#### Scenario: Compatible viewer release

- **WHEN** a compatible viewer bundle is released
- **THEN** the advertised URI remains unchanged
- **AND** a fresh resource read returns the stable shell
- **AND** a new mount loads the bundle selected by the current manifest
- **AND** native loaded-artifact freshness remains a separate acceptance result

#### Scenario: Active shopping card spans a UI release

- **WHEN** a new UI manifest is deployed while a card is mounted
- **THEN** the active card keeps its current code and local interaction state
- **AND** it does not poll, hot-swap, or replay shopping actions
- **AND** a later mount loads the then-current bundle

#### Scenario: Manifest or asset is invalid or unavailable

- **WHEN** the manifest fails validation, times out, redirects, or its bundle
  cannot pass SRI
- **THEN** the shell shows an explicit retryable error with no shopping controls
- **AND** no manifest or asset request carries provider credentials

#### Scenario: Current data reaches a cached compatible renderer

- **WHEN** a supported renderer receives a confirmed current server snapshot
- **THEN** it renders that snapshot subject to current ownership, view and
  revision rules
- **AND** it does not infer that its renderer code has also been refreshed

#### Scenario: Renderer compatibility cannot be established

- **WHEN** a proposed release cannot preserve the supported renderer contract
- **THEN** it is not released under an assumption of automatic host refresh
- **AND** an explicit compatibility or operator cutover decision is required

### Requirement: Privacy-safe viewer binding evidence

For an authenticated `resources/read` request handled by the application, the
system SHALL support bounded evidence containing only the URI class `current`,
`retired`, or `other`, the current shell artifact identity when the shell is
successfully served, and a request-scoped diagnostic correlation.

Evidence SHALL NOT contain raw requested URIs, arbitrary URI components,
resource or tool payloads, shopping data, principal identifiers, conversation
identifiers, reusable session identifiers, cookies, credentials, or tokens.
An absent read event SHALL NOT be described as proof that the host fetched
current content.

#### Scenario: Current resource is served

- **WHEN** the current viewer resource is successfully read
- **THEN** evidence identifies the current URI class and exact served artifact
  with request-scoped correlation
- **AND** the resource read makes no provider or shopping-state call

#### Scenario: Retired or unknown resource is requested

- **WHEN** a retired or unrecognized URI reaches the application read boundary
- **THEN** evidence records only its fixed URI class and request correlation
- **AND** it does not label the current artifact as served
- **AND** unknown URI input is never copied into diagnostic output

### Requirement: Operator-managed forward-only connection cutover

The supported migration SHALL be a clean connection installation or
reconnection initiated by the operator, followed by new conversations.
Previously published viewer identities SHALL remain permanently retired and
unsupported. The migration SHALL NOT copy historical cards, temporary draft
choices, activation, or submission approval into the new conversation.

The assistant and viewer SHALL NOT autonomously disconnect, reconnect,
replace an installation, alter OAuth configuration, or repeatedly refresh
metadata. Connection acknowledgement SHALL NOT substitute for descriptor,
resource, and native rendering evidence.

#### Scenario: Operator completes clean cutover

- **WHEN** the operator completes the approved clean installation or
  reconnection and opens a new conversation
- **THEN** acceptance checks the installed descriptor and native rendered
  artifact against the permanent identity
- **AND** no historical draft state or approval is replayed

#### Scenario: Binding remains stale after cutover

- **WHEN** the new conversation still renders a retired or unexpected artifact
- **THEN** delivery remains pending with the observed boundary recorded
- **AND** the system does not automatically reconnect again, publish another
  URI, or change credentials

## MODIFIED Requirements

### Requirement: Visible UI release acceptance

A UI release SHALL be reported delivered only after the connected ChatGPT app
advertises the intended review tools and permanent viewer identity and renders
the expected interactive artifact. Server deployment acceptance SHALL verify
the stable shell, manifest, content-addressed assets, artifact identities, and
resource metadata.

Server acceptance, operator connection cutover, and native UI acceptance SHALL
be recorded separately. Native acceptance SHALL include a new chat immediately
after the clean installation/reconnection and a second independent fresh chat
using that connection. Healthy endpoints, local smoke tests, and refresh
acknowledgements SHALL NOT imply native acceptance.

#### Scenario: Deployment succeeds but the app catalog is stale

- **WHEN** deployment succeeds but ChatGPT advertises or renders an old binding
- **THEN** UI delivery remains pending until the installed descriptor and
  native artifact are verified
- **AND** any operator intervention is recorded separately

#### Scenario: Local UI release test

- **WHEN** the release is tested with synthetic products and a fake provider
- **THEN** selecting and accepting a product changes only the local Ready state
- **AND** navigation back to To decide preserves the draft without provider writes
- **AND** protected-submission regressions use the fake provider only

#### Scenario: Native post-cutover acceptance

- **WHEN** the two required fresh chats use the new connection
- **THEN** each renders the expected current viewer build
- **AND** local selection, Ready transitions, quantity edits, and conversational
  edit/readback preserve the mounted viewer and server-authoritative state
- **AND** evidence records the source revision, descriptor binding, resource
  evidence when available, native build observation, and pass/fail outcome
- **AND** no real basket access or mutation is required by this acceptance

### Requirement: Inactive historical shopping cards

All viewer identities published before this cutover, including
`ui://nemlig/draft-list.html`, `ui://nemlig/product-viewer.html`, and the
published versioned product-viewer URIs, SHALL remain permanently retired.
Reads SHALL return inert notices
without bridge code, shopping controls, backend shopping calls, or automatic
migration. Historical cards using those identities are unsupported.

For the new permanent identity, host-supplied retained snapshots SHALL start
inactive without product hydration or shopping controls. Explicit activation
SHALL read the current conversation before rendering controls and SHALL NOT
restore expired drafts or prior approval. The app SHALL NOT infer message age
from time or shared browser storage.

After activation, unsolicited snapshots for a different draft SHALL NOT replace
or deactivate the confirmed current draft. Only a correlated current-state
read or recovery result can switch drafts. Activation SHALL NOT survive a
fresh mount.

Server authorization SHALL remain mandatory regardless of renderer age:
principal/conversation ownership, current-view authority, revision, exact
prepared authorization, freshness, single-use application, strictly additive
basket writes, verified readback, and uncertain-write no-retry behavior SHALL
remain enforced. Retirement SHALL NOT be represented as erasing host-cached code.

#### Scenario: Reopen or remount a transcript card

- **WHEN** the host supplies a retained snapshot to the permanent viewer
- **THEN** the card starts inactive
- **AND** explicit activation reads current state without replaying approval
  or recreating an unavailable draft

#### Scenario: Old revision is edited

- **WHEN** another card or conversation action has advanced the revision
- **THEN** the rejected action triggers at most one read-only refresh, clears
  transient selection, and reports the conflict without mutation replay

#### Scenario: Service cannot confirm the action

- **WHEN** a tool fails or times out without a known stale-state result
- **THEN** the card hides shopping controls and offers explicit read-only
  recovery without automatic mutation retries

#### Scenario: Retired resource is requested

- **WHEN** the host requests any pre-cutover viewer identity
- **THEN** it receives an inert unsupported-card notice
- **AND** the notice directs the user to the supported connection and a new chat
- **AND** it performs no automatic migration or backend call

#### Scenario: Host retains obsolete executable code

- **WHEN** the host displays code cached before retirement
- **THEN** that card remains unsupported and no claim of remote erasure is made
- **AND** all calls still face the current server authorization and safety checks

#### Scenario: Activated current card receives a duplicate host snapshot

- **WHEN** the same mounted review receives a matching result or globals update
- **THEN** it stays active, preserves compatible presentation state, and does
  not reopen or replace the card

#### Scenario: Historical snapshot arrives after current activation

- **WHEN** current draft B is confirmed and a delayed notification supplies A
- **THEN** the mounted frame keeps B active without another tool call, lost
  local selection, or renewed activation prompt

#### Scenario: Current draft changes by explicit recovery

- **WHEN** a correlated conversation-scoped recovery confirms current draft C
- **THEN** the frame can switch to C
- **AND** an unsolicited different-draft notification alone cannot switch it

#### Scenario: Historical frame remounts

- **WHEN** a supported card receives a new frame after prior activation
- **THEN** activation is lost and current state must be explicitly confirmed
  before shopping controls are shown
