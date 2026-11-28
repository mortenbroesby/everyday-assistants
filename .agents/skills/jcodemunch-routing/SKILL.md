---
name: jcodemunch-routing
description: Use JCodeMunch first for nontrivial code exploration, callers, ownership, and change impact.
---

# Search the index first

Start unfamiliar feature work, multi-file debugging, refactoring, and PR impact
analysis with a focused JCodeMunch query before broad shell searches or file
reads. Reuse evidence already in context. Use a direct read or native search
for known lines, literal configuration, small local edits, and unindexed files.

## Select the checkout

Call `resolve_repo` with the absolute checkout path. Use the returned repo ID
only when the source root matches the intended checkout and the indexed source
is current for the question. Check changed and uncommitted paths when relevant.
Reuse that resolution while the checkout and index stay the same.

For a missing or stale index, index the intended local checkout with
`index_folder` and `use_ai_summaries: false`. Use path-keyed local identity for
a new linked worktree to keep sibling indexes independent. Resolve again and
check the root and coverage. If only specific edited files need refreshing,
use edit registration or surgical file indexing. For repository-wide caller
questions, refresh the full relevant scope. If tooling is unavailable or the
index is incomplete, use targeted native search and record the limitation.

## Retrieve the smallest answer

| Question | First query |
| --- | --- |
| Where does an unfamiliar feature live? | `get_ranked_context` with a small token budget |
| Where is a known symbol defined? | `search_symbols` with a small result limit |
| Which implementation do I need to read? | `get_file_outline`, then `get_symbol_source` for the selected IDs |
| Who depends on this symbol? | `find_references` or the focused importer/caller tool |
| What could a change or deletion affect? | Changed-symbol, blast-radius, or deletion-safety analysis |

Stop when the result answers the question. Fetch another symbol or expand the
budget only for a specific gap. Verify consequential edges against current
source and tests, especially dynamic wiring or non-compiler-backed results.
Load deferred tools by name. The shell search hook provides a reminder for
supported commands; agents follow this routing even on hosts without hooks.

For consequential decisions, record the question, checkout, result, and any
coverage gap. Report token savings only with a measured comparison.
