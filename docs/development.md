# Development

## Requirements

- The exact .NET SDK selected by `global.json`
- `just` for the supported command shortcuts
- A Node.js version compatible with `tools/frlg/package.json` when regenerating FRLG data
- The locked Node dependencies installed by `npm ci` when rendering FRLG maps
- A compatible `pret/pokefirered` checkout for FRLG regeneration

No ROM is required or permitted in the repository.

## Common commands

Run from the repository root:

```sh
just build
just run
just publish
just check
```

Run `just --list` to see all supported recipes. The recipes deliberately restore NuGet packages in locked mode and install Node dependencies with `npm ci`. Their underlying commands remain visible in the `justfile` for environments where `just` is unavailable.

Dependency versions are intentionally exact. `global.json` pins the .NET SDK, `packages.lock.json` pins the complete NuGet graph, the FRLG package and lock file pin npm dependencies, and the deployment workflow pins actions by commit SHA. Node itself only has a minimum compatibility requirement; it is not locked to a particular release. Dependency upgrades should be isolated, reviewed changes that update the corresponding manifests and lock files together.

Always build after changing Razor, C#, JavaScript, CSS, generated JSON, or deployment configuration.

## Generated files

Generated data and assets are committed so the deployed site has no dependency on a source checkout. Correct extraction defects in a generator, regenerate its outputs, and review the generated diff. Do not patch generated JSON as the sole fix.

Checklist IDs are persistent data. Changing item or special-Pokémon IDs can invalidate browser progress even when the visible entry appears unchanged.

## Regenerating FRLG

```sh
just generate-frlg /path/to/pokefirered
```

`generate-fieldguide.mjs` writes the FRLG guide and Pokédex into `PokemonFieldGuide/wwwroot/games/frlg/data/`. It intentionally:

- includes starter-dependent roaming beasts;
- extracts event-script static encounters;
- excludes prototype, unused, and multiplayer/link-room maps;
- removes entrances to excluded maps;
- retains reachable interiors and event-island content.

`render-maps.mjs` writes native-scale individual maps and connected world canvases into `PokemonFieldGuide/wwwroot/games/frlg/maps/`, plus `worlds.json` in the package data directory. FRLG reserves palettes 0–6 for primary tilesets and 7–12 for secondary tilesets; preserve that renderer behavior.

Use Pokémon menu sprites and bag item icons where available. The FRLG rules module embeds Unown A because the checked-in source assets do not provide the expected standalone file. Both sprite directories require `question_mark.png`.

Game-specific generators belong under `tools/<game-id>/`; see the [tooling conventions](../tools/README.md). Do not assume another game's source layout or rendering rules match FRLG.

## Regression expectations

At minimum, verify:

- outdoor maps load before markers and retain exact pixel rendering;
- map selection, search, panning, zooming, and marker tooltips work;
- pointer dragging works over area hotspots without native image dragging or stuck capture;
- marker screen size remains usable across zoom levels;
- empty transitions reach the nearest relevant interior without creating outdoor-to-outdoor gate markers;
- all interior components are reachable, centered, pannable, and zoomable;
- adjacent tiles for one doorway collapse while distinct entrances remain separate;
- encounter and item groups follow the active rules module's ordering;
- sprites fall back without broken images;
- themes and package/version accents remain legible;
- mobile layouts do not scroll horizontally;
- Pokédex numbering, availability, search, and caught state are correct;
- progress is isolated by package and version;
- reset clears checklist profiles but preserves preferences;
- a representative legacy FRLG save migrates without losing progress.

Use the T3 collaborative preview when available for desktop and mobile visual checks. A release publish should also be tested because trimming and service-worker asset generation occur only during publishing.

## Commit policy

Keep commits small, focused, and independently revertible. Separate unrelated data, behavior, styling, deployment, and documentation work. Generated data and the generator change that produces it belong in the same commit.
