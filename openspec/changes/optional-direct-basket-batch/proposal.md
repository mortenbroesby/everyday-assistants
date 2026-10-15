# Direct basket drafts and bulk submission

Issue: #317

## Why

The review flow should keep selected products in a temporary draft, then add
all approved quantities to the existing basket in one provider request. Saved
Nemlig shopping lists remain useful as read-only sources that can be copied
into a fresh draft.

## Scope

- Make the temporary process-local draft the default review flow. Exact product
  selection and edits do not create or mutate a Nemlig shopping list.
- Support loading one exact saved shopping list into a new draft. Editing,
  abandoning, or submitting that draft never mutates the source list.
- Only explicit Submit sends one additive bulk request. Preserve the current
  basket with independent validated readback and a durable no-replay fence.
- After verified submission, offer a separate optional action that saves the
  entire current basket as a shopping list through the observed basket-to-list
  endpoint. Do not clear the basket or claim an unverified saved-list ID.
- Keep drafts process-local, owner-scoped, exact-context-bound, and expiring.
- Document first-party request provenance and state that live acceptance,
  atomicity, response shape, and provider limits are unverified.

## Non-goals

No production activation, live basket mutation, deployment, merge, checkout, or
payment. No persistent editable-draft mirror or automatic retries.
