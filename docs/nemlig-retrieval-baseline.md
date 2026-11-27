# Read-only catalogue retrieval baseline

Observed 2026-11-27 through the connected Nemlig Assistant plugin after explicit
owner approval of four searches. Each used `find_groceries` with the phrase
below and `result_count: 5`, sequentially, once. All four calls succeeded and
returned five distinct products. No draft, list, basket, login, configuration,
deployment or additional live operation was performed.

The rubric was recorded in programme #365 before execution. Judgments are
provisional assistant assessments from returned product facts, not independent
ground truth. They measure catalogue candidates, not end-to-end agent success.
The deployed SHA, provider-internal call count, token usage and monetary cost
were not observed. The local source inspected was `944afb2`; that does not
establish which commit handled the live requests.

## Results

R = relevant, I = irrelevant, B = borderline, U = unknown. Preserve provider
order. Unknowns are not counted as confirmed matches or forced negatives.

| Query | Rank 1–5 judgments | Confirmed matches | Precision@5 / range | Tool latency |
| --- | --- | --- | --- | --- |
| `havredrik` | R R R R R | 5 | 100% | 7.582 s |
| `prince kiks` | R I I I I | 1 | 20% | 2.561 s |
| `smør` | B I R R I | 2 | 40–60% | 1.979 s |
| `laktosefri mælk` | U U U I R | 1 | 20–80% | 1.800 s |

The ranges assign unresolved/borderline results to neither definite category;
their upper bound is not a claim of relevance. Across 20 results: 9 confirmed
matches, 7 irrelevant, 1 borderline and 3 unknown. All four searches succeeded
on the first tool attempt; no agent retry occurred. Latency measures elapsed
tool invocation time, including connector overhead; it is not isolated provider
latency. A slower first call does not establish a cold-start cause.

### Evidence behind the judgments

- Oat drink: names, descriptions or declared type identify all five as oat
  drinks, including barista variants.
- Prince biscuits: the first identifies the requested brand. The remaining
  four identify other biscuit products/brands. They match the broad biscuit
  category, but not the requested brand; do not report these as four unrelated
  product categories.
- Butter: positions three and four identify butter. Position one explicitly
  describes a butter/rapeseed-oil blend, predeclared borderline. Positions two
  and five are cream cheeses, hence two irrelevant-category results.
- Lactose-free milk: position five explicitly establishes lactose-free dairy
  milk. Positions one to three are dairy milk without lactose-free evidence in
  the returned facts, hence unknown under the predeclared rubric. Position four
  is confectionery labelled lactose-free: it satisfies the qualifier but not
  the requested product category.

Minimal per-rank product identity/category/label evidence and judgments are
retained locally in the ignored routing-evaluations directory with restricted
file permissions. No raw provider response, account fields, prices, credentials
or private transcript is committed here.

## Execution trace and limits

At the inspected source revision, `find_groceries` passes the full phrase and
requested count to `resolveDetailedProductSearch`. The client places the phrase
in the provider `query` parameter and the count in `take`; successful detailed
results preserve first-seen provider order. The existing specifications require
that order and forbid implicit comparative/price-ranking labels. The exported
`rankProducts` utility is a mapper, not evidence that this call path locally
ranks results. Provider matching/ranking internals remain unknown.

The gateway request includes session/context parameters and a favorites-related
parameter. Their contribution to these results was not measured; do not infer
that a future run or another account will return identical results. The sample
does not measure whole-catalogue recall or identify provider Boolean query
semantics. Four successful responses cannot establish service reliability.

Taxonomy alone is not a semantic relevance oracle. Relevant oat drinks appeared
in both `Køl / Øvrig mælk` and `Drikke / Soyadrik mm`; dairy UHT milk also appeared
in `Drikke / Soyadrik mm`. This is evidence of coarse or mixed categories, not a
measurement of the default-alternatives filter's recall. No alternatives widget
was opened, so #241 native acceptance remains unrun.

## Next experiment and decision

Prioritize compound constraints (brand plus category, dietary evidence plus
category) over another category-equality filter. First test whether the native
agent selects only evidence-supported matches from these candidate patterns,
using a sanitized synthetic replay and the existing host procedure. Separate
candidate relevance from final answer correctness and from false claims about
unknown dietary facts. This can be prepared without another live query.

Do not silently filter/reorder the production tool response: that changes the
existing provider-order contract. Reordering the same five candidates cannot
improve their precision@5. Any retrieval/ranking candidate must define the
contract, compare equivalent queries and catalogues, include held-out cases,
and distinguish fewer displayed results from better recall or task completion.
No production ranking change is justified by this one small baseline alone.

Native ChatGPT failure IDs NEM-CHATGPT-001 through NEM-CHATGPT-008: NOT RUN in
this benchmark. Catalogue search success does not establish renderer, recovery,
submission, progress, touch-control or localization acceptance.
