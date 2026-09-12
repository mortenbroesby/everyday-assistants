## Context

See [proposal.md](proposal.md). The MVP in this branch replaced the remote imperative picker with React 19, Tailwind 4, Apps SDK UI 0.2.2, and ext-apps 1.7.5. It preserved behavior and produced a deterministic 751,268-byte raw / 181,996-byte gzip artifact, but the browser pipeline combines tsdown output and Tailwind CLI output in a custom script, regex-deletes all `@font-face` rules, interpolates an HTML string, and deletes intermediates. The IIFE build also warns when Apps SDK UI references `import.meta`.

The current stylesheet uses `--text-primary`, `--background-primary`, and similar names while the kit/host publishes `--color-text-primary`, `--color-background-primary`, and related variables. The result often falls back to browser colors instead of the host design language.

OpenAI's Apps SDK UI documentation requires React 18/19 and Tailwind 4, documents its stylesheet/source order and per-component imports, and demonstrates React Strict Mode. MCP Apps' React integration supplies `useApp`, `useHostStyles`, and `useAutoResize`; its quickstart recommends Vite with `vite-plugin-singlefile` for a self-contained app resource. tsdown's CSS support remains explicitly experimental and does not provide a complete HTML browser pipeline.

## Goals / Non-Goals

**Goals:**

- Replace the MVP build workaround with the supported browser pipeline while retaining tsdown for Node.
- Establish the smallest shared Nemlig visual foundation with two real consumers: the production picker and a synthetic local showcase.
- Apply correct Apps SDK UI/host tokens, fonts, theme updates, and safe-area context through official hooks.
- Preserve the reviewed-proposal contract, deterministic packaging, accessibility, safety, cost controls, merge rules, and protected deployment acceptance.

**Non-Goals:**

- No new shopping capability, editable quantity, basket call, router, store, generic design-system abstraction, service, patched dependency, protocol-major upgrade, FP runtime, server orchestration conversion, or authentication change.
- No lazy React chunks or external application assets without measured evidence that the self-contained bounded view has become a bottleneck.

## Decisions

### 1. Use Vite for the browser and tsdown for Node

Keep the existing three Node entry points in tsdown 0.22.14. Add exact browser-build pins compatible with Node 22.23.1 and Tailwind 4.1.18: Vite 7.3.6, `@vitejs/plugin-react` 5.2.0, `@tailwindcss/vite` 4.1.18, and `vite-plugin-singlefile` 2.3.3. Remove `@tailwindcss/cli` and `@tsdown/css`.

Use a real HTML entry whose TSX imports the foundational stylesheet first. Vite's React, Tailwind, and single-file plugins emit the existing `dist/picker.html`; the UI build keeps Node outputs by disabling output-directory clearing. Delete the custom emitted-CSS rewrite/HTML assembler. Assertions inspect the finished artifact without rewriting it.

The picker stays one self-contained resource. React lazy loading and code splitting would still be inlined, add lifecycle complexity, and provide no transfer benefit at this scale. Native lazy images and progressive alternative disclosure remain.

### 2. Share only the production presentation that the showcase exercises

Keep browser-safe validation and business behavior under `src/picker/`. Put the shared stylesheet and the smallest shared root/pure reviewed-proposal view under `src/ui/`. The production container owns MCP host effects; the showcase supplies synthetic validated state and local simulated callbacks.

The showcase displays representative reviewed-list states: proposed and alternative products, favorite/confidence/availability/price/quantity/pantry/rejection treatment, loading, empty, malformed/connection failure, sending, send failure, and selected behavior across light/dark and narrow/wide examples. It reuses production presentation and clearly synthetic fixtures, makes no live Nemlig call, and is excluded from the production resource and tarball.

Future Nemlig visual work first adds its intended states to this local showcase and then uses the shared foundation. This is a routing convention, not a component registry, dashboard, Storybook deployment, or speculative widget library.

### 3. Use official host styling with narrow resource policy

