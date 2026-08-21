# Adding a game

This guide describes the complete package-authoring process. It assumes the new title can provide outdoor map images, individual interior maps, encounter and item data, a Pokédex, and stable identifiers. The source may be a decompilation, an independently maintained dataset, or another lawful source; a ROM must not be committed or required by the deployed application.

## 1. Choose the package and version boundaries

Create one package for versions that share map topology, assets, data shape, Pokédex rules, and title-specific behavior. Give the package a short, stable, lowercase ID such as `frlg`. Each version is still treated as an independent game for checklist progress, backup selection, availability filtering, accent color, and other version-specific preferences. The package prevents unnecessary duplication; it does not imply shared progress.

If paired games differ only in some records, keep one copy of shared maps and sprites and identify version-specific encounter or special-Pokémon records with the exact version ID. Split them into separate packages only when their topology, assets, source tooling, or runtime rules differ enough that a shared package would require pervasive exceptions.

Set every catalog version's `progressVersion` to the current Checklist profile format, which is `2`. This is the schema version of that individual game's Checklist profile, not the package or application version. Do not rename an ID or increment `progressVersion` after release without adding and testing a sequential Checklist profile migration. See [Checklist backup format](save-backups.md).

## 2. Create the package directories

Use this layout:

```text
PokemonFieldGuide/wwwroot/games/<game-id>/
├── data/
│   ├── fieldguide.json
│   ├── package-manifest.json
│   ├── pokedex.json
│   └── worlds.json
├── maps/
│   ├── WORLD_<REGION>.png
│   └── <interior-or-area>.png
└── sprites/
    ├── items/
    │   └── question_mark.png
    └── pokemon/
        └── question_mark.png
```

Both fallback images are required. Package paths must be unique and relative to `wwwroot`.

Create a game adapter under `tools/<game-id>/`. The adapter may use any language or dependencies appropriate to that game's lawful source data. It must perform source-specific audits, render assets through the managed workspace, and return draft areas, worlds, and Pokédex data to package finalization. Do not extend the FRLG adapter merely because another title uses a related engine. Record commands and prerequisites in [Development](development.md), following the [tooling conventions](../tools/README.md).

Call `generatePackage` once from the public generator command:

```js
await generatePackage({
  gameId: 'example',
  build: ({ definition, assets }) => buildExampleDraft({ sourceRoot, definition, assets })
});
```

The adapter must not write final JSON or mutate the installed package directory. Package finalization reads `games/catalog.json`, verifies that every draft area is reachable from a world warp, contracts empty entrance chains, repeats the reachability check over every retained area, checks the complete staged package, removes unreferenced assets, and replaces the installed package only after every check passes. See [Package finalization](package-finalization.md).

## 3. Generate `fieldguide.json`

The root object follows `FieldGuideData`:

```json
{
  "source": "source-project-or-dataset",
  "generated": "2026-08-14",
  "areas": []
}
```

An area has this shape:

```json
{
  "id": "MAP_EXAMPLE_ROUTE_1",
  "name": "Route 1",
  "region": "Example Region",
  "encounters": [],
  "items": [],
  "resources": [],
  "specialPokemon": [],
  "entrances": [],
  "mapImage": "games/example/maps/ROUTE_1.png",
  "mapWidth": 384,
  "mapHeight": 640
}
```

Requirements:

- `id` is unique within the package.
- `mapWidth` and `mapHeight` are rendered pixel dimensions.
- `mapImage` may be null only for a deliberately non-rendered record.
- `region` should match a catalog region ID where practical.
- Every entrance target must resolve to another included area unless an empty target intentionally represents an unusable passage.

### Encounters

```json
{
  "species": "Pikachu",
  "speciesId": "SPECIES_PIKACHU",
  "minLevel": 3,
  "maxLevel": 5,
  "chance": 10,
  "method": "Grass",
  "condition": "Morning",
  "version": "ExampleRed"
}
```

Use `Both` for a row shared by every package version, otherwise use an exact catalog version ID. Multiple slots for one species may remain separate; the UI groups display by species while retaining method and level information.

