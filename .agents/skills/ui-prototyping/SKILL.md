---
name: ui-prototyping
description: Preview and iteratively refine a proposed interface directly inside the Codex conversation before implementing it. Use when the user asks to see a mockup, demo UI, visual concept, or mobile preview, especially when they cannot open local files or browser windows.
---

# UI prototyping

Use this skill to make a proposed interface visible and interactive in the
conversation. The deliverable is an approval aid, not production code.

## Route here when

- the user asks to see, mock up, preview, compare, or iterate on a UI;
- the design should be approved before repository implementation; or
- the user is remote or mobile and cannot open a local path or browser window.

Do not use this skill for a requested production component, one-line CSS fix,
or implementation that the user has already approved. Route those tasks to the
normal application workflow.

## Direct-render contract

1. Load and follow the full `visualize` skill, including its mockup guidance,
   before creating the first preview and again before each later update.
2. Inspect the existing product surface that the mockup should resemble. Reuse
   its hierarchy, language, spacing, and controls instead of inventing a second
   design system.
3. Write one literal HTML fragment to the current thread's writable
   visualization directory. The file must have scoped CSS, one unique root ID,
   semantic controls, and only small local JavaScript when interaction helps.
4. Read the fragment back. Confirm that it has no document shell, remote I/O,
   secrets, or external mutation and that it remains usable at 320 px.
5. In the same response, emit the fragment with the host reference below,
   substituting the absolute path. This reference—not a Markdown link or a
   browser tab—is what makes the mockup visible on remote clients:

   ```text
   visualize{"path":"/absolute/thread-visualization/ui-mockup.html","title":"Concise mockup title"}
   ```

6. When the user requests a tweak, edit the same fragment and emit the reference
   again in that turn. Never assume a previously emitted preview refreshes by
   itself.

Do not substitute a local file link, `file://` URL, sandbox download, terminal
path, or visible browser window. If the host cannot render a `visualize`
reference, say that the required inline surface is unavailable rather than
claiming the user can see it.

## Prototype boundary

- Keep the fragment outside the application source tree unless the user asks to
  save or implement it.
- Make ordinary controls local and reversible. A control that asks the assistant
  to investigate may use `window.openai.sendFollowUpMessage` with the user's
  chosen context.
- Never call application APIs from the fragment. Do not use `fetch`, XHR,
  WebSocket, form submission, navigation, or account data.
- Do not mutate a basket, order, payment, account, or provider. A depicted final
  action is inert unless the user separately authorizes implementation and the
  production workflow supplies its safety contract.
- Treat visual approval as design input, not authorization to implement,
  deploy, or mutate external state.

## Mobile approval checklist

- Use one compact column and allow the host to size the frame to its content.
- Put product imagery beside primary text and reflow before text overlaps.
- Keep native checkboxes beside the item they control.
- Give buttons, inputs, and disclosure summaries touch targets near 44 px.
- Keep important information visible without hover.
- Use native `details` for progressively disclosed evidence when appropriate.
- Render realistic empty, unresolved, loading, and error states when they affect
  the decision being reviewed.
- Explain why retrying an unresolved search could work. Collect a changed query,
  constraint, or substitute instead of offering a blind retry.

## Canonical example

[Nemlig basket review](examples/nemlig-basket-review.html) is the accepted
conversation-first pattern. It reuses the product picker layout, keeps proposed
items selectable, progressively reveals product evidence and alternatives, and
collects a better query for an unresolved ingredient. Adapt it; do not import
it into production code.
