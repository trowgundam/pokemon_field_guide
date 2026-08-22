# FireRed and LeafGreen renewable hidden items

This page preserves the source audit for renewable FireRed and LeafGreen items and records the current generator behavior.

## Conclusion

The FireRed and LeafGreen generator emits 64 renewable map resources: 61 hidden-item events on 15 maps, Selphy's repeatable request reward, and two size-record prizes. The generator checks hidden-item flags against the source allowlist. It emits the remaining hidden events as checklist items.

This research uses `pret/pokefirered` commit [`c75f352`](https://github.com/pret/pokefirered/tree/c75f352304d529f6ba92d4f74b9cf8b5c3810788) as its primary source.

## Exact mechanic

`sRenewableHiddenItems` is the authoritative allowlist. Each entry names a map and divides as many as eight hidden-item flags into rare, uncommon, and common tiers ([table definition](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L6-L23)). The 61 unique flags in this table each resolve to one `bg_events` object whose type is `hidden_item`. All 61 have quantity 1 and `underfoot: false` in their map JSON.

The lifecycle is:

1. A new game sets every tabled flag, so all renewable spots start unavailable ([new-game initialization](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/new_game.c#L125-L149), [flag traversal](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L536-L555)). Picking up a hidden item also sets its flag ([pickup script](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/scripts/obtain_item.inc#L148-L174), [flag setter](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/field_specials.c#L158-L161)). A set flag therefore means that spot is unavailable.
2. Every field input reported as `tookStep` increments `VAR_RENEWABLE_ITEM_STEP_COUNTER`. The counter stops at 1,500 ([step hook](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/field_control_avatar.c#L215-L223), [counter implementation](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L557-L564), [variable definition](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/include/constants/vars.h#L62-L66)).
3. Reaching 1,500 steps does not refresh items immediately. A map load calls `TryRegenerateRenewableHiddenItems`, and regeneration proceeds only if the entered map is one of the 15 table entries ([map-load hooks](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/overworld.c#L752-L808), [map and threshold check](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L566-L585)).
4. A refresh resets the counter to zero, sets all 61 flags, then rolls once for each of the 15 maps. The roll selects the map's rare tier at 10%, uncommon tier at 30%, or common tier at 60%, and clears every flag in that tier ([sampling code](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L579-L607)). Items in the selected tier become available together. The rolls are per map, not per spot. A refresh can also remove an uncollected item from the previous cycle because it sets every flag before sampling.

The result is a 1,500-step, map-entry-triggered reroll. It is not a daily timer and it is not an independent 1,500-step respawn for each item.

## Eligible events

The percentages below are the chance that a location is available after one refresh. Locations that share a tier on the same map are correlated because the game makes one roll for that map.

| Map | Available locations after a refresh | Source tier |
| --- | --- | --- |
| [Route 20](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/Route20/map.json) | Stardust at `(23, 6)`, 30% | [Uncommon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L23-L57) |
| [Route 21 North](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/Route21_North/map.json) | Pearl at `(17, 42)`, 30% | [Uncommon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L58-L91) |
| [Underground Path North-South Tunnel](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/UndergroundPath_NorthSouthTunnel/map.json) | Ether at `(3, 39)`, 10%. Potion `(5, 30)`, Antidote `(5, 6)`, Paralyze Heal `(3, 15)`, Awakening `(1, 24)`, Burn Heal `(2, 57)`, and Ice Heal `(6, 53)`, each 30%. | [Rare and uncommon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L92-L125) |
| [Underground Path East-West Tunnel](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/UndergroundPath_EastWestTunnel/map.json) | Ether at `(55, 2)`, 10%. Potion `(7, 3)`, Antidote `(62, 5)`, Paralyze Heal `(17, 5)`, Awakening `(31, 4)`, Burn Heal `(45, 3)`, and Ice Heal `(70, 3)`, each 30%. | [Rare and uncommon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L126-L159) |
| [Seven Island Tanoby Ruins](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/SevenIsland_TanobyRuins/map.json) | Heart Scales at `(8, 2)`, `(33, 10)`, `(86, 9)`, and `(125, 5)`, each 10%. | [Rare](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L160-L193) |
| [Mt. Moon B1F](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/MtMoon_B1F/map.json) | Tiny Mushrooms at `(46, 2)`, `(26, 2)`, and `(39, 34)`, each 40%. Big Mushrooms at `(24, 35)`, `(6, 12)`, and `(25, 34)`, each 10%. | [Rare and uncommon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L194-L227) |
| [Three Island Berry Forest](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/ThreeIsland_BerryForest/map.json) | Razz `(31, 25)`, Nanab `(25, 24)`, Chesto `(47, 5)`, Pecha `(7, 30)`, and Rawst `(16, 5)` Berries, each 60%. Bluk `(15, 15)`, Wepear `(11, 24)`, Oran `(37, 18)`, Cheri `(14, 23)`, Aspear `(25, 6)`, Persim `(46, 32)`, and Pinap `(43, 16)` Berries, each 40%. Lum Berry at `(8, 5)`, 10%. | [All tiers](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L228-L261) |
| [One Island Treasure Beach](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/OneIsland_TreasureBeach/map.json) | Ultra Balls at `(15, 22)` and `(16, 33)`, each 100%. Stardust at `(8, 20)` and `(13, 27)`, and Pearls at `(11, 31)` and `(9, 34)`, each 30%. Star Piece `(15, 29)` and Big Pearl `(8, 27)`, each 10%. | [All tiers](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L262-L295) |
| [Three Island Bond Bridge](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/ThreeIsland_BondBridge/map.json) | Pearl at `(44, 12)` and Stardust at `(33, 7)`, each 30%. | [Uncommon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L296-L329) |
| [Four Island](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/FourIsland/map.json) | Pearl at `(22, 34)`, 30%. Ultra Ball at `(6, 21)`, 60%. | [Uncommon and common](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L330-L363) |
| [Five Island Memorial Pillar](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/FiveIsland_MemorialPillar/map.json) | Big Pearl at `(8, 52)`, 10%. | [Rare](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L364-L397) |
| [Five Island Resort Gorgeous](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/FiveIsland_ResortGorgeous/map.json) | Nest Ball `(10, 7)` and Star Piece `(40, 12)`, each 10%. Stardust at `(27, 11)` and `(27, 5)`, each 30%. | [Rare and uncommon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L398-L431) |
| [Six Island Outcast Island](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/SixIsland_OutcastIsland/map.json) | Star Piece at `(16, 23)` and Net Ball at `(6, 24)`, each 10%. | [Rare](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L432-L465) |
| [Six Island Green Path](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/SixIsland_GreenPath/map.json) | Ultra Ball at `(12, 9)`, 60%. | [Common](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L466-L499) |
| [Seven Island Trainer Tower](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/SevenIsland_TrainerTower/map.json) | Big Pearl at `(49, 27)`, 10%. Pearl at `(47, 30)`, 30%. | [Rare and uncommon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/renewable_hidden_items.c#L500-L534) |

Membership must be checked by flag, not by map. Five other hidden items occupy maps in the table but are not renewable: the Max Repel on Bond Bridge, the Razz, Sitrus, and Bluk Berries at Memorial Pillar, and the Nanab Berry at Trainer Tower ([Bond Bridge events](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/ThreeIsland_BondBridge/map.json#L177-L205), [Memorial Pillar events](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/FiveIsland_MemorialPillar/map.json#L107-L146), [Trainer Tower events](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/SevenIsland_TrainerTower/map.json#L63-L92)). They should remain checklist items.

## Selphy's repeatable rewards

Selphy's reward loop in Resort Gorgeous House is repeatable, but it is not part of the renewable hidden-item system.

When Selphy makes a request, the game chooses a seen Pokémon and a reward. The reward is a Luxury Ball on the 70% branch. On the 30% branch it chooses one of Big Pearl, Pearl, Stardust, Star Piece, Nugget, or Rare Candy ([reward table and sampler](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/field_specials.c#L652-L659), [reward probabilities](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/field_specials.c#L711-L717)). The 250-step counter is a deadline for showing the requested Pokémon, not a refresh cadence. At 250 steps the request expires, and talking to Selphy creates another request and reward ([timeout and resampling](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/field_specials.c#L661-L688)). Completing a request gives the sampled item and resets the requested species, so the next conversation can start another cycle ([house script](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/FiveIsland_ResortGorgeous_House/scripts.inc#L6-L62)).

The generator represents Selphy as one resource with a weighted reward pool. Selphy is one NPC interaction at `(4, 4)`, not seven map pickup points ([Selphy object](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/FiveIsland_ResortGorgeous_House/map.json#L17-L31)). Her possible rewards have no checklist IDs.

## Size-record prizes

Two judges give another fixed item whenever the player beats the saved record:

- The Route 12 Fishing House judge at `(4, 4)` gives a Net Ball for each new Magikarp size record ([script](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/Route12_FishingHouse/scripts.inc#L30-L85), [object](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/Route12_FishingHouse/map.json#L15-L29)).
- The Water Path House 1 judge at `(3, 4)` gives a Nest Ball for each new Heracross size record ([script](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/SixIsland_WaterPath_House1/scripts.inc#L7-L67), [object](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/SixIsland_WaterPath_House1/map.json#L15-L29)).

The record flag shows that a baseline has been established; it does not permanently disable the award. The larger-record branch continues to give the Ball after the flag is set. The generator emits the Net Ball and Nest Ball as fixed-output resources. Each resource uses the item as its marker name and explains the increasing record requirement in its comment.

## Excluded repeatable-looking rewards

Pokemon Jump and Dodrio Berry Picking can award Berries repeatedly, but they require wireless multiplayer. Multiplayer-only prizes are outside the resource scope.

Trainer Tower rewards are not indefinitely repeatable for one fixed challenge dataset. The save records `receivedPrize`, and the prize routine refuses another award while it is set ([prize guard](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/trainer_tower.c#L791-L817)). That state is cleared when the challenge dataset ID changes, not after another run ([dataset reset](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/trainer_tower.c#L1043-L1052)). Do not emit a Trainer Tower resource.

## Version applicability

These resources apply to both FireRed and LeafGreen. This is an inference from the build structure: the Makefile compiles every `src/*.c` file into each build, exposes targets for both versions and their revisions, and the renewable table has no `FIRERED`, `LEAFGREEN`, or revision conditionals ([C source collection](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/Makefile#L170-L172), [version targets](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/Makefile#L224-L242)). The shared map events also have no version conditions. The generator emits these resources with no version split.

## Generator implementation

The FRLG generator reads the unique `HIDDEN_ID(...)` flags from `src/renewable_hidden_items.c`, then branches while processing `bg_events`:

- If a hidden item's flag is in the renewable set, the generator emits a `GuideMapResource` and does not emit a `GuideItem`.
- Each resource uses the map event's item and coordinates. Its `1,500-step renewable hidden item` kind states both the interaction and cadence without claiming that every spot appears on every refresh.
- The package keeps the full set of 61 possible locations. Static package data cannot know which tier a player's save rolled.
- Generation fails unless the source table contains 61 unique flags, all 61 resolve to exactly one hidden-item event, and all 15 table maps are represented. These checks catch upstream table or map changes instead of silently changing the package.

The generator also adds one Selphy resource and two fixed record-prize resources. Generation fails unless the completed package contains exactly 64 resources and none of the 61 renewable hidden events or nine displaced event rows remains in `GuideArea.Items`.

The dedicated resource model already matches the lifecycle. These pickups have no permanent collected state, and their availability may change without the player touching the location.
