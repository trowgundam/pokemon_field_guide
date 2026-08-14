# Architecture

## Purpose

Pokemon Field Guide is a static Blazor WebAssembly application. The atlas UI and persistence model are shared, while each supported game family supplies a self-contained package of metadata, guide data, maps, sprites, and exceptional rules.

FireRed and LeafGreen are two versions in the `frlg` package. A future pair such as two versions sharing the same world and mechanics would normally be one additional package with two version definitions, not two packages.

## Runtime data flow

```mermaid
flowchart LR
    C[games/catalog.json] --> L[GamePackageLoader]
    L --> D[fieldguide.json]
    L --> P[pokedex.json]
    L --> W[worlds.json]
    C --> R[GameRulesRegistry]
    R --> U[Shared atlas UI]
    D --> U
    P --> U
    W --> U
    U <--> S[Browser local storage]
```

At startup, `Home.razor` loads saved preferences and the catalog. It selects `SavedProgress.GameId`, falling back to `GameCatalog.DefaultGameId`, and asks `GamePackageLoader` to fetch the package's guide, Pokédex, and world documents concurrently. The package's `rules` value resolves an `IGameRules` implementation through `GameRulesRegistry`.

The page renders versions, regions, Pokédex modes, labels, paths, defaults, and colors from `GameDefinition`. Title-specific exceptions are delegated to `IGameRules`.

## Source layout

```text
PokemonFieldGuide/
├── Models/
│   ├── FieldGuideData.cs       Generated-data and saved-progress contracts
│   └── GamePackage.cs          Catalog and package metadata contracts
├── Pages/
│   └── Home.razor              Shared atlas, checklist, interiors, and Pokédex UI
├── Services/
│   ├── GamePackageLoader.cs    Catalog and package loading
│   └── GameRules.cs            Rules interface, registry, and providers
└── wwwroot/
    ├── games/
    │   ├── catalog.json
    │   └── <game-id>/
    │       ├── data/
    │       ├── maps/
    │       └── sprites/
    ├── css/app.css
    └── index.html
```

Game-owned files must remain below `wwwroot/games/<game-id>/`. Global static files are limited to application-wide resources such as the shell, stylesheet, PWA icons, and service worker.

## Shared models

`FieldGuideData` contains areas. Each `GuideArea` can contain:

- wild `Encounter` rows, filtered by version;
- visible, hidden, or event `GuideItem` rows;
- static, gift, or trade `SpecialPokemon` rows;
- `MapEntrance` edges to other areas;
- an optional rendered map and its pixel dimensions.

`GuideWorld` describes one connected outdoor canvas. Its `WorldMapPlacement` records use pixel coordinates and dimensions. Encounter and item coordinates use game-map tile coordinates; the current renderer places their markers at the center of a 16-pixel tile.

`PokedexEntry.Availability` is keyed by version ID. `RegionalNumber` is nullable so the same document supports regional and full-dex views.

## Package metadata

The catalog is deserialized into `GameCatalog` and `GameDefinition`. A definition owns:

- identity and display text;
- its rules-provider ID;
- data and asset paths;
- versions and their accent colors;
- visible region tabs and their world IDs;
- available Pokédex modes;
- initial world and area IDs.

Paths are URLs relative to `wwwroot` and must not start with `/`. This makes them compatible with both root hosting and a GitHub Pages repository base path.

## Rules boundary

`IGameRules` is the boundary for behavior that cannot be expressed by current package metadata:

- normalizing map IDs used by world placements and area data;
- naming and ordering encounter groups;
- ordering special-Pokémon and item groups;
- mapping species and item names to sprite filenames;
- supplying an embedded Pokémon icon when no file exists.

The shared page must not test game IDs, game titles, or title-specific map constants. Add metadata when the behavior is declarative; add or extend a rules implementation when it is procedural.

## Map and interior behavior

Outdoor areas are those referenced by any loaded `GuideWorld`. `NormalizeAreaId` allows a rendered placement to resolve to a differently named guide area when source data requires it.

Interior reachability is graph-based. An outdoor warp is followed through empty transition maps until the nearest interior containing encounters, items, or special Pokémon is found. Once open, all non-outdoor areas connected through entrance edges become selectable floors. Consequently, complete and correct entrance edges are essential even for rooms with no checklist content.

Adjacent warp tiles resolving to the same target are clustered into a single entrance marker. Separate entrance clusters remain separate markers.

## Saved progress

The storage key remains `frlg-field-guide-v1` for compatibility. Despite its historical name, it stores all packages.

Checklist profiles are keyed as `<game-id>:<version-id>`, preventing collisions between packages with similarly named versions. Selected versions and Pokédex modes are remembered per package; theme is global. Resetting progress clears profiles while retaining preferences.

Legacy version-only FRLG profiles and the original top-level caught/item collections are migrated when loaded. Changing the storage key or checklist IDs requires an explicit migration plan.

## Browser integration

`wwwroot/index.html` owns functions that must exist before Blazor starts:

- local-storage load/save;
- early theme/accent application to prevent a startup flash;
- pointer-based map pan and zoom;
- base-map load gating so overlays do not appear first.

`Home.razor` invokes these functions through `IJSRuntime`. Map transforms are browser-side to keep pointer movement immediate and avoid a Blazor render on every frame.
