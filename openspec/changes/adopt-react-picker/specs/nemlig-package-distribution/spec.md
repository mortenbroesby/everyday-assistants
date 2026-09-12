## ADDED Requirements

### Requirement: Packaged picker artifact
The private package SHALL contain the deterministic self-contained picker artifact required by the MCP resource, SHALL load it without repository source files, SHALL contain embedded executable code and application styling with no unresolved browser import or executable dependency, and SHALL exclude the local design showcase and its synthetic fixtures.

#### Scenario: Inspect packed picker
- **WHEN** the package is packed without credentials or Nemlig network access
- **THEN** the declared package files contain the built picker artifact and omit its uncompiled browser source, showcase output and fixtures, and test files

#### Scenario: Reproduce the picker
- **WHEN** two clean builds run from the same locked dependency graph
- **THEN** they produce byte-identical picker HTML with no external application script, stylesheet, dynamic JavaScript chunk, or API reference and no font origin outside the exact approved OpenAI resource origin

#### Scenario: Run picker from packed installation
- **WHEN** the credential-free MCP server is launched from a clean tarball installation and a client reads the enabled picker resource
- **THEN** the server returns the exact complete built resource without resolving repository paths, bare browser imports, external application styles, dynamic chunks, or executable network dependencies

### Requirement: Supported browser build pipeline
The private package SHALL produce the picker with a standard pinned browser build that processes React, Tailwind, Apps SDK UI CSS, and the HTML entry without custom rewriting of emitted CSS or hand-built HTML interpolation, while tsdown remains responsible for Node entry points.

#### Scenario: Build the production picker
- **WHEN** the package build runs from the locked dependency graph
- **THEN** the Node and browser builds emit the package artifacts in deterministic order without an experimental tsdown CSS stage, a separate Tailwind CLI stage, or a post-build asset mutation