`chance` is a JSON number and may contain a fractional percentage when that is the most accurate representation of the game's random selection logic. Do not round or redistribute probabilities merely to produce integers. Keep it between 0 and 100, and make the slots for each encounter table total 100 percent. The UI retains the exact stored value for calculations but formats the displayed aggregate to one decimal place.

Use the optional `condition` field when one method has independently normalized tables, such as morning, day, night, swarm, or tree rarity. Give every row in one table the same condition. Package finalization checks probability totals by encounter type, condition, and version. After version selection, the UI combines time-of-day categories whose encounter tables are identical. Other conditions remain separate.

### Items

```json
{
  "id": "MAP_EXAMPLE_ROUTE_1:hidden:8:12",
  "name": "Potion",
  "kind": "Hidden",
  "icon": "potion.png",
  "x": 8,
  "y": 12,
  "quantity": 1
}
```

Item IDs are checklist keys and must be stable. Coordinate-bearing items use tile coordinates. Event items without a map tile conventionally use `-1` for both coordinates and are listed without a map marker. The rules implementation controls group ordering, but generators should use consistent kinds such as `Visible`, `Hidden`, and `Event`.

### Renewable map resources

Use `resources` for repeatable map pickups that should appear on the map without becoming checklist entries:

```json
{
  "name": "Blue Apricorn",
  "kind": "Daily fruit tree",
  "x": 16,
  "y": 5
}
```

Resources have no checklist ID and never contribute to saved progress or completion percentages. Their coordinates use the same tile convention as items. Include them in source audits and use the in-game reward name. Set `kind` to a user-facing description of the source and renewal schedule, such as `Daily fruit tree`, `Weekly harvest`, or `Repeatable pickup`. The UI displays this value and does not assume that every resource renews daily. See [Renewable map resources](renewable-map-resources.md) for the design rationale.

### Static, gift, and trade Pokémon

```json
{
  "id": "MAP_EXAMPLE_LAB:gift:SPECIES_STARTER:Both",
  "species": "Starter",
  "speciesId": "SPECIES_STARTER",
  "level": 5,
  "kind": "Gift",
  "version": "Both",
  "requestedSpecies": null
}
```

Special-Pokémon IDs are checklist keys. Use `requestedSpecies` for an in-game trade. Anything obtainable through a battle, gift, purchase, prize, scripted event, fossil revival, NPC trade, or other title-specific acquisition should be represented in an appropriate area. Do not limit extraction to ordinary wild encounters or obvious `GivePokemon`-style script calls.

Before considering a package complete, inventory every acquisition channel supported by the game. At minimum, explicitly check:

- grass, cave, surfing, and every fishing-rod or encounter-table variant;
- static and roaming encounters;
- starters and other NPC gifts;
- purchases and casino or minigame prizes;
- fossils, eggs, trades, evolutions, and version-dependent evolutions;
- one-time, conditional, post-game, mystery-gift, distribution, and other event sources.

Represent locally repeatable encounters as encounters and one-time choices or interactions as special Pokémon. Mutually exclusive choices should still be listed individually when each is legitimately obtainable in that version. If a source is deliberately excluded, document the reason rather than silently omitting it.

### Entrances

```json
{
  "id": "MAP_EXAMPLE_ROUTE_1:warp:0",
  "targetId": "MAP_EXAMPLE_CAVE_1F",
  "name": "Example Cave 1F",
  "x": 14,
  "y": 7
}
```

Include both directions where the game supports returning. Preserve edges through empty gates, stairwells, elevators, and transition rooms because interior discovery traverses the entrance graph. Outdoor-to-outdoor gates do not need a checklist entrance marker; the runtime stops traversal when it reaches an outdoor area.

