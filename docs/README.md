# Pokemon Field Guide documentation

This directory is the canonical contributor documentation. It describes current behavior and common maintenance tasks. The primary readers are coding agents and maintainers, but the instructions must remain usable without agent-specific tooling.

Research and decision pages preserve evidence that would be expensive to reconstruct. They describe current implementation where they overlap with the code. Plans and known defects belong in explicitly labeled pages rather than current-behavior guidance.

## Common tasks

- [Development](development.md): set up the repository, run checks, regenerate packages, and perform regression checks
- [Adding a game](adding-a-game.md): create, validate, and register a game package
- [Deployment](deployment.md): publish to GitHub Pages or another static host
- [Checklist backups](save-backups.md): change checklist persistence, backup formats, profile versions, or migrations
- [JSON contracts](json-contracts.md): change runtime JSON contracts and regenerate schemas

## Architecture and package reference

- [Architecture](architecture.md): runtime boundaries, data flow, persistence, and extension points
- [Package finalization](package-finalization.md): shared generation interface, package invariants, and atomic replacement
- [Generation II packages](gen2-packages.md): Gold/Silver and Crystal adapter boundaries and rendering rules
- [FireRed and LeafGreen package](frlg-package.md): TM extraction, Seagallop transport, and source rules
- [Generation III Hoenn packages](gen3-hoenn-packages.md): Ruby/Sapphire and Emerald adapter boundaries, worlds, transports, and source rules
- [Encounter table presentation](encounter-table-presentation.md): condition grouping and identical-table combination rules
- [Renewable map resources](renewable-map-resources.md): non-checklist resource markers and generator rules

## Source research and decisions

- [FireRed and LeafGreen renewable hidden items](frlg-renewable-hidden-items.md): source mechanics, eligible locations, and current generator behavior
- [Repeatable resource reward pools](repeatable-resource-reward-pools.md): Selphy and Crystal Battle Tower mechanics, pool odds, and contract design
- [All-package resource audit](all-packages-resource-audit.md): current package counts, qualifying sources, enabling events, and exclusions

## Known issues

- [Known data issues](known-data-issues.md): confirmed defects in installed generated packages and the requirements for correcting them

The root [README](../README.md) describes the product. [AGENTS.md](../AGENTS.md) contains repository-wide working rules. Put durable implementation guidance here rather than duplicating it in either file.

Documentation is part of every relevant change. Update these pages whenever architecture, package contracts, data formats, tooling, development workflows, or deployment behavior changes. Add and link a focused page when none of the existing pages fits.
