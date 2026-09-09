## Context

See `proposal.md` for motivation. Candidate filtering currently enforces dietary and price constraints but no relevance boundary, package size remains display text, and automatic clarity checks only product words. The plan schema's `quantity` is a package count. ChatGPT already has the best available place for conversational household preferences.

## Goals / Non-Goals

**Goals:**

- Add deterministic relevance, amount coverage, preferred-brand, and explicit-choice signals to the existing planning path.
- Keep old package-count callers working.
- Keep output factual and safe for later proposal preparation.

**Non-Goals:**

- General semantic search, a comprehensive food taxonomy, inferred quality scores, or automatic preference learning.
- New persistence, dependencies, provider requests, favourites writes, or basket mutations.

## Decisions

### Reject only clear category contradictions

Use normalized category, subcategory, name, and description tokens to reject known non-human product domains such as cat food, dog food, and pet supplies. Keep uncertain products eligible for manual review. This fixes the observed failure without adding a speculative taxonomy or an external classifier.

Alternative considered: require all query words to appear in product text. This would wrongly reject useful inflections, synonyms, and provider wording.

### Parse only common package units

Parse bounded Danish package text for mass (`g`, `kg`), volume (`ml`, `cl`, `l`), and count (`stk`). Convert within the same dimension, compute `ceil(requested/package)`, and expose covered and excess amounts. If parsing fails or dimensions differ, retain the candidate but exclude it from amount-based automatic selection.

Alternative considered: model every Nemlig unit. Current normalized data does not justify that complexity; unsupported units can remain an honest manual choice.

### Make explicit signals outrank price

Rank exact normalized preferred-brand matches first. For amount requests, rank sufficient combinations by least excess. Apply existing preference order after those signals, then unit and item price as deterministic tie-breakers. Price never serves as a quality score.

Alternative considered: maintain a hard-coded premium-brand table. It would encode subjective, stale household taste and require continuing maintenance.

### Keep preference memory in ChatGPT

Add `preferred_brands` and `require_choice` to a line. ChatGPT can pass a preference already stated by the user and mark categories such as ketchup as brand-sensitive when the conversation warrants it. The Nemlig service remains stateless for preferences.

Alternative considered: add per-principal category preference records and management tools. That recreates storage and lifecycle work immediately after saved-shopping removal. Add it only if live use shows ChatGPT memory is insufficient.

### Preserve package-count compatibility

Existing `quantity` remains the fallback requested package count. Optional `requested_amount` and `requested_unit` activate amount-aware calculation. Selected additions continue to contain exact integer package counts, so basket safety contracts remain unchanged.

## Risks / Trade-offs

- [A pet product lacks recognizable category metadata] -> Also inspect bounded product text and leave uncertain results unresolved rather than automatically selecting them.
- [Package text has an unsupported format] -> Return the raw package size, mark amount evidence unavailable, and prevent automatic amount-based selection.
- [ChatGPT omits a known preference] -> The line falls back to factual ranking or explicit choice; no hidden server default overrides the user.
- [Too many brand choices interrupt planning] -> `require_choice` is per-line and explicit; ordinary lines still use automatic clarity.

## Migration Plan

Add optional fields and output evidence without changing existing required inputs. Deploy through the existing protected production workflow, verify category rejection, 1 kg package comparison, Heinz preference, and a no-preference brand choice in the supplied ChatGPT conversation, then record acceptance. Roll back by deploying the prior accepted revision; no stored data requires migration.