Treat reachability as a generated-data invariant. Starting from every outdoor world placement, follow entrance edges in their declared direction and fail generation if any draft area cannot be reached. Run the same traversal over the retained package after contraction. Do not return unused, beta, debug, or inaccessible maps in the draft. Also follow the runtime navigation rule and confirm that every interior belongs to a component opened by a world marker. Do not expose linear empty transition rooms as selectable interiors. Set `includeInNavigation` only when an otherwise empty map has visual or navigational value that the player should be able to inspect. Retain an empty junction when separate branches lead to relevant interiors, including branches of different lengths. Also verify that every non-empty entrance target resolves to an included area. Do not filter a missing target to conceal incomplete extraction.

## 4. Generate `worlds.json`

Create one record per connected outdoor canvas:

```json
[
  {
    "id": "example-region",
    "image": "games/example/maps/WORLD_EXAMPLE_REGION.png",
    "width": 4096,
    "height": 3072,
    "maps": [
      {
        "id": "MAP_EXAMPLE_ROUTE_1",
        "x": 640,
        "y": 960,
        "width": 384,
        "height": 640
      }
    ]
  }
]
```

World placement coordinates and dimensions are pixels in the connected image. Placement IDs must resolve to areas after the package manifest applies its `areaAliases`. The world image must align exactly with every placement because markers add the area's tile coordinates to the placement origin.

Disconnected landmasses may either become separate worlds/region tabs or be arranged on one composite canvas, as appropriate for the game.

## 5. Generate `pokedex.json`

```json
[
  {
    "number": 25,
    "regionalNumber": 25,
    "name": "Pikachu",
    "speciesId": "SPECIES_PIKACHU",
    "availability": {
      "ExampleRed": "Obtainable",
      "ExampleBlue": "Trade / transfer required"
    }
  }
]
```

`number` is the full-dex number. `regionalNumber` is null when the species is absent from the regional dex. Availability keys must exactly match version IDs. Current status labels are `Obtainable`, `Event distribution`, and `Trade / transfer required`; `Obtainable` is the only status rendered as normally available.

Include the complete full Pokédex supported by the game's generation, not only species obtainable in the package.

Derive availability only after all acquisition sources and evolution paths have been collected. For each version, compare every `Obtainable` Pokédex entry with the encounter and special-Pokémon records that make it obtainable, including evolution chains. Evolutions that require a player-to-player trade are not `Obtainable`; mark them `Trade / transfer required` unless the game contains an in-game trade or other local mechanic that actually yields the evolved species. When such an exception exists, represent the species the player ultimately receives, including any evolution forced by the trade routine. Review every remaining unavailable species as a named list. The expected version exclusives, trade requirements, transfers, or distribution-only species should explain the entire list; an unexpected entry usually indicates a skipped fishing table, gift, prize, trade, fossil, static encounter, or event source.

## 6. Add sprites

Provide Pokémon menu sprites and bag item icons through the managed asset workspace. Package finalization records each species-to-filename association in `package-manifest.json`. Images must retain native pixel art and transparency. Do not rely on browser smoothing.

When paired versions use different species sprites, also return `pokemonSpritesByVersion` from the adapter. Its outer keys are exact catalog version IDs and its inner keys are species IDs. The runtime prefers the selected version's association and falls back to the package-wide `pokemonSprites` entry. Register every variant through the managed asset workspace; package finalization retains and validates those variant files.

Keep only assets referenced by the final package data and catalog configuration. Generators that render a broader source set before filtering areas must remove the unused outputs before they finish. Audit the output after regeneration and treat unreferenced generated assets as a package error.

Every Pokémon sprite must be a Game package file. Do not embed a data URI in C# or generated JSON. If the upstream source lacks a standalone sprite, add a package-owned PNG under the matching Game adapter and register it through the managed asset workspace. If no suitable asset exists, allow the required `question_mark.png` fallback to render rather than emitting a broken URL.

Choose one canonical sprite when a species has multiple forms. Use the male form when male and female sprites differ. Otherwise, use the first form in the game's authoritative form order. If the source has no stable order, declare the order in the Game adapter. Add a generation assertion for the selected form so regeneration cannot silently choose another sprite. FRLG follows this rule by always using Unown A.

### Palette selection

