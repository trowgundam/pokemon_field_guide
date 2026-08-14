# FireRed / LeafGreen Field Guide

An interactive, Google Maps-style completion guide for Pokémon FireRed and LeafGreen. It joins the games' outdoor maps into zoomable world canvases and provides navigable interior maps, encounter and item markers, and per-game collection tracking.

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
dotnet run --project frle_fieldguide/frle_fieldguide.csproj
```

Open the address printed by the development server. To verify a change without starting the server:

```sh
dotnet build frle_fieldguide/frle_fieldguide.csproj
```

## Project structure

- `frle_fieldguide/Pages/Home.razor` — primary atlas and checklist UI
- `frle_fieldguide/Models/FieldGuideData.cs` — generated-data and saved-progress models
- `frle_fieldguide/wwwroot/data/` — generated encounter, item, and Pokédex data
- `frle_fieldguide/wwwroot/maps/` — rendered maps and connected-world metadata
- `frle_fieldguide/wwwroot/sprites/` — item and Pokémon menu sprites
- `tools/generate-fieldguide.mjs` — extracts guide data from the decompilation
- `tools/render-maps.mjs` — renders layouts and connected world maps
- `.github/workflows/deploy-pages.yml` — publishes the Blazor WebAssembly build to GitHub Pages

## Regenerating game data

The generated data and assets are committed so normal development does not require the decompilation. To regenerate them, clone `pret/pokefirered` separately and pass its path to the tools:

```sh
node tools/generate-fieldguide.mjs /path/to/pokefirered frle_fieldguide/wwwroot/data/fieldguide.json
node tools/render-maps.mjs /path/to/pokefirered frle_fieldguide/wwwroot/maps
```

The map renderer requires the Node.js `sharp` package. The data generator intentionally excludes prototype, unused, and multiplayer/link-room maps from the guide while retaining normally reachable interiors and event-island encounters. Regeneration should be followed by a build and a review of generated changes.

## Saved progress

Progress is stored locally in the browser under `frlg-field-guide-v1`. FireRed and LeafGreen have separate caught/item states. **Reset progress** clears both games' checklist state after confirmation while preserving the selected game, theme, and Pokédex mode.

## Deployment

Pushes to `main` trigger the included GitHub Pages workflow. In the repository settings, configure Pages to use **GitHub Actions** as its source. The workflow publishes the project, adjusts the application and service-worker base paths for the repository name, and provides a SPA-compatible `404.html`.

## Attribution

Pokémon game data and graphical assets originate from the FireRed/LeafGreen decompilation maintained by the pret community. Pokémon and related names and imagery are trademarks and copyrights of their respective owners. This is an unofficial fan project.
