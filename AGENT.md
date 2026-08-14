# Agent guide

This repository contains the static Blazor WebAssembly Pokemon Field Guide. Read the canonical technical documentation at [docs/README.md](docs/README.md) before making architectural, data-generation, game-package, or deployment changes.

## Essential commands

Run commands from the repository root unless noted otherwise.

```sh
dotnet build PokemonFieldGuide/PokemonFieldGuide.csproj
dotnet run --project PokemonFieldGuide/PokemonFieldGuide.csproj
```

Always run the build after changing Razor, C#, JavaScript, CSS, generated JSON, or deployment configuration.

Treat documentation as part of the implementation. Update an existing file under `docs/`, or add an appropriately linked document, whenever a change affects architecture, package authoring, data formats, generation workflows, development practices, deployment, or other durable project behavior. Do not leave relevant documentation updates for a later task.

Keep commits small, focused, and independently revertible. Separate unrelated data, behavior, styling, deployment, and documentation changes into distinct commits; do not bundle the entire working tree into one catch-all commit.

## Scope and safety

- Follow [architecture](docs/architecture.md), [game-package](docs/adding-a-game.md), [development](docs/development.md), and [deployment](docs/deployment.md) guidance rather than duplicating it here.
- Do not add or request a ROM.
- Preserve user progress and stable checklist identifiers unless an explicit migration is part of the task.
- Preserve unrelated user changes in a dirty worktree.