Follow the library's documented CSS order: Tailwind, `@openai/apps-sdk-ui/css`, the package source declaration, then local foundation rules. Use real `--color-*` variables and `font-family: var(--font-sans, system-ui, sans-serif)`.

One `useApp` owner registers `ontoolresult` in `onAppCreated` before connection, uses `autoResize: false`, and pairs with the disposed `useAutoResize` hook. `useHostStyles(app, app?.getHostContext())` owns initial/live theme, variables, and authenticated host-provided fonts; operating-system appearance and system fonts remain the pre-connect/offline fallback. The root accounts for supplied safe-area insets.

The SDK's declaration commentary and shipped cleanup behavior conflict, so executable connection, cleanup, replacement, delayed completion, and remount tests define the lifecycle contract. Remove competing manual host-theme assignment and unsafe host casts when the official types cover them.

Import the complete documented Apps SDK UI CSS. Its unused KaTeX font declarations reference `https://cdn.openai.com`; do not regex-delete them. Permit only that exact optional font resource origin, the existing two product-image origins, no connect domains, no frames, and no external application scripts/styles/chunks. Blocked fonts/images must leave rendering and choosing functional. Tool-result content is never interpreted as CSS.

### 4. Preserve the browser-safe contract and behavior

Keep one Zod validator and approved image-origin rule, prefer structured content over JSON-text fallback, and create no parallel DTO hierarchy. Keep one synchronous duplicate-send lock and generation invalidation. The adapter sends exactly `Choose product <id> for <ingredient> instead.`, performs no automatic retry/reconnect/polling/resend, and exposes no proposal or basket tool.

Preserve `ui://nemlig/picker.html` because this is a behavior-compatible migration. If a future breaking resource revision is needed, update the URI, MCP registration, gateway allowlist, production inventory, tests, and package smoke together.

### 5. Verify the shipped result, then merge and deploy once

Extend the existing artifact/lifecycle/browser/package tests. Verify host theme/variables/fonts/safe areas, missing-host fallback, callback-before-connect, success/failure/duplicate/stale/unmount/remount behavior, hostile text and image origins, accessibility, offline fallback, deterministic clean builds, and clean tarball serving. Keep the decimal budgets of 1,500,000 raw bytes and 350,000 gzip bytes and record actual output.

Run the repository gates, make one package-scoped release decision, refresh the draft PR, wait for exact-head checks, merge through the active ruleset, verify the exact `main` revision, use the existing protected deployment workflow once, and run sequential read-only production acceptance. No basket/account/order state is read or mutated.

## Risks / Trade-offs

- [Browser build adds four development dependencies] -> Remove two superseded build dependencies and use the exact official-compatible cohort instead of maintaining custom bundling code.
- [Kit CSS names an optional OpenAI font origin] -> Allow only `https://cdn.openai.com`, keep all executable/application styling embedded, and verify offline fallback.
- [SDK lifecycle documentation conflicts with implementation] -> Treat focused executable lifecycle tests as the contract and retain one host owner.
- [Reusable foundation grows into a platform] -> Share only code already consumed by both production picker and synthetic showcase; add another abstraction only with another real visual consumer.
- [React increases parse/render work] -> Enforce current byte budgets and inspect browser timing before adding lazy loading or another optimizer.
- [Deployment changes hosted behavior] -> Preserve `NEMLIG_MCP_APPS`, existing quotas/kill switches, exact-revision checks, protected approval, and previous-release rollback.

## Migration Plan

1. Revise this change from MVP acceptance to the production foundation and keep the already verified MVP as baseline evidence.
2. Replace the browser build dependencies/configuration and prove deterministic `dist/picker.html` without post-build mutation.
3. Correct host styling/lifecycle, extract the shared pure view, and review the local synthetic showcase before production acceptance.
4. Update resource/CSP/package assertions and documentation; run focused and repository-wide gates.
5. Make one release decision, merge once, deploy the exact merged revision once, and complete sequential read-only acceptance.
6. Sync/archive this change and hand merged `main` to the separately parked Effect and agent-artifact branches.
