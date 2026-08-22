# Generation III Hoenn packages

Ruby/Sapphire and Emerald are separate packages. The `rs` package contains independently tracked Ruby and Sapphire versions because they share topology, assets, and source formats. Emerald has its own package because its topology, acquisitions, event destinations, sprites, and source project differ. The public generators and dependency locks remain under `tools/rs/` and `tools/emerald/`; stable shared GBA logic belongs under `tools/gen3/`.

The installed data was generated from [`pret/pokeruby` commit `63a8cbf`](https://github.com/pret/pokeruby/tree/63a8cbf0016b351a4e68f7036fa0b77e23d2f2c1) and [`pret/pokeemerald` commit `201378b`](https://github.com/pret/pokeemerald/tree/201378bdc09692df7ba3530c9fe68b4c8efe1c00). A source checkout is needed only for regeneration. The deployed application uses the committed package files and never requires a ROM.

## Worlds and map states

Both packages expose selectable Hoenn and Underwater world layers. Each layer contains only the cardinal component reached from its declared root. Ocean routes are part of Hoenn. Warp-connected outdoor-looking maps, detached underwater pockets, Sootopolis, and the event islands remain interior graphs. The generators convert source cardinal transitions and reciprocal scripted Dive transitions into entrance edges when either endpoint is not on a world. Ruby/Sapphire's Battle Tower and Emerald's two-map Battle Frontier canvas are hidden worlds with inbound ferry transports, so neither appears as a region tab.

Hoenn contains 49 placements rooted at Littleroot Town. Ruby/Sapphire's Underwater layer contains the four-map component rooted at Underwater 1. Emerald's Underwater layer contains the four-map component rooted at Underwater Route 124. The Sootopolis chain runs from the main Underwater layer through Underwater Sootopolis City and surfaces in Sootopolis City. Southern Island opens as an interior from the S.S. Tidal transport marker.

Route 130 renders the useful Mirage Island state. Shoal Cave retains low- and high-tide maps in its interior navigation graph. Ruby and Sapphire differ inside Cave of Origin B4F and Seafloor Cavern Room 9. Manifest v3 stores complete Ruby image descriptors for those two interiors while Sapphire uses each area's base descriptor. Outdoor version overrides remain prohibited because they would invalidate connected-world placement geometry.

Maps use the first animation frame, base palette, and no weather overlay. Emerald battle sprites retain their source animation strips; Ruby/Sapphire sprites use their static source fronts. The generator makes each sprite's border-connected background transparent. Emerald renders source-native bag item graphics with each item's table-selected palette. The pinned Ruby/Sapphire source does not expose standalone bag item graphics or an item-icon table, so that package uses the item fallback.

Both generators format Technical Machines as `TM<number> - <Move Name>`. A shared resolver reads the authoritative 50-entry TM ordering from each source project, maps Ruby/Sapphire's numbered constants and Emerald's move-named constants to the same representation, and supplies Emerald's numeric item-icon table key. Neither package reads data or assets from the other package's source checkout.

## Encounters and acquisitions

Underwater wild tables use the dedicated `Underwater` encounter type. Feebas appears as a 50-percent conditional table for each rod on the six save-dependent Route 119 tiles; the ordinary fishing table supplies the other 50 percent. Each mass outbreak is another independently normalized conditional grass table. Emerald's nine Altering Cave configurations are separate event-state tables.

The package-specific builders add source aliases and non-literal acquisitions that the shared script parser cannot infer, including starters, roamers, NPC trades, and Ruby/Sapphire's version-selected legendary aliases. Emerald includes locally obtainable event-island Pokémon. A species obtainable only by direct external distribution has Pokédex availability `Event distribution` and no invented area.

Emerald lists both Latios and Latias as valid roaming outcomes and as valid Southern Island outcomes. The television choice selects one species as the roamer, and the opposite species appears on Southern Island. The guide lists both mutually exclusive possibilities at each source because either assignment is legitimate for an Emerald save.

Emerald's Battle Pike and Battle Pyramid rental or temporary encounters are excluded. They cannot be collected and do not come from the normal wild-encounter group.

## Transports

An S.S. Tidal marker on Lilycove City opens a destination chooser. Package finalization promotes it from the otherwise empty Lilycove Harbor to the city's harbor entrance. Ruby/Sapphire exposes the Battle Tower and Southern Island. Emerald exposes the Battle Frontier, Southern Island, Navel Rock, Birth Island, and Faraway Island. Each destination names its ticket or story requirement, but requirements do not lock navigation or create checklist entries. Every event destination includes its source return ferry.

Transports contribute directed reachability without joining interior floor graphs. Emerald's changing Terra Cave entrances remain physical entrance markers at all eight possible route coordinates. Marine Cave and Seafloor Cavern use explicit emerge or dive edges because the source implements those transitions dynamically rather than as ordinary map warps.

## Renewable resources

Each package emits 104 resources:

- 88 berry-tree plots, including 80 initially seeded plots and eight initially empty plots;
- eight daily berry-gift NPCs;
- four Shoal Shell and four Shoal Salt tide-reset pickups.

One-time Berry Master phrase rewards remain checklist items. Random daily fallback gifts are resources. Purchases, exchanges, lotteries, multiplayer prizes, Battle Point rewards, and temporary Battle Frontier items remain outside the resource model.
