# Pokemon Field Guide

An extensible, Google Maps-style completion guide for Pokémon games. The current package covers FireRed and LeafGreen, joining their outdoor maps into zoomable world canvases and providing navigable interior maps, encounter and item markers, and per-version collection tracking.

Game data and map assets are derived from the [pret/pokefirered decompilation project](https://github.com/pret/pokefirered). No ROM is required to run the checked-in application.

## Features

- Connected Kanto and Sevii Islands maps with zooming and panning
- Navigable interior maps and floor selection
- Visible, hidden, and event item checklists
- Random, surfing, fishing, roaming, static, gift, and in-game trade Pokémon
- Normal Kanto and full National Pokédex views
- FireRed/LeafGreen-specific availability and separate collection progress
- Searchable locations and Pokédex
- Persisted theme, game, Pokédex mode, and checklist progress in browser storage
- Dark and light themes with game-specific accent colors
- GitHub Pages deployment workflow

## Run locally

The application targets .NET 10. From the repository root:

```sh
dotnet run --project PokemonFieldGuide/PokemonFieldGuide.csproj
```

Open the address printed by the development server. To verify a change without starting the server:

```sh
dotnet build PokemonFieldGuide/PokemonFieldGuide.csproj
```

## Project structure

- `PokemonFieldGuide/Pages/Home.razor` — game-agnostic atlas and checklist UI
- `PokemonFieldGuide/Models/FieldGuideData.cs` — generated-data and saved-progress models
- `PokemonFieldGuide/Models/GamePackage.cs` — game catalog and package metadata
- `PokemonFieldGuide/Services/` — package loading and game-specific rules modules
- `PokemonFieldGuide/wwwroot/games/catalog.json` — installed game-package catalog
- `PokemonFieldGuide/wwwroot/games/frlg/data/` — generated FRLG guide, Pokédex, and world data
- `PokemonFieldGuide/wwwroot/games/frlg/maps/` — rendered FRLG maps
- `PokemonFieldGuide/wwwroot/games/frlg/sprites/` — FRLG item and Pokémon menu sprites
- `tools/generate-fieldguide.mjs` — extracts guide data from the decompilation
- `tools/render-maps.mjs` — renders layouts and connected world maps
- `.github/workflows/deploy-pages.yml` — publishes the Blazor WebAssembly build to GitHub Pages

## Regenerating game data

The generated data and assets are committed so normal development does not require the decompilation. To regenerate them, clone `pret/pokefirered` separately and pass its path to the tools:

```sh
node tools/generate-fieldguide.mjs /path/to/pokefirered
node tools/render-maps.mjs /path/to/pokefirered
```

The map renderer requires the Node.js `sharp` package. The data generator intentionally excludes prototype, unused, and multiplayer/link-room maps from the guide while retaining normally reachable interiors and event-island encounters. Regeneration should be followed by a build and a review of generated changes.

## Saved progress

Progress is stored locally in the browser under `frlg-field-guide-v1` for backward compatibility. Checklist profiles are namespaced by game package and version, so FireRed and LeafGreen remain separate and future games cannot collide with them. **Reset progress** clears every checklist profile after confirmation while preserving the selected game, version, theme, and Pokédex mode.

## Adding another game

Each supported game family is a package described in `wwwroot/games/catalog.json`. A package owns its version and region definitions, data paths, map and sprite paths, Pokédex modes, default map, and accent colors. Game-specific naming and grouping exceptions implement `IGameRules` and are registered through `IGameRulesProvider`; the shared atlas UI should not gain title-specific conditionals.

New extraction or rendering tools should write into that package's directory. Checklist IDs must be stable within the package, and version IDs must match the values used by its generated encounter and availability data.

## Deployment

Pushes to `main` trigger the included GitHub Pages workflow. In the repository settings, configure Pages to use **GitHub Actions** as its source. The workflow publishes the project, adjusts the application and service-worker base paths for the repository name, and provides a SPA-compatible `404.html`.

## Attribution

Pokémon game data and graphical assets originate from the FireRed/LeafGreen decompilation maintained by the pret community. Pokémon and related names and imagery are trademarks and copyrights of their respective owners. This is an unofficial fan project.
