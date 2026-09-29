## Context

See proposal.md. The existing `show_my_basket` builds image-less summary views and intentionally performs no exact product reads. Search and exact detail results return safe image URLs but do not advertise the viewer; the local review does. The shared viewer can already render `views` without invoking provider calls.

## Goals / Non-Goals

**Goals:** Keep the ordinary basket read unchanged; give visual requests an explicit, bounded path through the current viewer; retain usable output when image or host rendering fails.

**Non-Goals:** Image proxying/storage, basket mutation, automatic ChatGPT card guarantees, or a new viewer/dependency.

## Decisions

- Add `show_my_basket_visually` with no input, read-only annotations, viewer metadata, and basket-compatible structured output. Keep `show_my_basket` unadorned to avoid extra egress and surprise UI openings. Reject the alternative of attaching a viewer to all basket reads.
- Read the basket once, enrich at most the first 12 lines with valid exact IDs in groups of three, and retain all other lines as summary views. Each detail read has an eight-second budget; an unsuccessful detail read falls back to the exact basket line, while an authentication failure propagates to the existing one-retry wrapper after its concurrent group settles. A mismatched product ID is rejected. This bounds provider load and latency while preserving the authoritative basket quantity and total.
- Reuse the existing product projection/image allowlist and `views` renderer. Give the visual result a distinct provider-basket heading and surface quantities in the collapsed row. Keep text output factual even if the host fails to mount the resource.
- Add the tool to the normal and service-tier allowlists and acceptance inventories; exercise it with read-only fixtures. Make instructions precise about the host rendering boundary rather than promising that ChatGPT will always show a card.

## Risks / Trade-offs

- Additional exact reads on visual requests can be slow or rate-limited → cap at 12, three concurrent reads, eight seconds per read, and keep normal basket reads unchanged.
- A transient auth failure could be mistaken for a missing image → let it reach authenticated retry; if retry fails, return the existing error, never a false complete gallery.
- ChatGPT may cache a prior tool catalog or suppress MCP Apps → expose a complete text fallback, describe visibility honestly, and verify with a fresh client and a live session only after separately approved deployment.

## Migration Plan

Merge after local/browser and exact-head CI checks. Hosted deployment is a separate approval gate. Rollback is the previous Worker version; the existing basket and local review contracts remain intact.
