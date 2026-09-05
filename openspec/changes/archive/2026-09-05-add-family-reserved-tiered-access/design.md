## Context

See `proposal.md` for motivation and the two delta specs for the behavior
contract. Today both Worker and Container authorize one configured Auth0 subject;
the gateway stores one global usage record in the fixed Container controller,
and the Container constructs one shared Nemlig client and proposal service.
Named lists already hash the authenticated subject, but legacy plan snapshots
are keyed only by opaque UUID. The production topology is one EU `lite`
Container with `max_instances: 1`, ten-minute sleep, fixed global quotas, and no
paid log drain.

## Goals / Non-Goals

**Goals:**

- Make the authenticated Auth0 subject the sole source of principal identity.
- Admit tiers atomically before backend wake while retaining the current global
  ceilings and fixed Container.
- Give each principal an independent Nemlig client, proposal service, session
  registry, and storage namespace.
- Keep production owner-only until separately configured invitees pass
  isolation acceptance.

**Non-Goals:**

- A user directory, invitation UI, self-service credential flow, second
  Container, external secret store, scheduled forecast job, or automatic billing
  action.
- Migrating or exposing private shopping data between principals.

## Decisions

### 1. Use one versioned encrypted principal-policy secret

Add one bounded JSON secret containing a schema version, budget policy, and a
small array of principals. Each entry contains the exact Auth0 subject, an
opaque random principal key, tier, enabled flag, and that principal's Nemlig
username and password. Parse it independently in Worker and Container with hard
entry and byte limits, unique subjects and keys, exactly one enabled Tier 0
owner, and no fallback between entries. Retain the legacy owner subject and
credential secrets only for a one-release migration check; remove their runtime
fallback before any invitee is enabled.

This keeps identity, tier, and credentials encrypted and changeable with the
existing Cloudflare secret mechanism without a code build or new service. A
Durable Object credential store was rejected because it would add encryption,
key-management, and mutation APIs; separate numbered environment variables were
rejected because they are difficult to validate atomically and easy to mix up.

### 2. Verify the token twice and derive identity only from it

Change Auth0 verification to return the validated subject after issuer,
audience, signature, expiry, and scope checks. The Worker resolves that subject
against its policy before any Durable Object access. It forwards the original
bearer token, not a caller-supplied principal header. The Container repeats token
verification and policy lookup, so a forged internal-looking header cannot pick
another account. Both boundaries convert the subject to the policy's opaque
principal key before using application state.

The alternative of trusting a Worker-added identity header was rejected because
the Container HTTP boundary already supports independent authentication and the
duplicate check is a small, established defense.

### 3. Extend the existing atomic admission record

Keep admission in the fixed Container-controller Durable Object and extend its
single transaction to hold:

- the existing global minute/day counts and breaker state;
- per-tier admitted and rejected minute/day/month counts;
- bounded per-principal minute counts keyed by opaque principal key; and
- the active policy revision used for the decision.

Protocol traffic remains authenticated but does not consume useful-operation
budgets. Useful requests first pass the existing global breaker, then the
principal rate limit, guest-reserve check, tier allocation, and forecast
threshold. A rejection writes only aggregate bounded counters and never starts
the Container process.

The month-end forecast is
`ceil(month_to_date * days_in_month / max(1, utc_day_of_month - 1))`, never less
than month-to-date usage. Using completed calendar days keeps the calculation
deterministic and deliberately conservative without a timer or billing API.
Configuration requires the Tier 2 threshold below Tier 1, both below the guest
allocation, and the guest allocation no larger than the derived monthly global
ceiling minus the Tier 0 reserve. Equivalent short-window constraints protect
the family reserve during bursts.

Separate Durable Objects per principal were rejected: they cannot atomically
protect one shared family reserve without another coordinator and would multiply
state and race surfaces.

### 4. Use bounded per-principal runtime contexts in the one Container

Replace the shared hosted client/proposal service with a context map keyed only
after Container-side authentication. Each context owns one `NemligClient` and
one `BasketProposalService`; each MCP transport stores the same principal key
and rejects cross-principal reuse. Bound the map to the parsed policy entry count
and retain each context only for the Container process lifetime so the existing
short-lived, principal-bound proposal replay/reconnect contract remains intact.
A policy-revision mismatch invalidates the transport, and a version or secret
deployment replaces the Container process and its contexts. Local CLI behavior
keeps the existing single client.

Named lists continue to use the existing hashed owner scope, fed by the opaque
principal key. New hosted plan snapshots use a principal-scoped storage route.
Only the Tier 0 migration path may read a legacy UUID-only snapshot, and a
successful explicit save writes it into the scoped format without deleting the
legacy record.

### 5. Keep evidence aggregate and activation manual

Add three fixed tier labels and a closed set of denial reasons to terminal
events. The owner usage endpoint reports tier totals and remaining headroom, but
never subjects, principal keys, per-principal counts, or shopping data. Default
configuration has one enabled Tier 0 entry and no enabled guest.

