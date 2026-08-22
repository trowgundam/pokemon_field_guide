# Pokemon Field Guide documentation

This directory is the canonical technical documentation for the project.

- [Architecture](architecture.md): runtime boundaries, data flow, persistence, and extension points
- [Package finalization](package-finalization.md): shared generation seam, package invariants, and atomic replacement
- [Generation II packages](gen2-packages.md): Gold/Silver and Crystal source adapter, rendering rules, and package boundaries
- [Encounter table presentation](encounter-table-presentation.md): condition grouping and identical-table combination rules
- [Renewable map resources](renewable-map-resources.md): non-checklist resource markers and generator guidance
- [FireRed and LeafGreen renewable hidden items](frlg-renewable-hidden-items.md): source mechanics, eligible locations, and generator recommendation
- [Repeatable resource reward pools](repeatable-resource-reward-pools.md): Selphy and Crystal Battle Tower mechanics, pool odds, and contract design
- [All-package resource audit](all-packages-resource-audit.md): qualifying resources, package targets, enabling events, and explicit exclusions
- [Adding a game](adding-a-game.md): end-to-end instructions for creating and registering a game package
- [Development](development.md): local commands, generated-data practices, testing, and package regeneration
- [Deployment](deployment.md): GitHub Pages publishing and base-path behavior
- [Checklist backups](save-backups.md): portable backup schema, version policy, and import semantics
- [JSON contracts](json-contracts.md): authoritative C# contracts, generated schemas, and validation

The root [README](../README.md) describes the product. [AGENT.md](../AGENT.md) contains only repository-wide working rules. Put durable implementation guidance here rather than duplicating it in either file.

Documentation is part of every relevant change. Update these pages whenever architecture, package contracts, data formats, tooling, development workflows, or deployment behavior changes. Add and link a focused page when none of the existing pages fits.
