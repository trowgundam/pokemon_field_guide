# Generation IV Sinnoh packages

Diamond/Pearl and Platinum use separate packages because their maps, encounter tables, map headers, and scripted content differ. Diamond and Pearl share the `dp` package because both versions use the same topology and asset archives. Platinum uses the `platinum` package. Both catalog packages start with Checklist profile v2.

## Tool ownership

`tools/gen4/` owns the fixed-angle map bake, projected marker anchors, layered-world construction, and display names shared by both packages. `tools/dp/` owns the Diamond/Pearl source reader, acquisitions, navigation exceptions, sprite selection, and package assembly. `tools/platinum/` owns the matching Platinum reader and rules.

The source formats are not interchangeable. Platinum exposes most headers, events, encounters, and scripts as decoded files. The pinned Diamond/Pearl project retains binary matrices, events, encounter archives, and land data. Each package owns its source reader and game-specific policy in `tools/dp/source.mjs` or `tools/platinum/source.mjs`; the Diamond/Pearl reader parses those binary layouts directly.

Diamond/Pearl's global visible-item script order is not decoded by its pinned source. The generator identifies each source Poké Ball or hidden-event coordinate, then cross-checks that coordinate against the pinned Platinum decomp. The Diamond/Pearl event must exist before this check can emit an item, so Platinum-only objects do not enter the package. Package tests pin representative Route 216 results.

## Fixed-angle map rendering

Apicula converts the source NSBMD and NSBTX files only during generation. A headless browser renders each source-declared area at Platinum's fixed field-camera pitch. It loads all cells in a multi-cell area into one scene so buildings and other props can cross cell boundaries without being cut off during PNG compositing. The baker also raycasts every marker coordinate against the source terrain. Package generation normally assembles area images from north to south so southern scenery overlaps its northern neighbor as it does in the games. Package-owned overrides keep a northern area's boundary building in front when the building itself crosses the seam. Platinum applies that rule to the Eterna City gate above Route 206 and both packages apply it to the Hearthome City gate above Route 212 North.

The main matrix contains 299 filler cells whose source header is `EVERYWHERE`. They are not locations and consist largely of repeated trees, rock roofs, and other boundary scenery. The production renderer omits 297 of them, matching the prototype's scope. It retains the generic rock-roof cell between Routes 207 and 208 and the matching cell between Route 211 West and East as non-interactive decoration. Those two layers have no area, marker, or hit contour. The renderer also retains the 169 source-declared cells. The connected world uses 166 of those cells in 62 Diamond/Pearl or 63 Platinum area layers, plus the two decoration layers; the three Canalave ferry islands become standalone area maps. Diamond/Pearl also drops matrix cells whose declared header resolves only to an excluded or unknown map instead of assigning those cells to an unrelated fallback area.

Transparent prop overhang remains part of its declared area's image. Before tracing contours, the generator removes pixels covered by every higher detail layer. It traces the remaining alpha at four-pixel resolution and simplifies that contour for the area's hit region. Highlights therefore follow trees, buildings, and other visible overhangs, stop where a higher layer owns the overlap, and do not expose source-cell bounds. Area hit regions use the same final order as the detail layers.

Both adapters convert the source's horizontal two-frame Pokémon sheets into the vertical layout used by the application. They remove only the dominant border-connected background, preserving enclosed light pixels. The adapters apply the same border-connected removal to item icons and generate a valid transparent fallback when a source icon is unavailable. Diamond/Pearl indexes its item-icon table by the declared game item constant rather than the compact decoded item-data order. When the pinned source exposes an icon only as indexed `NCGR` graphics and an `NCLR` palette, the generator decodes that pair to a transparent PNG. Generated-package tests reject any checklist item that still resolves to the fallback. Diamond/Pearl supplies each prop group with its source `areabm_texset`; omitting that texture archive causes buildings such as those in Hearthome City to render with missing faces.

The optional render cache records a content key derived from the pinned source revision, renderer code, retained matrices, and marker coordinates. A generator run discards and rebuilds a stale cache instead of reusing anchors from different input.

The deployed packages contain only PNG files. The connected Sinnoh world uses a one-eighth-scale overview and native-size transparent detail layers. Detail loading begins at world scale `0.125`, before the browser would enlarge the overview past its native pixels. The browser loads only layers near the viewport and evicts distant layers. Neither package ships GLB, NSBMD, NSBTX, Three.js, or a WebGL renderer.

