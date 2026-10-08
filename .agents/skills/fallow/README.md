# Fallow skill maintenance

This is a repository-local copy of `skills/fallow` bundled with the pinned
`fallow@3.32.0` npm package (integrity
`sha512-bBIykYqWClscRllE/g89qVYQjvOOSFz1z0hqJ/HT+zZoaaBLAKjtn2U23E90EvsXKMteTgyk54Vcy+juABxZuQ==`).
The corresponding upstream release tag is `v3.32.0` at commit
`aaaec796f5449810b9ecf82ed7e62b775d4d1ef3`. The bundled skill's original
`SKILL.md` SHA-256 is
`bbd8e7e4df4bdd12f62ccb146c2e38923b9168b94e58b138cc2e9ddf3c40e48a`.

Local adaptations are the frontmatter description and repository note near the
start of `SKILL.md`, plus two neutral path examples in
`references/cli-reference.md` to satisfy the repository privacy check. Other
supporting references are copied intact.
The included MIT notice comes from `fallow-rs/fallow-skills`.

To update deliberately: upgrade the pinned package, compare its full skill
directory with this copy, review upstream changes, copy the complete directory,
then reapply the local adaptations. Check local links and the PR audit
before committing. Do not run `fallow agent install` to refresh this skill: it
also adds extra skills, MCP registrations, hooks, and AGENTS.md blocks.
