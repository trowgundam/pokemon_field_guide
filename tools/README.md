# Game tooling

Data extraction and map rendering are game-package concerns. Put scripts that understand a particular source project, map format, palette system, naming convention, or encounter format under:

```text
tools/<game-id>/
```

The directory name must match the package ID in `wwwroot/games/catalog.json`, and scripts must write only to the corresponding `wwwroot/games/<game-id>/` package. A new game does not need to imitate the FRLG toolchain: use whatever scripts and dependencies fit its source data.

Only genuinely game-neutral utilities belong directly under `tools/` or in a future `tools/shared/` directory. Extract shared code only after multiple toolchains demonstrate the same behavior; similar-looking source formats are not automatically the same contract.

See [Adding a game](../docs/adding-a-game.md) for the package workflow and [Development](../docs/development.md) for current commands.