When a game supports enhanced color on the Game Boy Color, or on the equivalent color-capable platform relevant to that title, render maps and sprites with that platform's color data. Do not render the monochrome-compatible tile or sprite data as grayscale merely because palettes are stored separately from the pixel indices. Follow the game's runtime palette-selection rules, including location-, tileset-, sprite-, and context-specific assignments, so the generated assets represent the authentic color presentation.

Some ROM hacks and source projects provide multiple alternative palette sets. Before generating or committing assets for such a game, ask the developer which palette set is the canonical choice. Do not choose one by assumption.

The site supports exactly one canonical rendered palette choice for each shared asset. There are no plans to add a palette selector or maintain parallel asset variants. Do not duplicate map or sprite asset trees to represent alternate palettes; generate the shared assets once using the palette selected by the developer. Normal palette changes that are part of the selected game's runtime presentation are not alternate site palettes and should still be reproduced where applicable.

When palettes or environmental colors vary by time of day or weather, use daytime with clear or no-weather conditions as the canonical asset state. Do not generate separate night, weather, or seasonal variants.

When rendering maps from tiles and blocks, validate the source format's native tile size, block ordering, palette rules, animated or dynamically loaded tiles, and output dimensions. Inspect representative towns, interiors, caves, water boundaries, doors, and map connections at original resolution. A map can have the expected outer dimensions while still clipping or omitting part of every block, so dimensions alone are not sufficient validation.

## 7. Classify encounters

Every draft encounter must include its raw source method and a normalized `type`:

```json
{
  "method": "Old Rod",
  "type": "OldRod"
}
```

`EncounterType` in `PokemonFieldGuide.Shared` is authoritative. Its stable JSON names are:

- `Random`
- `Surfing`
- `OldRod`
- `GoodRod`
- `SuperRod`
- `Roaming`
- `RockSmash`
- `Headbutt`

The Game adapter must classify every source method. Package generation fails when `type` is missing or unknown. Add an `EncounterType` value and its exhaustive C# presentation mapping when a game introduces a genuinely new encounter category. Keep display labels and ordering out of generated JSON.

Register only the Checklist profile migration rules in `Program.cs`:

```csharp
builder.Services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("example"));
```

The Checklist profile registration gives the Local guide state module a package-owned migration seam. Do not add game-ID checks to `Home.razor`.

## 8. Register the package

Add a definition to `wwwroot/games/catalog.json` in the game's original release order:

```json
{
  "id": "example",
  "name": "Pokémon Example Red / Blue",
  "shortName": "Example",
  "pageTitle": "Pokémon Example | Pokemon Field Guide",
  "atlasTitle": "Example Region",
  "loadingLabel": "LOADING EXAMPLE REGION",
  "dataPath": "games/example/data/fieldguide.json",
  "pokedexPath": "games/example/data/pokedex.json",
  "worldsPath": "games/example/data/worlds.json",
  "pokemonSpritePath": "games/example/sprites/pokemon",
  "itemSpritePath": "games/example/sprites/items",
  "defaultAreaId": "MAP_EXAMPLE_ROUTE_1",
  "defaultWorldId": "example-region",
  "versions": [
    { "id": "ExampleRed", "name": "Example Red", "progressVersion": 2, "accent": "#e34848", "accentSoft": "#572626" },
    { "id": "ExampleBlue", "name": "Example Blue", "progressVersion": 2, "accent": "#4b70e2", "accentSoft": "#26365b" }
  ],
  "regions": [
    { "id": "Example Region", "name": "Example", "worldId": "example-region" }
  ],
  "dexModes": [
    { "id": "Regional", "name": "Regional", "regional": true },
    { "id": "National", "name": "National", "regional": false }
  ]
}
```

The shared header renders every catalog version in one game selector, preserving the order of packages in `games` and versions in each package's `versions` array. Keep both arrays in original release order whenever adding a game; do not merely append a package if a later-released package is already present. Package boundaries are not exposed as a second selection step. Region tabs appear only for packages with multiple regions/worlds.

Catalog fields have the following contracts:

