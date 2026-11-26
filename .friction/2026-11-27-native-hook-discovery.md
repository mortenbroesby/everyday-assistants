# Native hook manager does not discover candidate worktree hooks
- Date: 2026-11-27
- Scope: developer harness and native activation
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/370
- Revision: 717d50c9803e65b9c537b88c3937dbbe2e6c8cee
- Paths: .codex/hooks.json, .agents/hooks/friction-reminder.mjs, .friction/README.md
- Category: environment and validation
- Severity: medium
- Status: investigating

## Observation and evidence
The initial activation request referred broadly to the host `/hooks` interface.
The user asked whether remote iOS could perform this action, then explicitly
authorized approval through AppleScript or similar. Mobile hook-trust support
was not verified. The bundled Codex CLI reported version 0.169.0-alpha.11.1.
The first interactive launch remained at startup until cancelled; a second
launch with `--no-daemon` reached the native `/hooks` manager. Stop and Interrupt
each showed zero installed hooks. The Interrupt detail displayed “No hooks
installed for this event.” The candidate JSON defines one of each. The default
checkout JSON has only one PreToolUse entry. No hooks were trusted and no model
task was submitted. Both temporary CLI sessions exited.

## Impact
One human clarification about activation surface; two CLI launches, one cancelled
before reaching the manager. Native execution remains unverified despite passing
script/configuration tests and exact-head CI at 717d50c. Elapsed time, token cost
and recurrence across independent tasks were not measured.

## Hypothesis
Codex resolved the linked worktree's project layer through the main checkout.
The official hooks documentation explicitly permits this, but the exact source
resolution has not been traced. Discovery, rather than missing user permission,
is the current impediment. Startup delay cause is unknown.

## Improvement and validation
Activation instructions now require inspecting the source and installed events
before trust. Verify the loader's source resolution, then use the native review
interface to approve only the authorized Stop/Interrupt definitions. Observe
both events in the intended host before claiming activation; compare behavioral
trials separately. Do not overwrite the main checkout, trust unrelated hooks,
bypass trust or merge/deploy merely to obtain a passing probe.

## Resolution
Documentation correction is in draft PR #371; discovery and native execution
remain unresolved. User authorization persists for the two reminder hooks.
Source: https://learn.chatgpt.com/docs/hooks (reviewed 2026-11-27).

### Follow-up: standalone discovery and approval
A temporary standalone clone at the exact candidate `aca803f` exposed both
hooks in the same CLI. Each detail showed the clone's `.codex/hooks.json`,
the expected friction-reminder command, synchronous mode and a two-second
timeout. Under the user's explicit authorization, the project folder was
trusted and each reminder hook was approved individually through the native
interface. Readback showed Stop and Interrupt each installed 1, active 1,
review 0; five unrelated hooks remained untrusted. No model task was submitted.
This comparison supports linked-worktree source resolution as the cause. It
proves discovery and persisted trust in the standalone checkout only, not
activation in the original worktree or real Stop/Interrupt execution. The
standalone checkout is retained locally for those remaining validation steps.
