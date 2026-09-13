---
name: ui-prototyping
description: Rapidly mock up and compare proposed interfaces directly in the conversation before changing production UI code.
---

# UI prototyping

Use this skill when the user wants to see, critique, or compare an interface
before implementation. The outcome is a lightweight, interactive HTML/CSS
concept rendered directly in the conversation, not a production component or a
browser tab.

## Boundary

- Keep prototype work separate from production implementation. Do not create
  application routes, components, build entries, dependencies, or OpenSpec
  changes merely to show a design.
- Reuse the product's established language, content hierarchy, and visual
  conventions. Inspect an existing saved demo when one is named.
- Use realistic sample content, but make no network requests and perform no
  account, basket, order, payment, or other external mutation.
- Controls may update local presentation state only. Depict an unavailable or
  future mutation as disabled or omit it.
- Treat approval of the concept as design input, not authorization to implement
  or deploy it.

## Workflow

1. State the specific experience being explored and distinguish it from nearby
   flows that have a different user intent.
2. Find the most relevant existing demo or production surface and extract only
   the visual language that should carry forward.
3. Create one responsive HTML fragment in the current thread's durable
   visualization directory. Use literal HTML with scoped CSS, one unique root
   ID, semantic controls, and optional small local JavaScript.
4. Optimize the first render for the user's current device. For mobile review,
   use a single column, compact type, clear product islands, and touch-sized
   controls without oversized button chrome.
5. Render the fragment directly in the conversation. When the user is on a
   remote or mobile client, or an inline preview is not visible, render a
   phone-sized PNG in a headless browser and attach the image directly to the
   conversation. A local path or browser tab is not a substitute for the image.
   Do not open a visible browser tab unless the user explicitly asks for one.
6. Iterate on the same concept until the user approves it. Only then plan the
   separate production implementation.

## Product-card pattern

For grocery search and review concepts, prefer:

- one product per visually separate island;
- image and core facts first;
- a concise explanation of why the result fits;
- selection actions visually distinct from status labels;
- product description, declaration, and details in folded native `details`
  sections when content exists;
- alternatives or additional results folded or progressively revealed by
  default;
- no arbitrary two-option ceiling when the underlying result set can provide
  more.

## Verification

Before showing the concept, read the fragment back and confirm:

- it contains no document shell (`doctype`, `html`, `head`, or `body`);
- it contains no remote I/O (`fetch`, XHR, WebSocket, form submission, or
  navigation that changes external state);
- all CSS and DOM queries are scoped to the unique root;
- the first render is useful without interaction and fits down to 320 px;
- every interactive element is keyboard accessible and remains local;
- no credential, account, basket, checkout, or order data is present.

Use [Nemlig product exploration](examples/nemlig-product-exploration.html) as a
small reference implementation. Adapt its structure and content; do not turn it
into a shared production dependency.
