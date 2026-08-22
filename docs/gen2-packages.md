# Generation II packages

Gold/Silver and Crystal are separate runtime packages. Gold and Silver share the `gs` package because their topology and source format are the same; version-specific records and sprites remain keyed by `Gold` or `Silver`. Crystal uses the `crystal` package because it has its own source checkout, maps, encounters, events, and sprites.

## Tool structure

The public commands are thin package adapters:

```text
tools/gs/generate-fieldguide.mjs
tools/gs/build-package.mjs
tools/crystal/generate-fieldguide.mjs
tools/crystal/build-package.mjs
              │
              ▼
tools/gen2/build-package.mjs
tools/gen2/display-names.mjs
tools/gen2/map-layouts.mjs
tools/gen2/map-rendering.mjs
tools/gen2/connected-world.mjs
tools/gen2/sprite-rendering.mjs
              │
              ▼
tools/package-finalization/
```

Each public command owns its package ID and installed dependency set. Each package builder owns its source-project name, version definitions, acquisitions that differ between projects, extra world placements, tileset graphics aliases, and sprite policy. The shared Generation II modules own stable RGBDS parsing, display-name conversion, map rendering, connected-world construction, and sprite background processing. Package finalization remains unaware of Generation II source details.

This boundary preserves two independently installable game packages without duplicating the source-format core. `build-package.mjs` coordinates source extraction and draft assembly. The focused rendering modules hide pixel, atlas, and sprite algorithms. None of the shared modules branches on a package ID or names a Crystal-only map.

## Data model additions

An encounter may have a `condition`. The runtime groups by encounter type and condition, so morning, day, night, swarm, and tree-rarity tables do not collapse into one probability table. Package finalization checks each type-condition-version table independently.

Manifest format v2 may include `pokemonSpritesByVersion`. The runtime looks up a sprite for the active version first, then uses the package-wide association, then the question-mark fallback. This lets Gold and Silver share data and maps while retaining their different battle sprites. Crystal stores one package-wide association per species.

Headbutt is a stable `EncounterType`, alongside the existing grass, surfing, rod, roaming, and Rock Smash categories.

Renewable pickups and repeatable item rewards use `GuideArea.Resources`, not checklist items. The builders join the ordered `FRUITTREE_*` constants with `data/items/fruit_trees.asm`, resolve each `SPRITE_FRUIT_TREE` object through its script, and audit all 30 source trees. They also emit the weekly Moon Stone, the Bug-Catching Contest prize, the Sunday TM reward, and the Magikarp record prize. Crystal adds the Battle Tower prize. Crystal phone gifts become ten coordinate-bearing `Register [trainer]` checklist events because registration is the one-time enabling goal.

## Source and rendering rules

The adapter reads map constants, definitions, attributes, blocks, events, wild tables, fishing groups, tree tables, trades, evolutions, and Pokédex order directly from a compatible pret checkout. It does not require a ROM.

Fishing groups are assigned broadly in the source, including to maps where the player cannot cast a rod. The adapter therefore checks the collision definitions for the blocks present in each map and emits fishing tables only when a used block contains a water-permission tile.

Generation II loads nine town-roof tiles into fixed tile slots at runtime and replaces two roof-palette colors for the active map group. The renderer performs the same substitutions and maps high-bit metatile IDs to the second 96-tile graphics bank. It otherwise uses the documented canonical daytime palette.

Johto and Kanto share one connected world canvas. The core follows source outdoor connections from New Bark Town and Pallet Town, then joins their route components at the Victory Road approaches. Routes 22, 23, 26, and 28 keep their full rendered dimensions and occupy the east, north, south, and west sides of an otherwise empty 320 by 320 space. A rocky Victory Road connector fills that space. The route rectangles do not overlap, and every placement keeps a zero marker offset. Warp-reached parks, ports, roofs, and landmark exteriors remain interior maps when their rendered boundaries do not align with the connected outdoor canvas. Ruins of Alph Outside remains an interior for this reason.

Crystal places the northwest 320 by 320 portion of Battle Tower Outside directly above Route 40 because those rendered edges align. Package finalization contracts the empty Route 40 gate, so the exterior is reached from the world and its doorway opens Battle Tower 1F. Battle Tower 1F has one resource whose weighted pool lists HP Up, Protein, Iron, Carbos, and Calcium in quantities of five. The Crystal builder supplies `johto_modern` as the tile-graphics basename for this map. The shared renderer still uses the Battle Tower tileset name for its metatiles and palette map.

Gold and Silver source sprites are registered by version. Crystal front sprites are animation strips, so the adapter extracts their first native square battle frame. The adapter clears only the dominant background color connected to the image border, preserving light-colored details enclosed by the sprite. Item records use the package question-mark icon because these projects do not supply standalone bag item sprites.

## Design decision

Three module shapes were considered:

1. Duplicate complete generators under `tools/gs/` and `tools/crystal/`. This would isolate every difference but duplicate the map renderer, parsers, and shared audits.
2. Give each package its own builder over a shared Generation II source-format core. This makes current divergences explicit while retaining one implementation of stable parsing and rendering rules.
3. Keep one monolithic builder and pass a package ID or hook collection through it. This would centralize files but scatter package policy across conditional branches or optional callbacks.

The second shape was selected because divergences already exist in legendary levels, roaming Pokémon, Battle Tower rewards and placement, Odd Eggs, graphics aliases, and sprite extraction. Full duplication would make corrections to shared rendering and graph behavior easy to apply to only one package. A hook collection would hide which phases each package controls. The selected interface lets each builder prepare the shared source model, add package-owned content, extend the world layout, register package-owned sprites, and finish the package. Focused shared modules own display names, map rendering, atlas geometry, and sprite processing. A future source-format divergence can move out of the core without changing package finalization or the runtime contract.

## Verification

Run both generators, then run the repository checks:

```sh
just generate-gs /path/to/pokegold
just generate-crystal /path/to/pokecrystal
just check
```

In addition to automated checks, inspect native-resolution maps with dynamic roofs, water boundaries, caves, and interiors. Check the four-route Victory Road junction on the combined world. Verify the Battle Tower Outside alignment in Crystal and confirm that warp-reached landmarks open as interiors. Compare at least one Gold/Silver species whose battle sprite differs between versions. Compare one Crystal sprite with its first source animation frame and confirm that its background is transparent.
