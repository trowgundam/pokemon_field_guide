# Development

## Requirements

- The exact .NET SDK selected by `global.json`
- `just` for the supported command shortcuts
- A Node.js version compatible with `tools/frlg/package.json` when regenerating FRLG data
- The locked Node dependencies installed by `npm ci` when rendering FRLG maps
- A compatible `pret/pokefirered` checkout for FRLG regeneration
- A compatible `pret/pokered` checkout for Red/Blue regeneration
- A compatible `pret/pokeyellow` checkout for Yellow regeneration

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

`just check` also validates every registered package's configured paths, integer fields, unique area/checklist/Pokédex IDs, entrance and world references, version values, and per-version availability coverage. Packages that set `validateWorldReachability` additionally require every area with guide data to be connected to a world placement.

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

## Regenerating Red/Blue

```sh
just generate-rb /path/to/pokered
```

The Red/Blue generator parses RGBDS map headers, Red/Blue-conditional wild encounter tables, all three fishing rods, visible and hidden item events, scripted rewards, gifts, Game Corner prizes, NPC trades, static encounters, map blocks, tilesets, and Kanto map connections. It writes the complete `rb` package, including native-scale individual maps, a connected Kanto canvas, Pokédex data, and source sprites with border-connected backgrounds made transparent. Generation fails if an area with a collection list or marker is unreachable from the outdoor Kanto graph. The committed outputs are sufficient to run the site; neither a source checkout nor a ROM is used at runtime.

Game-specific generators belong under `tools/<game-id>/`; see the [tooling conventions](../tools/README.md). Do not assume another game's source layout or rendering rules match FRLG.

## Regenerating Yellow

```sh
just generate-yellow /path/to/pokeyellow
```

The Yellow generator parses Yellow's RGBDS map headers, wild encounters, all three fishing rods, visible and hidden items, scripted rewards (including split `_2.asm` map scripts), gifts, Game Corner prizes, NPC trades, static encounters, map blocks, tilesets, Kanto connections, CGB base palettes, overworld palette-selection context, and per-species Pokémon palettes. It writes the complete `yellow` package with authentic GBC-colored maps and sprites, and fails unless its palette tables, source-derived item totals, 39 distinct special acquisitions, expected unobtainable Pokédex list, and world reachability audit all pass. Inaccessible source events are deliberately excluded.

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
- sprite animation can be disabled, respects reduced-motion preferences, and only runs for visible Pokédex entries;
- mobile layouts do not scroll horizontally;
- Pokédex numbering, availability, search, and caught state are correct;
- progress is isolated by package and version;
- reset clears checklist profiles but preserves preferences;
- v1 local saves and backups preserve per-game profile versions and round-trip without losing progress;
- whenever a released version is incremented, representative fixtures for every supported prior version migrate without changing unrelated profiles.

`just check` also parses every registered generated JSON document and verifies that numeric fields required by the .NET models are integers. Keep generator output aligned with the runtime contracts; JavaScript accepting a numeric value does not imply that `System.Text.Json` can deserialize it into the declared C# type.

Use the T3 collaborative preview when available for desktop and mobile visual checks. A release publish should also be tested because trimming and service-worker asset generation occur only during publishing.

## Commit policy

Keep commits small, focused, and independently revertible. Separate unrelated data, behavior, styling, deployment, and documentation work. Generated data and the generator change that produces it belong in the same commit.