| Field | Purpose |
| --- | --- |
| `id` | Stable package ID used by preferences and progress-profile keys. |
| `name` | Full game-family name shown beneath the application brand. |
| `shortName` | Compact label used by the guide selector. |
| `pageTitle` | Browser page title while this package is active. |
| `atlasTitle` | Heading shown in the location/search panel. |
| `loadingLabel` | Reserved package loading text. The pre-Blazor shell cannot read the catalog and currently uses its static application label. |
| `dataPath` | URL of `fieldguide.json`, relative to `wwwroot`. |
| `pokedexPath` | URL of `pokedex.json`, relative to `wwwroot`. |
| `worldsPath` | URL of `worlds.json`, relative to `wwwroot`. |
| `pokemonSpritePath` | Directory containing Pokémon sprites and `question_mark.png`. |
| `itemSpritePath` | Directory containing item sprites and `question_mark.png`. |
| `defaultAreaId` | Area selected when the package opens. |
| `defaultWorldId` | World selected when the package opens. |
| `versions` | Stable version IDs, per-game progress schema versions, display names, and normal/soft accent colors. |
| `regions` | Region IDs, tab labels, and corresponding world IDs. |
| `dexModes` | Pokédex choices; `regional: true` uses `RegionalNumber`, while false uses `Number`. |

`defaultGameId` at the catalog root must identify an installed package. It is used when saved preferences do not select a valid package.

The current shared coordinate conversion assumes 16-pixel map tiles. If a game uses another tile size, add declarative package metadata and consume it in the shared coordinate conversion rather than inserting a game-ID conditional.

## 9. Completion audit

Before committing:

1. Parse every JSON document and confirm every configured path exists.
2. Confirm all world placement IDs resolve after normalization.
3. Confirm every non-empty entrance target exists.
4. Confirm directed reachability before and after contraction: every area must be reachable from a world placement, and every interior must belong to a component opened by a world marker.
5. Confirm all encounter, special-Pokémon, and availability versions are `Both` or registered version IDs.
6. Confirm every obtainable Pokémon is represented by an encounter, special acquisition, or a documented locally available evolution from one; do not count player-to-player trade evolutions without an in-game exception.
7. Confirm every acquisition channel and event source used by the title has been inspected, including sources stored outside normal map scripts.
8. Review every unavailable Pokédex entry and confirm it has an expected, version-specific explanation.
9. Confirm visible, hidden, and event items were extracted from all of their distinct source tables.
10. Audit scripted rewards separately from map pickups, including Gym-leader TMs, HMs, NPC gifts, key items, conditional rewards, and rewards whose item ID is loaded indirectly before a shared give-item routine.
    Distinguish repeatable shop inventory from one-time gifts made at a counter or inside a commercial building; location alone does not make a reward shop stock.
11. Confirm checklist IDs are unique and stable.
12. Confirm referenced map and icon files exist or deliberately use a fallback, and remove generated assets that the final package does not reference.
13. Confirm color-capable games use the relevant platform's authentic palette data rather than grayscale output. If multiple alternative palette sets exist, record the developer's canonical choice and confirm that only one shared asset set was generated.
14. Confirm games with time- or weather-dependent colors were rendered in daytime with clear or no-weather conditions.
15. Visually inspect representative towns, interiors, caves, water boundaries, doors, and connections for complete blocks, correct palettes, alignment, and native pixel rendering.
16. Confirm sprite backgrounds are transparent where expected without removing internal light-colored details.
17. Build and publish the application.
18. Test each version, region, dex mode, theme, and viewport size.
19. Open representative relevant interiors, including multi-floor destinations reached through contracted transition-room chains.
20. Verify caught/item state remains isolated between versions and packages.

When importing warps, exclude entries the source identifies as inaccessible, unused, debug-only, or prototype-only before contracting empty transition areas. Otherwise an unreachable source warp can surface as a plausible-looking marker to a completely different relevant destination.

Prefer executable generator assertions for completeness, reachability, referential integrity, and expected availability sets. Keep the visual checks documented because corrupt tile rendering can still satisfy structural validation.

See [Development](development.md) for commands and the expected regression checks.
