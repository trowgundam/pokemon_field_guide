# Game tooling

Data extraction and map rendering are game-package concerns. Put scripts that understand a particular source project, map format, palette system, naming convention, or encounter format under:

```text
tools/<game-id>/
```

The directory name must match the package ID in `wwwroot/games/catalog.json`. A game adapter reads its source, performs source-specific audits, renders assets through the managed workspace, and returns draft package data. Package finalization owns the final write to `wwwroot/games/<game-id>/`. A new game does not need to imitate the FRLG adapter. Use the tools and dependencies that fit its source data.

Each toolchain must declare its minimum compatible runtime, use exact direct package versions, and commit its dependency lock files. Install from the lock file (`npm ci` for Node toolchains); do not rely on globally installed packages or floating dependency ranges. Add its routine commands to the root `justfile` so generation is consistent locally and in automation.

`tools/package-finalization/` contains the game-neutral package contract proven across FRLG, Red/Blue, and Yellow. Keep source parsing, palette rules, rendering decisions, checklist ID construction, and exact source audits in the game adapter.

See [Adding a game](../docs/adding-a-game.md) for the package workflow and [Development](../docs/development.md) for current commands.
