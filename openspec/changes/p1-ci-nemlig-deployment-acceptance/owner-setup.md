Owner clarification (2026-09-09): this is one-time restricted CI setup, not an owner login required per release. Do not add a local owner-token acquisition client or change the shared API lifetime by default. First-cutover real-user evidence is separate from CI credentials.

# Owner setup and activation checklist

Status: PROVIDER SETUP COMPLETE. On 2026-09-09 the protected `nemlig-production` environment was verified with the owner reviewer, exact `main` branch policy, two required secrets, three required variables, and readiness enabled. The owner accepted the routine synthetic / first-cutover-and-relevant-change live evidence matrix. Secret values remain outside repository evidence.

## Decisions to approve together after repository readiness

1. Accept the proposed release-class matrix: first cutover/changed authentication requires real-user/ChatGPT evidence; routine releases afterwards use machine-authenticated isolated fixtures and exact deployment checks, with no owner token.
2. Accept one default-off production synthetic service identity. It runs real auth/admission/HTTP/MCP code but cannot load credentials, call Nemlig, reach family data/admin tools or write any state. This adds a production trust boundary; local tests must prove its isolation before activation.
3. Accept one scoped Auth0 M2M application and token allowance within the existing plan, and an expiring Cloudflare deployment token with the smallest supported account/zone scope. Exact permissions and any account-wide residual authority must be supplied by Sol before approval; no plan upgrade is implicit.
4. Confirm production environment review: proposed manual dispatch from main, owner reviewer, owner self-review permitted for solo operation, no administrator bypass. If independent review is required, identify an available second reviewer first.
5. Confirm the first release window and initial maximum four supervised attempts/day; no automatic retries or scheduled runs. Additional attempts after recurring failures require cost/incident review.

## Read-only evidence Sol must prepare first

- GitHub repository/default branch, environment existence/protections, main/workflow protection and GITHUB_TOKEN permissions; initial inspection found PUBLIC/main with no environments and no repository secrets.
- Auth0 existing API canonical audience, issuer, user third-party grants/DCR settings, M2M plan allowance, available client authentication and service scope configuration. Do not change the existing ChatGPT client or user delegated grant.
- Cloudflare exact existing account/Worker/custom domain/Container/registry/DO resources, effective current safety/onboarding vars, secret binding names only and pinned Wrangler required API permissions. Do not export existing secret values.
- Current starting Worker version, application/image digest, source revision, enabled state and absence of active lease; historical runbook state is not current readback.
- Primary-doc support for any proposed OIDC exchange. `id-token:write` and Auth0 client assertions alone are insufficient. Default remains scoped CI tokens, no new broker.

## Approved provider configuration

**Lifetime decision:** retain the existing API-wide access-token lifetime. Do not change user-token lifetime for CI. The token helper requires at least 27 minutes remaining for the bounded release; the actual tenant setting, residual lifetime risk and M2M entitlement must be verified during one-time setup. Four runs per day imply at most 124 token requests in a 31-day month, excluding other clients; this is a budget, not proof of entitlement.

GitHub: create `nemlig-production` environment only after approved name/policy; configure selected branch `main`, chosen reviewers/self-review, no bypass and a readiness variable false until verification. Store only approved CI credentials as environment secrets. Workflow preflight must detect absent/unprotected setup; implicit environment creation is not setup. Keep public PR workflow credential-free.

Auth0: create one clearly named M2M acceptance application; authorize only the service-acceptance permission for the exact existing canonical resource, never Management API or the ordinary user permission. Record safe configuration metadata privately; never print client secret or access tokens. The runtime exact-client/subject binding is distinct from the family's owner identity. Keep the existing API-wide lifetime with at least 27 minutes remaining at release preflight; issue once per 25-minute-bounded release, without reissuance or refresh. Keep client credential expiry/rotation ownership explicit.

Cloudflare: owner creates the minimum-scoped expiring CI token only after Sol supplies verified Worker/Container/registry permission names; accept that provider scoping may be account-wide rather than one Worker. Store `CLOUDFLARE_API_TOKEN` securely in the protected environment. Account ID is configuration metadata. CI must not hold Nemlig credentials, principal-policy secret contents, encryption keys, owner access/refresh tokens or browser cookies. Runtime service identity configuration contains only its exact allowed public identifiers and feature switch, never the Auth0 client secret.

Rotation: owner owns a dated expiration/rotation record in a private password manager, replaces the environment secret through the secure UI, verifies one bounded token/API preflight, then revokes the old credential and verifies rejection. Auth0 client-secret rotation may invalidate the old value immediately: inspect supported overlap first and use a maintenance window if needed. No scheduled rotation service or GitHub secret-writing token is added. Revoking a client secret does not necessarily revoke already issued access tokens; account for the existing token lifetime and disable the runtime identity immediately for emergency denial. Cloudflare deployment-token revocation and runtime MCP kill switch address different threats.

## Verification and rollback of setup

Verify environment protections through metadata, token claims/allowed scope without values, real signed-auth service admission, forbidden real-data/admin/tool denial and unchanged quotas/capacity. An intentionally invalid token must cause no wake. Keep service and CI readiness disabled on any uncertainty. Before activation, confirm exact main/CI and class-specific cutover checks are available.

If setup fails, disable CI readiness/service identity and revoke newly created CI credentials as explicitly approved. Preserve the existing user client, owner credentials, live policy and deployment. If a release has begun, use the durable journal and ownership-safe recovery; never delete an active lease because the workflow UI says canceled. No provider resource deletion or family-credential rotation is incidental cleanup.

Record final public-safe evidence only: configuration/protection checks, source and Worker versions/image digest, timestamps, fixed check outcomes, cost observations, and whether setup is enabled. Keep actual secret values, subjects, emails, returned account data and raw provider payloads out of repository/chat/logs/artifacts.

## Release operation

Normal releases use `production:deploy -- --service <full-main-sha>`. The first release and changed runtime boundaries use `--service-cutover` with the same machine identity. Successful synthetic checks leave `live_acceptance_pending`; complete the approved real-user check through the existing connected app, then record its exact revision in `apps/nemlig-assistant/release/production-cutover.json` and finalize recovery only after the remaining journal conditions hold. The record begins with `acceptedRevision: null`; no historical or synthetic result fills it automatically.

GitHub inventory on 2026-09-09 confirms the protected environment and scoped configuration above. The committed workflow is available for an approved exact-main deployment.

## Scoped permission inventory (2026-09-09)

Pinned Wrangler 4.127.1 uses Worker version/deployment APIs and Container application/deployment/registry APIs. The proposed single-account token permissions are Account Settings Read, Workers Scripts Read/Edit, and Containers Read/Edit. These confer authority across that account, not just this Worker. No KV, R2, DNS, token-management or user permission is proposed. Custom-domain reconciliation may additionally require Workers Routes permission on the existing zone; its necessity remains to be demonstrated before granting it. This inventory is a setup candidate, not a verified token or successful deployment. See [Cloudflare permission catalog](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) and [Workers token template](https://developers.cloudflare.com/fundamentals/api/reference/template/).

GitHub's built-in job token supports Actions Read for native environment and branch-policy metadata. Environment-variable REST reads require a separate permission absent from workflow `permissions`; no new privileged GitHub token is introduced. Preflight checks native protections. The protected deploy job reads its readiness variable through `vars` after native approval and checks it before issuance/mutation. See [environment API permissions](https://docs.github.com/en/rest/deployments/environments) and [environment variable permissions](https://docs.github.com/en/rest/actions/variables).
