## Context

See `proposal.md` for motivation. The Nemlig client already retrieves authenticated favorites; the CLI exposes `favorites`; the MCP server exposes read-only `list_favorites` and shared candidate tagging; exact basket additions already use separate prepare and apply tools.

## Goals / Non-Goals

**Goals:**

- Add one small favorites matching function that both CLI and MCP paths reuse.
- Preserve current list behavior and the existing basket approval boundary.
- Keep the initial network scan bounded and dependency-free.

**Non-Goals:**

- Language detection, translation, fuzzy matching, stemming, or catalog fallback.
- A new auto-selection rule or a combined search-and-add mutation.

## Decisions

1. Extend the existing favorites surfaces instead of adding parallel commands or tools. The CLI becomes `favorites [query]`, and `list_favorites` gains an optional query. This preserves compatibility and avoids another interface that would duplicate authentication and result formatting.

2. Put the pure matcher beside the product model and reuse it from CLI and MCP. It trims the query, applies `toLocaleLowerCase("da-DK")`, filters by product-name substring, preserves source order, and applies the requested result limit after matching. A custom translation table or fuzzy-search dependency is unnecessary for the first Danish-first slice.

3. Search a bounded pool of up to 100 favorites before applying the caller's result limit. This reuses the proven authenticated favorites retrieval path and is enough for the initial workflow without pagination work. The implementation will mark this deliberate ceiling with a `ponytail:` comment and name pagination as the upgrade path.

4. Pass filtered products through the existing MCP candidate normalization and tagging. Multiple results remain visible; `recommended` is advisory metadata, not authority to prepare or apply a basket change.

## Risks / Trade-offs

- [A matching favorite falls beyond the first 100 retrieved favorites] → Keep the ceiling explicit and add full favorites pagination only if real usage reaches it.
- [Danish inflection, misspelling, or an English term produces no match] → Return an empty result; translation and fuzzy matching remain a later, evidence-led change.
- [A query matches several favorites] → Preserve all bounded matches for conversational choice and retain exact proposal approval before any addition.

## Migration Plan

Ship as backward-compatible optional inputs. Rollback removes the optional query handling and shared matcher; existing favorites listing and basket proposal behavior remain unchanged.
