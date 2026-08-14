# Adding a game

This guide describes the complete package-authoring process. It assumes the new title can provide outdoor map images, individual interior maps, encounter and item data, a Pokédex, and stable identifiers. The source may be a decompilation, an independently maintained dataset, or another lawful source; a ROM must not be committed or required by the deployed application.

## 1. Choose the package and version boundaries

Create one package for versions that share map topology, assets, data shape, Pokédex rules, and title-specific behavior. Give the package a short, stable, lowercase ID such as `frlg`. Each version is still treated as an independent game for checklist progress, backup selection, availability filtering, accent color, and other version-specific preferences. The package prevents unnecessary duplication; it does not imply shared progress.

If paired games differ only in some records, keep one copy of shared maps and sprites and identify version-specific encounter or special-Pokémon records with the exact version ID. Split them into separate packages only when their topology, assets, source tooling, or runtime rules differ enough that a shared package would require pervasive exceptions.

Do not rename an ID after release without a saved-progress migration.

## 2. Create the package directories

Use this layout:

```text
PokemonFieldGuide/wwwroot/games/<game-id>/
├── data/
│   ├── fieldguide.json
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

Create package-specific extraction and rendering scripts under `tools/<game-id>/` when generated assets are needed. The scripts may use any language or dependencies appropriate to that game's lawful source data, and must write only to `PokemonFieldGuide/wwwroot/games/<game-id>/`. Do not extend the FRLG scripts merely because another title uses a related engine; reuse code only where the input and output contracts are actually shared. Record commands and prerequisites in [Development](development.md), following the [tooling conventions](../tools/README.md).

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
  "version": "ExampleRed"
}
```

Use `Both` for a row shared by every package version, otherwise use an exact catalog version ID. Multiple slots for one species may remain separate; the UI groups display by species while retaining method and level information.

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

Special-Pokémon IDs are checklist keys. Use `requestedSpecies` for an in-game trade. Anything obtainable in single-player through a battle, gift, scripted event, or NPC trade should be represented in an appropriate area.

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

World placement coordinates and dimensions are pixels in the connected image. Placement IDs must resolve to areas after `IGameRules.NormalizeAreaId`. The world image must align exactly with every placement because markers add the area's tile coordinates to the placement origin.

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

## 6. Add sprites

Provide Pokémon menu sprites and bag item icons using the filenames returned by the package's rules implementation. Images should retain native pixel art and transparency. Do not rely on browser smoothing.

If a predictable file cannot represent a species, return a data URI from `EmbeddedPokemonIcon`. If an individual asset is unavailable, allow the required `question_mark.png` fallback to render rather than emitting a broken URL.

## 7. Implement game rules

Create an `IGameRules` implementation and provider, preferably in a game-specific source file once more packages exist:

```csharp
public sealed class ExampleRulesProvider : IGameRulesProvider
{
    public string Id => "example";
    public IGameRules Rules { get; } = new ExampleRules();
}
```

Implement every interface member:

- `NormalizeAreaId` maps world-placement aliases to guide-area IDs.
- `EncounterGroupName` converts raw encounter methods into headings.
- `EncounterGroupOrder`, `SpecialGroupOrder`, and `ItemGroupOrder` return stable display order values.
- `PokemonSpriteName` and `ItemSpriteName` return filenames only; the catalog supplies directory paths.
- `EmbeddedPokemonIcon` returns null unless a species needs an inline fallback.

Register the provider in `Program.cs`:

```csharp
builder.Services.AddSingleton<IGameRulesProvider, ExampleRulesProvider>();
```

The provider ID and the catalog's `rules` value must match. Do not add game-ID checks to `Home.razor`.

## 8. Register the package

Append a definition to `wwwroot/games/catalog.json`:

```json
{
  "id": "example",
  "rules": "example",
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
    { "id": "ExampleRed", "name": "Example Red", "accent": "#e34848", "accentSoft": "#572626" },
    { "id": "ExampleBlue", "name": "Example Blue", "accent": "#4b70e2", "accentSoft": "#26365b" }
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

When the catalog contains multiple packages, the shared header automatically renders a guide selector.

Catalog fields have the following contracts:

| Field | Purpose |
| --- | --- |
| `id` | Stable package ID used by preferences and progress-profile keys. |
| `rules` | ID exposed by the registered `IGameRulesProvider`. |
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
| `versions` | Stable version IDs, display names, and normal/soft accent colors. |
| `regions` | Region IDs, tab labels, and corresponding world IDs. |
| `dexModes` | Pokédex choices; `regional: true` uses `RegionalNumber`, while false uses `Number`. |

`defaultGameId` at the catalog root must identify an installed package. It is used when saved preferences do not select a valid package.

The current shared coordinate conversion assumes 16-pixel map tiles. If a game uses another tile size, add declarative package metadata and consume it in the shared coordinate conversion rather than inserting a game-ID conditional.

## 9. Validate the package

Before committing:

1. Parse every JSON document and confirm every configured path exists.
2. Confirm all world placement IDs resolve after normalization.
3. Confirm every non-empty entrance target exists.
4. Confirm all encounter, special-Pokémon, and availability versions are `Both` or registered version IDs.
5. Confirm checklist IDs are unique and stable.
6. Confirm referenced map and icon files exist or deliberately use a fallback.
7. Build and publish the application.
8. Test each version, region, dex mode, theme, and viewport size.
9. Open representative interiors, including multi-floor and transition-room cases.
10. Verify caught/item state remains isolated between versions and packages.

See [Development](development.md) for commands and the expected regression checks.