The main source matrix remains one visual canvas even when travel is not continuous. The Battle Zone and Seabreak Path keep their source positions as disconnected components. The snowy Route 216-to-Snowpoint component is shifted two source-cell rows south in both packages to reduce unused space; every area in that component receives the same offset, so its internal geography is unchanged. Iron Island, Fullmoon Island, and Newmoon Island are removed from the connected canvas and rendered as standalone fixed-angle area maps. Canalave's ferry transport opens those exterior screens, and each exterior's ordinary entrance then leads inward.

## Scope

Both packages exclude the Underground, multiplayer-only rooms, unused maps, debug maps, and temporary Battle facility battle rooms. Package finalization contracts empty transition maps and culls unreferenced records. Script-selected Great Marsh and Turnback Cave connections remain navigation edges with `showMarker: false`.

Honey Trees appear as conditional encounter tables in each affected outdoor area. They have no map marker. Diamond and Pearl read their separate Honey Tree species archives. Platinum reads its decoded encounter table.

Feebas appears as a special table for all three rods in Mt. Coronet B1F. Four eligible fishing tiles are selected from save-dependent state and advance daily, so the guide cannot mark fixed coordinates. On a selected tile, Feebas replaces half of the ordinary fishing table. Trophy Garden and Great Marsh daily Pokémon also appear as complete conditional land tables. The generator reads the 16-entry Trophy Garden pool and both 32-entry Great Marsh pools from each game's source data, preserving duplicate pool entries as weights. Great Marsh emits separate tables for before and after the National Pokédex.

One-time NPC and story rewards are `Event` items with no map coordinate. Each package owns an explicit reward list and verifies every entry against the corresponding source map script before emitting it. Repeatable gifts, purchases, lottery prizes, item exchanges, Pal Pad rewards, and multiplayer-only rewards are not checklist items.

Visible entrances that share one coordinate and lead to multiple retained destinations become one transport choice. This represents source map-state alternatives without stacking indistinguishable markers. Empty state maps still contract normally. Dynamic elevators that connect retained floors use the same transport model, while source warps outside the rendered geometry remain navigation-only and do not create visible markers.

Phione has `Event distribution` availability in all three versions. Breeding can produce it, but the first Phione requires a Manaphy obtained through the external Manaphy Egg event or through trade or transfer. The breeding closure must not turn that event-gated dependency into normal `Obtainable` availability.

Spiritomb remains a static encounter and carries its requirement of 32 conversations with other players in the Underground as a note. Regigigas is transfer-required in Diamond and Pearl because activating it requires the three transferred Regis. Platinum marks Regirock, Regice, Registeel, and Regigigas as transfer-required because the local Regi encounters require an event Regigigas whose own prerequisite chain is external. Platinum evolution closure accepts both source tuple shapes so friendship, location, and other non-trade evolutions correctly inherit local availability.

Platinum retains only `MAP_HEADER_DISTORTION_WORLD_GIRATINA_ROOM` from the Distortion World. That area contains the level 47 Giratina static encounter and no item. The Griseous Orb is a visible item in `MAP_HEADER_TURNBACK_CAVE_GIRATINA_ROOM`; Platinum creates that object through overlay code rather than the ordinary event archive.

## Regeneration

Generation IV needs Google Chrome or Chromium, Rust 1.73 or later, Cargo, and the pinned Apicula checkout. Rust 1.73 is the highest minimum declared by the dependencies in Apicula's locked graph. `GEN4_CHROME` can select a browser executable. `GEN4_RENDER_ROOT` can preserve the large intermediate render cache between runs.

Clone the pinned sources:

```sh
just clone-dp /tmp
just clone-platinum /tmp
just clone-apicula /tmp
```

Regenerate both packages:

```sh
just generate-dp /tmp/pokediamond /tmp/pokeplatinum /tmp/apicula
just generate-platinum /tmp/pokeplatinum /tmp/apicula
```

The recipes verify all source revisions, build Apicula with `cargo build --locked`, install the exact Node dependencies, render the maps, and replace one package only after final validation passes.

## Verification

The generated-package tests check the complete Pokédex, version-exclusive Diamond/Pearl availability, scripted rewards, Feebas, Trophy Garden, Great Marsh, acquisition prerequisites, evolution closure, collision transports, Honey Tree coverage, item-icon source resolution, layered PNG dimensions, projected markers, navigation-only edges, decorative rock-roof gaps, boundary-building layer overrides, rejected unused matrix headers, and the limited Distortion World scope. Inspect the Sinnoh overview, the Eterna City/Route 206, Hearthome City/Route 212 North, Route 207/208, and Route 211 seams, Route 216, Twinleaf Town, Turnback Cave, and one multi-floor interior after a renderer change. Run `just check` after regeneration.
