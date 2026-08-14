# Pokemon Field Guide documentation

This directory is the canonical technical documentation for the project.

- [Architecture](architecture.md) — runtime boundaries, data flow, persistence, and extension points
- [Adding a game](adding-a-game.md) — end-to-end instructions for creating and registering a game package
- [Development](development.md) — local commands, generated-data practices, testing, and FRLG regeneration
- [Deployment](deployment.md) — GitHub Pages publishing and base-path behavior
- [Save backups](save-backups.md) — portable backup schema, version policy, and import semantics

The root [README](../README.md) describes the product. [AGENT.md](../AGENT.md) contains only repository-wide working rules. Put durable implementation guidance here rather than duplicating it in either file.

Documentation is part of every relevant change. Update these pages—or add and link a focused page—whenever architecture, package contracts, data formats, tooling, development workflows, or deployment behavior changes.
