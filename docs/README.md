# Pokemon Field Guide documentation

This directory is the canonical technical documentation for the project.

- [Architecture](architecture.md): runtime boundaries, data flow, persistence, and extension points
- [Package finalization](package-finalization.md): shared generation seam, package invariants, and atomic replacement
- [Adding a game](adding-a-game.md): end-to-end instructions for creating and registering a game package
- [Development](development.md): local commands, generated-data practices, testing, and FRLG regeneration
- [Deployment](deployment.md): GitHub Pages publishing and base-path behavior
- [Checklist backups](save-backups.md): portable backup schema, version policy, and import semantics

The root [README](../README.md) describes the product. [AGENT.md](../AGENT.md) contains only repository-wide working rules. Put durable implementation guidance here rather than duplicating it in either file.

Documentation is part of every relevant change. Update these pages whenever architecture, package contracts, data formats, tooling, development workflows, or deployment behavior changes. Add and link a focused page when none of the existing pages fits.
