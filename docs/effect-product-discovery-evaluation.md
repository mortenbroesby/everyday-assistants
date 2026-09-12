# Effect product-discovery decision record

Effect 3.22.2 now owns the narrow asynchronous boundary for basket-aware batch
planning. Domain validation, candidate ranking, proposal creation, and basket
mutations remain plain TypeScript. The former native worker pool is retained
only under `scripts/` as a reproducible historical benchmark.

## Why Effect was adopted

Both implementations coalesce repeated request-local catalogue keys and cap
catalogue concurrency at three. Their normal-path latency is comparable for
the intended low-volume workload. The deciding behavior is failure lifetime:
Effect interrupts active abort-aware reads, leaves queued reads unstarted, and
does not return until the active reads have settled.

The native worker pool never exceeded three simultaneous catalogue requests,
but after a fatal basket failure or cancellation its workers continued through
all 24 queued reads. That was read-only work, not 24 concurrent requests or
basket writes, but it could waste provider capacity and overlap an
authentication retry with work from the failed attempt.

`p-limit` and `p-map` were not adopted. They can cap concurrency, but the
coordinator would still need custom signal composition, fatal-error
classification, queue cancellation, and explicit joining of interrupted
Promises. That is the lifecycle machinery Effect replaces here.

## Reproduction

From the repository root, without provider credentials:

```sh
pnpm install --frozen-lockfile
pnpm --filter nemlig-assistant benchmark:product-discovery
pnpm --filter nemlig-assistant demo:product-discovery
pnpm --filter nemlig-assistant check
pnpm --filter nemlig-assistant lint
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant smoke:package
```

The benchmark writes full machine-readable output to the ignored
`apps/nemlig-assistant/.product-discovery/benchmark.json`. The demo starts a
real HTTP server on `127.0.0.1`, invokes the actual CLI plan handler, uses Node's
real `fetch`, and closes its timers and sockets. Neither command contacts
Nemlig, reads credentials, or can mutate a basket.

## Measured results

Captured on Node 22.23.1, darwin x64, with seven repetitions and a deterministic
3 ms fake read delay:

| Workload | Native median | Effect median | Logical reads |
| --- | ---: | ---: | ---: |
| 1 unique line | 4.242 ms | 6.672 ms | 1 / 1 |
| 5 unique lines | 8.237 ms | 10.756 ms | 5 / 5 |
| 24 unique lines | 30.642 ms | 35.129 ms | 24 / 24 |
| 50 unique lines | 66.773 ms | 72.360 ms | 50 / 50 |
| 24 lines / 12 keys | 15.647 ms | 16.652 ms | 12 / 12 |

Both implementations held maximum catalogue concurrency at three. Ordinary
per-line catalogue failure intentionally remained non-fatal and completed all
24 reads.

| Fatal lifecycle | Native | Effect |
| --- | --- | --- |
| HTTP 401 | 24 reads; 21 queued starts after failure; 48.2 ms to quiescence | 3 reads; 0 queued starts; 17.7 ms to quiescence |
| Basket failure | 24 reads; 21 queued starts after failure; 34.7 ms to quiescence | 3 reads; 0 queued starts; 13.9 ms to quiescence |
| Caller cancellation | 24 reads; 21 queued starts after cancellation; 22.6 ms to quiescence | 3 reads; 0 queued starts; 12.4 ms to quiescence |

The credential-free loopback acceptance independently observed 12 catalogue
requests for 24 lines/12 keys, maximum concurrency three, and zero outstanding
requests after success. Basket failure and caller cancellation each started
only the initial three catalogue requests, started zero queued reads after the
fatal event, aborted the three active reads, and returned with zero outstanding
fetches.

Against clean `origin/main` at `0ec8d5b`, the complete built distribution grew
from 1,517,059 to 1,606,766 bytes (+89,707 bytes, 5.9%), including source maps
and the unchanged 754,910-byte picker. Effect remains an external runtime
import rather than being bundled, and the packed-package smoke test installs it
from production dependencies. The production coordinator is 111 lines; the
39-line native reference is outside shipped source.

## Operational boundary

The `nemlig plan <input-file>` CLI command parses and validates its strict JSON
input before login or provider work. It supports readable or JSON output,
SIGINT cancellation, and a bounded timeout. It reads the current catalogue and
basket but never creates a proposal or invokes a mutation.

An account-backed CLI acceptance was deliberately not run. A fresh
`NemligClient.login` currently asks the provider to merge a pre-login basket,
so login itself is not proven side-effect-free even though the planner calls no
basket mutation. Redesigning that login contract is separate work.

## Scope and rollback

Effect is justified only at this coordinated read boundary. Do not spread it
into schemas, ranking, proposal storage, UI state, or mutation code without a
new measured lifecycle need. If the dependency becomes untenable, the
benchmark-local native implementation documents the behavior that a replacement
must reproduce: signal composition, three-read concurrency, fatal queue stop,
error identity, and quiescence before return.
