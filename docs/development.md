# Development

## Requirements

- The exact .NET SDK selected by `global.json`
- `just` for the supported command shortcuts
- A Node.js version compatible with `tools/frlg/package.json` when regenerating FRLG data
- The locked Node dependencies installed by `npm ci` when rendering FRLG maps
- A compatible `pret/pokefirered` checkout for FRLG regeneration
- A compatible `pret/pokered` checkout for Red/Blue regeneration
- A compatible `pret/pokeyellow` checkout for Yellow regeneration
- A compatible `pret/pokegold` checkout for Gold/Silver regeneration
- A compatible `pret/pokecrystal` checkout for Crystal regeneration

No ROM is required or permitted in the repository.

## Common commands

Run from the repository root:

```sh
just build
just run
just test
just publish
just check
just generate-schemas
```

Run `just --list` to see all supported recipes. The recipes deliberately restore NuGet packages in locked mode and install Node dependencies with `npm ci`. Their underlying commands remain visible in the `justfile` for environments where `just` is unavailable.

Dependency versions are intentionally exact. `global.json` pins the .NET SDK, `packages.lock.json` pins the complete NuGet graph, each Node tool has a package lock, and the deployment workflow pins actions by commit SHA. Node itself only has a minimum compatibility requirement; it is not locked to a particular release. Dependency upgrades should be isolated, reviewed changes that update the corresponding manifests and lock files together.

Always build after changing Razor, C#, JavaScript, CSS, generated JSON, or deployment configuration.

`just test` exercises Game package assembly and Local guide state behavior. The Local guide state tests cover migration, recovery, atomic writes, queued changes, backup v2, partial import, selective reset, and special-acquisition provenance. `just check` verifies schema drift, validates every generated JSON document, runs the package-finalization tests, and validates every registered package. The package checks cover configured paths, unique area, checklist, and Pokédex IDs, entrance and world references, version values, per-version availability, encounter-table probabilities, exact map and sprite use, and directed reachability from world warps for every area.

`PokemonFieldGuide.Shared.Contracts` owns runtime JSON formats. After changing one of those C# types, run `just generate-schemas` and commit the schema diff. See [JSON contracts](json-contracts.md).

## Generated files

Generated data and assets are committed so the deployed site has no dependency on a source checkout. Correct extraction defects in a generator, regenerate its outputs, and review the generated diff. Do not patch generated JSON as the sole fix.

Checklist IDs are persistent data. Changing item or special-Pokémon IDs can invalidate browser progress even when the visible entry appears unchanged.

## Clone and regenerate every package

Clone all five source repositories below one directory:

```sh
just clone-all /tmp
```

This command creates `/tmp/pokered`, `/tmp/pokeyellow`, `/tmp/pokegold`, `/tmp/pokecrystal`, and `/tmp/pokefirered`. If a target already has the expected `pret` checkout, the clone recipe keeps it unchanged. The recipe fails when a target exists with a different Git origin.

Regenerate every package from those directory names:

```sh
just generate-all /tmp
```

Use these commands to clone or regenerate one package:

```sh
just clone-rb /tmp
just clone-yellow /tmp
just clone-gs /tmp
just clone-crystal /tmp
just clone-frlg /tmp

just generate-rb /tmp/pokered
just generate-yellow /tmp/pokeyellow
just generate-gs /tmp/pokegold
just generate-crystal /tmp/pokecrystal
just generate-frlg /tmp/pokefirered
```

## Regenerating FRLG

```sh
just generate-frlg /path/to/pokefirered
```

`generate-fieldguide.mjs` is the sole FRLG generation command. It extracts the guide and Pokédex, calls the internal map renderer, copies source sprites, and hands one complete draft to package finalization. It intentionally:

- includes starter-dependent roaming beasts;
- extracts event-script static encounters;
- excludes prototype, unused, and multiplayer/link-room maps;
- excludes source entrances that target excluded maps;
- retains interior transition records in the draft so package finalization can contract them;
- emits the 61 source-allowlisted renewable hidden items, Selphy, and both size judges as resources;
- sources every map, item icon, Pokémon sprite, and fallback needed to build an empty package directory.

`render-maps.mjs` is internal to the FRLG adapter. It returns native-scale individual maps, connected world canvases, and world placement data through the managed asset workspace. FRLG reserves palettes 0 through 6 for primary tilesets and 7 through 12 for secondary tilesets. Preserve that renderer behavior.

Use Pokémon menu sprites and bag item icons where available. The FRLG adapter installs `tools/frlg/assets/unown.png` because the source project does not provide the expected standalone file. The file contains Unown A, the deterministic canonical form for FRLG. Package finalization requires both sprite directories to contain `question_mark.png`.

## Regenerating Red/Blue

```sh
just generate-rb /path/to/pokered
```

The Red/Blue generator parses RGBDS map headers, Red/Blue-conditional wild encounter tables, all three fishing rods, visible and hidden item events, scripted rewards, gifts, Game Corner prizes, NPC trades, every source-defined static encounter, map blocks, tilesets, and Kanto map connections. It writes the complete `rb` package, including native-scale individual maps, a connected Kanto canvas, Pokédex data, and source sprites with the dominant border-connected background made transparent. Generation fails unless encounter tables total 100 percent per version, source-derived item and special-acquisition totals match, the expected unavailable Pokédex lists match, every relevant area is reachable from the outdoor Kanto graph, and every generated asset is referenced. The committed outputs are sufficient to run the site; neither a source checkout nor a ROM is used at runtime.

