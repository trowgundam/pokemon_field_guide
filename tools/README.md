# Game tooling

Data extraction and map rendering are game-package concerns. Put scripts that understand a particular source project, map format, palette system, naming convention, or encounter format under:

```text
tools/<game-id>/
```

The directory name must match the package ID in `wwwroot/games/catalog.json`. A game adapter reads its source, performs source-specific audits, renders assets through the managed workspace, and returns draft package data. Package finalization owns the final write to `wwwroot/games/<game-id>/`. A new game does not need to imitate the FRLG adapter. Use the tools and dependencies that fit its source data.

Each toolchain must declare its minimum compatible runtime, use exact direct package versions, and commit its dependency lock files. Install from the lock file (`npm ci` for Node toolchains); do not rely on globally installed packages or floating dependency ranges. Add its routine commands to the root `justfile` so generation is consistent locally and in automation.

`tools/package-finalization/` contains the game-neutral package contract used by every installed game. `tools/gen2/` contains the stable source-format modules shared by the structurally similar Gold/Silver and Crystal projects. `tools/gen3/` contains the stable GBA source-format modules shared by Ruby/Sapphire and Emerald. The package builders, public commands, dependency locks, and package-specific artifact tests remain under their package directories. Package-specific acquisition rules, source aliases, placements, sprite behavior, and audits belong there. Keep source parsing, palette rules, rendering decisions, checklist ID construction, and exact source audits outside package finalization.

`tools/PokemonFieldGuide.SchemaGenerator/` generates the committed schemas from `PokemonFieldGuide.Shared.Contracts`. `tools/package-schema/` validates JSON with pinned Ajv during package generation and `just check`. JavaScript adapters may map source-specific values to the stable strings defined by a generated schema; schema validation must reject mappings that drift from the C# contract.

See [Adding a game](../docs/adding-a-game.md) for the package workflow and [Development](../docs/development.md) for current commands.
