## Context

The deployed Container reads its package manifest at process startup and
already exposes `NEMLIG_VERSION`, `NEMLIG_CODENAME`, and
`NEMLIG_RELEASE_IDENTITY`. MCP instructions currently interpolate the latter.
ChatGPT can cache those instructions, whereas a tool call is dispatched to the
server handling that request. The pre-6.0.0 `get_profile` registration was an
authenticated, no-provider-read response carrying the request principal.

## Decision

Restore `get_profile` with an empty schema and `openai/profile` metadata. Its
strict structured result is:

```json
{
  "id": "stable-authenticated-profile-key",
  "release": { "version": "6.x.y", "codename": "SingleWord" }
}
```

The handler derives `release` from process runtime constants and reads only the
already-admitted request context. It does not call the Nemlig provider,
credential loader, product-review store, or viewer. It remains absent from the
machine-service acceptance inventory, which intentionally proves only the
provider-backed fixture surface.

Remove `Current release: ...` from instructions rather than trying to force a
metadata refresh or changing a resource URI. A profile call is live-server
evidence for a newly invoked request, not evidence that the host replaced a
historical resource/card.

## Risks and mitigations

- **Old clients retain cached tool metadata.** A metadata refresh/new
  connection may be necessary before ChatGPT lists the restored tool. The
  rollout must record that native-host limitation separately from source and
  deployment proof.
- **Profile access accidentally touches provider state.** A focused fake-client
  regression asserts no login or provider method runs.
- **Release identity drifts from package metadata.** Reuse the existing runtime
  constants and test exact manifest-derived values.
- **A pre-existing duplicate blocks all later releases.** Preserve the deployed
  6.0.0 `Clarity` identity, correct the older ledger/note row, and allow the
  validator's one-time migration only for historical duplicate-name rows. The
  resulting candidate ledger must again be fully unique.
