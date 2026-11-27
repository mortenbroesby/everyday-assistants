# Browser and native app recovery

Use for browser automation and native ChatGPT acceptance. Follow active host
restrictions and the app's authorization rules. The procedure does not grant
access, credential reads, new draft creation or provider mutations.

## Establish the failing boundary

1. Prefer a suitable connected tool. When actual rendering is required, inspect
   the existing browser. If one computer-use service fails to start or returns
   no surfaces, this proves only that control path failed. Check an available
   permitted fallback (PinchTab or Playwright) before asking the user to repair
   the environment. Do not bypass host restrictions on alternative tools.
2. Discover existing instances/tabs and reuse the task's dedicated browser.
   Do not assume the default instance is the signed-in one. Inspect only the
   relevant service; do not read credentials, cookies or unrelated profiles.
3. A blank page, disabled composer, transient login redirect or unresponsive
   tab is not sufficient proof that credentials expired. Re-observe the same
   tab after loading; check its current URL and visible state. If needed, try
   an existing working page's native navigation. After two uninformative
   attempts change the diagnostic, not the business action. Request sign-in
   only when current evidence establishes a login requirement.
4. Keep tool invocation, server response, host initialization, rendered content
   and local edit readback as separate observations. A text response saying
   “displayed” cannot prove the widget rendered. Inspect the actual widget;
   use a scoped visual capture when accessibility omits iframe content/tooltips.
5. An inline ChatGPT app timeout can coexist with a usable result. Inspect its
   timeout details, then use the host's native **Open app in tab** control on
   that existing result when available. This is not a new creation request.
   Verify the real products/quantities there before editing. Record successful
   recovery separately from the original inline failure; it is not a fix or a
   general reliability claim. Do not invent iframe links or rotate resources.
6. Preserve exact known draft/context handles. Never infer them, select the
   account's latest draft, or recreate an uncertain operation. A separately
   approved fresh trial is distinct evidence. An expired draft stays expired.

## PinchTab on a replacement host

PinchTab is optional. Install it from its official distribution if needed for
the authorized task; verify the installed CLI's help rather than assuming this
machine's version. Keep the API on `127.0.0.1:9867` (or the discovered loopback
port). Read [security guidance](https://pinchtab.com/docs/security/) before
remote access or sensitive capability changes; keep its API token private.

Start with `pinchtab health`, `pinchtab instance list`, and `pinchtab tab`.
Start `pinchtab server` only if needed. Discover instance ports; do not persist
old ports, tab IDs or account URLs in this repository. A sandbox loopback denial
requires the host's normal permission mechanism, not an authentication reset.

Prefer a scoped session when supported:
`pinchtab session create --agent-id <task-name>`.
If sessions are disabled, do not change configuration or restart a shared
server just to enable them. Explicitly target the discovered `--server` and
`--tab` for every observation/action that supports them. Selecting a tab once
does not establish safe targeting for later commands. If a command lacks tab
targeting, use a dedicated instance or another supported route.

- Obtain fresh refs with `snap`; refs belong to that tab and page state.
- Use installed `COMMAND --help` when flags differ. For example, `type` may
  not accept `--snap-diff`; follow it with a separate snapshot.
- Prefer `fill` for ordinary fields. For a rich-text composer, focus the
  observed field and use `keyboard inserttext` if fill does not persist.
  Read back the complete prompt before Send. Slow per-character typing can
  time out after partial input; do not append or resend without inspecting it.
- A navigation-related 409 after Send may indicate success. Inspect the new
  conversation before another click. Similarly, poll a running CLI session
  rather than starting a duplicate command.
- After a 503/unresponsive observation, activate and re-observe the same tab.
  Do not reload/recreate an uncertain operation. If two attempts add no
  information, inspect a different representation or use a permitted fallback.
- Failed iframe targeting is not evidence of an empty app. Inspect the native
  app panel visually or use supported frame inspection. Do not escalate to
  cookies, storage export, arbitrary page code or network-body capture.

## Evidence and handoff

Record selected tool, exact identity continuity (without publishing handles),
visible before/after state, observed actions and unknowns. Distinguish raw tool
traces from assistant-reported counts. Keep screenshots and private chat URLs
out of public issues. For Nemlig, use the
[connector recovery record](../../docs/chatgpt-connector-recovery.md) and
[failure compendium](../../docs/nemlig-failure-compendium.md). Record friction
without claiming these instructions have already reduced future recurrence.
