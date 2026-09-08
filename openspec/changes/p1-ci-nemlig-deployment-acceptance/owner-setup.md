# Owner setup and activation checklist

Status: NOT PERFORMED. This is a reviewable setup plan, not evidence of provider changes. Repository implementation can proceed on ready packets without waiting for these external actions.

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

GitHub: create `nemlig-production` environment only after approved name/policy; configure selected branch `main`, chosen reviewers/self-review, no bypass and a readiness variable false until verification. Store only approved CI credentials as environment secrets. Workflow preflight must detect absent/unprotected setup; implicit environment creation is not setup. Keep public PR workflow credential-free.

Auth0: create one clearly named M2M acceptance application; authorize only the service-acceptance permission for the exact existing canonical resource, never Management API or the ordinary user permission. Record safe configuration metadata privately; never print client secret or access tokens. The runtime exact-client/subject binding is distinct from the family's owner identity. Proposed access-token lifetime is 30 minutes with at least 27 minutes remaining at release preflight; issue once per 25-minute-bounded release, without reissuance or refresh. Keep client credential expiry/rotation ownership explicit.

Cloudflare: owner creates the minimum-scoped expiring CI token only after Sol supplies verified Worker/Container/registry permission names; accept that provider scoping may be account-wide rather than one Worker. Store `CLOUDFLARE_API_TOKEN` securely in the protected environment. Account ID is configuration metadata. CI must not hold Nemlig credentials, principal-policy secret contents, encryption keys, owner access/refresh tokens or browser cookies. Runtime service identity configuration contains only its exact allowed public identifiers and feature switch, never the Auth0 client secret.

Rotation: owner owns a dated expiration/rotation record in a private password manager, replaces the environment secret through the secure UI, verifies one bounded token/API preflight, then revokes the old credential and verifies rejection. Auth0 client-secret rotation may invalidate the old value immediately: inspect supported overlap first and use a maintenance window if needed. No scheduled rotation service or GitHub secret-writing token is added. Revoking a client secret does not necessarily revoke already issued access tokens; use short expiry and disable the runtime identity immediately for emergency denial. Cloudflare deployment-token revocation and runtime MCP kill switch address different threats.

## Verification and rollback of setup

Verify environment protections through metadata, token claims/allowed scope without values, real signed-auth service admission, forbidden real-data/admin/tool denial and unchanged quotas/capacity. An intentionally invalid token must cause no wake. Keep service and CI readiness disabled on any uncertainty. Before activation, confirm exact main/CI and class-specific cutover checks are available.

If setup fails, disable CI readiness/service identity and revoke newly created CI credentials as explicitly approved. Preserve the existing user client, owner credentials, live policy and deployment. If a release has begun, use the durable journal and ownership-safe recovery; never delete an active lease because the workflow UI says canceled. No provider resource deletion or family-credential rotation is incidental cleanup.

Record final public-safe evidence only: configuration/protection checks, source and Worker versions/image digest, timestamps, fixed check outcomes, cost observations, and whether setup is enabled. Keep actual secret values, subjects, emails, returned account data and raw provider payloads out of repository/chat/logs/artifacts.
