# Run the Nemlig provider, tools, and viewer separately

From the repository root, use Node 24.13.0 and pnpm 9.15.9, then run `pnpm install --frozen-lockfile`. Each command starts its own fixtures. The viewer check also needs Google Chrome installed locally. To run all three manually, use `pnpm nemlig:smoke:agent`. It stops at the first failing segment.

| Segment | Command | What passes |
| --- | --- | --- |
| Provider adapter | `pnpm --filter nemlig-assistant journey:provider` | The production Nemlig client builds requests, interprets simulated storefront responses, and handles provider errors and cancellation against scripted HTTP fixtures. |
| MCP tools | `pnpm --filter nemlig-assistant journey:tools` | A generic MCP SDK client connects over loopback HTTP with a synthetic identity, discovers the tools and viewer URI, sees the fixture milk in ordinary MCP text content, opens a draft and retrieves its HTML viewer resource, edits the quantity, and reopens the exact draft. It carries the two returned draft handles between calls without a host-specific session hint. |
| Rendered UI | `pnpm --filter nemlig-assistant journey:ui` | The deterministic widget smoke builds the viewer, opens the actual MCP tool result in Chrome, changes an oat drink quantity in the rendered card, and reads the edited quantity back on the original draft through MCP. |

Use the affected segment while iterating on a focused fix. After substantial or cross-segment changes, run the aggregate command before handoff. If a segment fails, rerun it after the fix, then run the aggregate again. These checks work with Colima stopped.

## When to go deeper

- **Model-selected tools.** `pnpm --filter nemlig-assistant eval:conversation` sends two Danish prompts through the signed-in Codex CLI and carries the model-selected draft into the simulated browser host. This uses the signed-in model account. See [model routing](nemlig-local-conversation.md#exercise-model-routing).
- **Thorough pre-deployment rehearsal or a runtime-specific change.** Check `docker info` first and reuse a healthy engine. On a Mac configured for Colima, check `colima status`. If the intended default development profile is stopped, run `colima start` and verify `docker info` succeeds. For a named profile, select that profile explicitly. Then run the Wrangler check. `pnpm --filter nemlig-assistant journey:local` exercises the authenticated local Wrangler and Docker path and reports the container state and measured timings alongside each protocol outcome. See [Colima socket troubleshooting](local-auth-colima.md#a-running-colima-vm-with-an-unavailable-host-socket) if only the VM can reach the engine. A successful health check confirms startup. Record cold and warm results only when both signed MCP discoveries pass. On the tested Colima VM, both health checks passed but discovery returned HTTP 504 at the backend deadline.
- **Broader viewer regressions.** Run `pnpm --filter nemlig-assistant build:ui` followed by `pnpm --filter nemlig-assistant smoke:review-ui` for the adapter and packaged-viewer Playwright suites.
- **Real provider read.** The optional `auth:local:provider` operator check uses a development Auth0 user token and connected Nemlig account to search and read the basket through local Wrangler. Follow the [operator runbook](local-provider-check.md).

The provider suite uses synthetic upstream responses. The tools suite exercises the application’s protocol and a text result a client can display without HTML. The UI suite exercises the renderer inside a host simulator. Native ChatGPT and Copilot each control tool selection, consent, and support for embedded resources. Record a visible card or text fallback in the actual host when assessing those behaviors. The [native ChatGPT runbook](nemlig-chatgpt-smoke-test.md) covers installed-connector acceptance.
