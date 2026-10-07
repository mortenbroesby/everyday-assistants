## Why

ChatGPT may retain MCP instructions from an earlier connection or conversation.
Embedding a release codename in those instructions can therefore show an older
release such as Gather even after a newer server is deployed. The 6.0.0
catalogue reduction also removed `get_profile`, the authenticated,
provider-independent read that previously proved which live server handled a
ChatGPT request.

## What Changes

- Restore exactly one read-only `get_profile` MCP tool to the normal
  authenticated user catalogue.
- Have it return the stable authenticated profile key plus the running
  package's version and codename, without a provider login or basket access.
- Remove release version/codename text from MCP instructions so cached
  instructions are never presented as live deployment evidence.
- Update the documented tool contract, user-facing inventory, release policy
  artifacts, and focused acceptance tests.

## Non-goals

- Change already-rendered historical ChatGPT cards or cached instruction text.
- Add provider-backed work, basket operations, credentials, new UI resources,
  or a ChatGPT-plugin/package upload path.
- Treat a profile response as proof that a historical card has remounted.

## Impact

This restores a seventh user-visible tool after the six-tool 6.0.0 reduction.
It is an intentional MCP contract expansion and therefore requires the normal
minor-release identity and note. Machine service acceptance remains limited to
its existing provider-fixture reads.
