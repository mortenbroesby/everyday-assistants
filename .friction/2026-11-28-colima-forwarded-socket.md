# Running Colima VM with an unavailable host Docker socket
- Date: 2026-11-28
- Scope: Nemlig local development
- Task: #393
- Revision: 43c656f
- Paths: docs/local-auth-colima.md
- Category: environment
- Severity: medium
- Status: investigating

## Observation and evidence
Following the [previous daemon failure](2026-11-27-local-production-dry-run-daemon.md), Colima reported running and the host socket existed. Docker on the host failed to connect. Docker inside the VM responded with server version 29.5.2.

## Impact
Blocked starting a local container through the configured socket. Time and cost not measured.

## Hypothesis
The host socket forward may be stale. The underlying cause is unknown.

## Improvement and validation
Diagnose the engine and the socket independently before changing an existing VM.

## Resolution
A task-local Unix socket forwarded to the existing engine over Colima SSH returned server version 29.5.2. The shared VM and its data stayed available.
