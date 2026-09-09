## Context

See `proposal.md` for motivation. The whole-list resolver already performs bounded direct catalogue reads with concurrency three, and the MCP wrapper already knows how to refresh an expired authenticated session once. The resolver currently catches every per-line error, including HTTP 401, before that wrapper can see it. Separately, `plan_my_shopping` statically advertises the shared picker, so ChatGPT renders an interactive surface even when all returned lines contain no candidates.

## Goals / Non-Goals

**Goals:**

- Reuse the existing single authenticated-read retry instead of adding another retry system.
- Preserve per-line isolation for non-auth discovery failures.
- Keep normal planning and direct-search fallback fully conversational.
- Restrict UI to the explicit visual-choice tool and make its empty state non-actionable.
- Keep the picker implementation small while improving the minimum product evidence needed for a useful choice.

**Non-Goals:**

- Adding a second batch endpoint, favourites fallback, speculative query rewriting, or a client-side retry loop.
- Changing proposal/apply authorization or any basket mutation behavior.
- Building a new component framework or design system for one embedded picker.

## Decisions

### Propagate only expired-authentication failures from planning

The per-line discovery catch will rethrow the existing typed Nemlig error when its status is 401. The outer authenticated-read wrapper will then log in from the same configured credential pair and rerun the read-only plan once. Every other discovery error remains an isolated `discovery_unavailable` line.

This reuses the shared recovery boundary and avoids duplicating credential loading or retry state inside the planner. Retrying each line independently was rejected because concurrent 401 responses could trigger repeated logins. Treating every discovery failure as fatal was rejected because one provider error must not erase otherwise useful lines.

### Advertise the existing direct search as the recovery tool

Server instructions and the planning tool description will tell the model to call `find_groceries` once for each normalized line that remains `discovery_unavailable`. The plan's existing line name and reason provide the required inputs, so no new tool or response envelope is needed.

Adding another fallback tool was rejected because `find_groceries` already follows the healthy direct-search path. Automatically issuing a second direct search inside the same planner was rejected because it would repeat the same provider operation after non-auth failures and hide useful failure distinctions.

### Remove UI metadata from ordinary planning

`plan_my_shopping` will no longer advertise the picker resource. Its structured result remains unchanged and usable by ChatGPT in both automatic and manual modes. `choose_products_visually` remains the only UI-associated discovery tool and must be used only for an explicit visual-choice request.

Conditionally attaching UI after a plan result was rejected because client support for result-level UI selection is not required to solve the current problem, and a static association is what caused the useless picker to appear.

### Delete guided-plan rendering from the shared picker

Once planning no longer owns the picker, the embedded resource only needs to render direct-search candidates. The obsolete multi-line form, empty quantity inputs, and batch-prepare path will be removed. Candidate cards will retain the approved image, product title, package, price, and availability, and will add the factual description when present. A zero-result state will contain a concise explanation and no controls.

This deletion is smaller and safer than maintaining a second guided-plan client that ChatGPT should no longer invoke.

## Risks / Trade-offs

- [A 401 can cause already-successful catalogue reads to run a second time] → Keep the existing single whole-operation retry and concurrency limit of three; the extra reads occur only during expired-session recovery and remain read-only.
- [One non-auth provider outage can still leave individual lines unavailable] → Preserve the honest failure reason and direct the agent to the already available `find_groceries` workaround rather than loop automatically.
- [Manual whole-list choice no longer opens a multi-line workspace automatically] → Return all candidates conversationally; open one explicit visual chooser only when the user asks for visual selection.
- [Removing plan rendering can expose stale assumptions in picker tests] → Characterize tool metadata and rendered zero/candidate states before deleting the unused branch.

## Migration Plan

1. Ship the planner authentication propagation, MCP metadata/instructions, picker deletion, and focused tests together.
2. Run the full repository verification gate and read-only production acceptance.
3. Deploy through the protected Nemlig production workflow.
4. Re-run the supplied multi-recipe chat and confirm that normal planning produces no picker, while direct fallback returns current products.
5. Roll back the single release commit if ChatGPT loses conversational planning or the explicit visual chooser fails; no stored data migration is required.