Game-specific generators belong under `tools/<game-id>/`; see the [tooling conventions](../tools/README.md). Do not assume another game's source layout or rendering rules match FRLG.

## Regenerating Yellow

```sh
just generate-yellow /path/to/pokeyellow
```

The Yellow generator parses Yellow's RGBDS map headers, wild encounters, all three fishing rods, visible and hidden items, scripted rewards (including split `_2.asm` map scripts), gifts, Game Corner prizes, NPC trades, static encounters, map blocks, tilesets, Kanto connections, CGB base palettes, overworld palette-selection context, and per-species Pokémon palettes. It writes the complete `yellow` package with authentic GBC-colored maps and sprites, removes unused outputs, and makes each sprite's dominant border-connected background transparent before applying its CGB palette. Generation fails unless its palette tables, source-derived item totals, 39 distinct special acquisitions, expected unobtainable Pokédex list, and world reachability audit all pass. Inaccessible source events are deliberately excluded.

## Regenerating Generation II

```sh
just generate-gs /path/to/pokegold
just generate-crystal /path/to/pokecrystal
```

Gold/Silver and Crystal have separate package commands, dependency locks, and package builders. The builders use modules under `tools/gen2/` for stable RGBDS parsing, display-name conversion, map rendering, connected-world construction, and sprite processing. Package-specific acquisition rules, graphics aliases, world placement, and sprite-file selection remain in `tools/gs/build-package.mjs` and `tools/crystal/build-package.mjs`.

The builders extract time-of-day and swarm tables as separate encounter conditions; fishing, headbutt, Rock Smash, roaming, gift, static, prize, egg, and NPC-trade sources; one connected Johto and Kanto world canvas; and the New and National Pokédex orders. They audit 30 fruit trees and four other shared renewable sources. Crystal adds the Battle Tower resource and ten trainer-registration checklist events. They follow outdoor map connections instead of placing every town- or route-classified source map on the world. Parks, ports, and landmark exteriors reached through warps remain interior maps unless their rendered edges align with the connected outdoor canvas. Route 26 and Route 27 stay in the New Bark Town outdoor component. Routes 22, 23, 26, and 28 remain full-size maps on the cardinal sides of a 320-pixel rocky Victory Road connector, with no overlap between routes. The builders filter fishing by the water permissions of blocks used in each map instead of treating the broad map fish-group field as proof that a location is fishable. Maps use the canonical daytime palette and reproduce each map group's dynamically loaded roof graphics, roof colors, and two-bank tileset addressing. In Crystal, the Route 40 gate contracts away and Battle Tower Outside is placed directly above Route 40 on the world canvas. Its entrance opens Battle Tower 1F and its weighted prize pool.

Gold/Silver registers distinct per-version battle sprites when the source provides them. Crystal extracts the first native battle frame from each animated front-sprite sheet. The adapter makes each battle sprite's dominant border-connected background transparent without removing enclosed light details. Generation II does not provide standalone bag item icons, so both packages use the required item fallback.

The public generators install a package only after schema, probability, reachability, reference, and asset-use checks pass. Source records marked as beta are excluded.

## Regression expectations

At minimum, verify:

- outdoor maps load before markers and retain exact pixel rendering;
- map selection, search, panning, zooming, and marker tooltips work;
- pointer dragging works over area hotspots without native image dragging or stuck capture;
- marker screen size remains usable across zoom levels;
- empty transitions reach the nearest relevant interior without creating outdoor-to-outdoor gate markers;
- all interior components are reachable, centered, pannable, and zoomable;
- adjacent tiles for one doorway collapse while distinct entrances remain separate;
- encounter and item groups follow the shared C# ordering;
- sprites fall back without broken images;
- themes and package/version accents remain legible;
- sprite animation can be disabled, respects reduced-motion preferences, and only runs for visible Pokédex entries;
- mobile layouts do not scroll horizontally;
- Pokédex numbering, availability, search, and caught state are correct;
- progress is isolated by package and version;
- selective reset clears only confirmed Checklist profiles and preserves preferences;
- malformed Local guide state remains downloadable until the user explicitly deletes it;
- local profile v1 migrates to v2 without removing direct caught marks or unknown checklist IDs;
- Gold/Silver, Crystal, and FireRed/LeafGreen profile v2 data migrates to v3 without retaining retired resource-item IDs;
- Crystal profile migration maps completed phone-gift IDs to the corresponding trainer-registration ID;
- backup v1 imports checklist data without preferences, and backup v2 round-trips selected profiles;
- import previews replacements and applies only the profiles confirmed by the user;
- failed browser writes do not change the displayed Local guide state;
- whenever a released version is incremented, representative fixtures for every supported prior version migrate without changing unrelated profiles.

`just check` validates every registered generated JSON document against schemas generated from the C# runtime contracts. Keep generator output aligned with those contracts.

Use the T3 collaborative preview when available for desktop and mobile visual checks. A release publish should also be tested because trimming and service-worker asset generation occur only during publishing.

## Commit policy

Keep commits small, focused, and independently revertible. Separate unrelated data, behavior, styling, deployment, and documentation work. Generated data and the generator change that produces it belong in the same commit.