An invitee rollout is a separate operator transaction: install a disabled
secret entry, deploy disabled-first, verify owner compatibility and unknown-user
denial, complete two-account read-only isolation checks, then explicitly enable
that entry. Any basket-mutation proof still needs its own exact approval and is
not part of tier activation.

### 6. Preserve the current maximum cost envelope

No global quota, instance count, instance type, sleep setting, CPU/subrequest
limit, retry, deadline, logging destination, or provider changes. At 5,000
useful operations per day the request ceiling is at most 155,000 in a 31-day
month; tiering can reach it sooner but cannot exceed it. The one `lite` Container
can already be kept active continuously, so that is the conservative topology
worst case before and after this change.

Using Cloudflare's 2026 published rates, 31 days continuously active is about
$1.45 memory overage, $0.32 disk overage, and at most $2.90 CPU overage after the
Workers Paid inclusions, plus the existing $5 subscription and any Worker,
Durable Object, log, or egress overages. This is not a billing hard cap; the
existing USD 10 and USD 20 alerts remain advisory. Auth0's current Free plan
lists up to 25,000 monthly active users, so a private family allowlist does not
require an upgrade. Recheck both official pricing pages immediately before
implementation or activation and stop if the existing plan or rates make the
proposed ceiling materially higher.

Sources:

- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/billing/understand/usage-based-billing/
- https://auth0.com/pricing

### Implementation cost preflight (2026-09-05)

Official pricing was rechecked before implementation. The change introduces no
provider, paid feature, scheduled work, log drain, Container instance, or
capacity increase:

| Cost driver | Current maximum | Proposed maximum | Pricing consequence |
| --- | ---: | ---: | --- |
| Container topology | 1 EU `lite` instance | unchanged | No higher provisioned memory or disk ceiling |
| Useful operations | 5,000/day; 500 expensive/day | unchanged | At most 155,000 useful operations in a 31-day month |
| Worker CPU/subrequests | 100 ms / 8 per invocation | unchanged | No higher per-invocation ceiling |
| Durable Objects | 2 existing SQLite classes | unchanged | A bounded policy revision and counter record stays within the existing objects; no new object class or service |
| Workers Logs | Existing request-terminal events; no drain | Same bounded event count with fixed tier/reason fields | 20 million events/month remain included on Workers Paid; additional events remain $0.60/million |
| Auth0 | Existing Free tenant | Same tenant; owner-only at delivery | Free remains $0/month for up to 25,000 MAU |

At the documented 31-day continuously active Container worst case, the
unchanged `lite` allocation is approximately $1.45 memory overage and $0.32
disk overage; fully consuming its 1/16 vCPU continuously would add at most
approximately $2.90 CPU overage after included usage. Worker requests, Durable
Object storage/requests, logs, and EU egress retain their existing
usage-priced exposure and advisory alerts rather than a provider billing cap.
Tiering can consume existing ceilings sooner, but the implementation is not
permitted to raise them.

## Risks / Trade-offs

- [One secret contains several accounts] → Cap entries and bytes, validate the
  whole document atomically, never log it, and require a disabled-first rotation.
- [One Container multiplexes principals] → Use independent context objects and
  cross-principal negative tests; fail the entire request rather than fall back.
- [A conservative forecast can shed guests early] → Report the bounded reason
  and allow the owner to adjust thresholds without changing global ceilings.
- [A policy rotation races an existing session] → Bind sessions and admission to
  the policy revision and require reinitialization after revision change.
- [More users keep the same Container awake longer] → Retain sleep, one instance,
  global quotas, tier shedding, and advisory alerts; activation remains manual.
- [Legacy plans are not principal-scoped] → Permit read-through only for Tier 0,
  never for invitees, and migrate by copy without deleting recovery data.

## Migration Plan

1. Implement and test parsing, Auth0 subject return, atomic tier admission,
   principal contexts, scoped plans, aggregate evidence, and unchanged config
   invariants using synthetic identities and credentials only.
2. Recheck current Cloudflare and Auth0 pricing and record the before/after cost
   envelope. Stop if a paid upgrade, new service, or higher maximum is required.
3. Integrate exact-head green `main`. Do not configure an invitee.
4. With owner authorization, write an owner-only policy secret derived
   interactively from existing secrets without printing or committing values.
5. Deploy the exact revision disabled first, prove both routes reject and the
   Container is inactive, enable the same image, then verify Tier 0 read-only
   behavior, unknown-principal denial-before-wake, config, and aggregate usage.
6. Roll back by restoring the recorded starting Worker version and original
   secret set; verify owner health and keep the MCP disabled if policy state is
   uncertain.
7. Add and enable any Tier 1 or Tier 2 principal only in a later separately
   authorized activation using that principal's independent Auth0 and Nemlig
   account and the required two-account isolation acceptance.
