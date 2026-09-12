## ADDED Requirements

### Requirement: Packaged picker artifact
The private package SHALL contain the deterministic self-contained picker artifact required by the MCP resource, SHALL load it without repository source files, and SHALL contain embedded executable code and styling with no unresolved browser import, stylesheet, font, or executable CDN dependency.

#### Scenario: Inspect packed picker
- **WHEN** the package is packed without credentials or Nemlig network access
- **THEN** the declared package files contain the built picker artifact and omit its uncompiled browser source and test files

#### Scenario: Reproduce the picker
- **WHEN** two clean builds run from the same locked dependency graph
- **THEN** they produce byte-identical picker HTML with no executable, stylesheet, or font network reference

#### Scenario: Run picker from packed installation
- **WHEN** the credential-free MCP server is launched from a clean tarball installation and a client reads the enabled picker resource
- **THEN** the server returns the exact complete built resource without resolving repository paths, bare browser imports, remote styles or fonts, or executable network dependencies
