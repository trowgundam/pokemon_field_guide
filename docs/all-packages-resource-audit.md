# Resource audit for all game packages

## Conclusion

The seven installed packages contain the following renewable item resources:

<!-- check:package-resource-counts -->
| Package | Package ID | Resources | Current representation |
| --- | --- | ---: | --- |
| Red/Blue | `rb` | 0 | No qualifying sources |
| Yellow | `yellow` | 0 | No qualifying sources |
| Gold/Silver | `gs` | 34 | 30 fruit trees and four recurring world or event rewards |
| Crystal | `crystal` | 35 | Gold/Silver resources plus the Battle Tower prize |
| Ruby/Sapphire | `rs` | 104 | 88 berry plots, eight daily berry gifts, and eight Shoal Cave pickups |
| FireRed/LeafGreen | `frlg` | 64 | 61 hidden pickups, Selphy, and two size judges |
| Emerald | `emerald` | 104 | 88 berry plots, eight daily berry gifts, and eight Shoal Cave pickups |

The target counts follow one boundary: a resource is a free, location-bound item pickup or event reward that the player can obtain repeatedly. A resource has no checklist state. Shops, currency or item exchanges, crafting services, multiplayer activities, global delivery systems, repeatable Pokémon encounters, and OT-ID lotteries are outside this model.

Crystal's repeatable phone gifts are not resources because the renewable item is not the checklist goal. Registering the trainer after battle enables the event, so each eligible trainer has one coordinate-bearing `Event` checklist entry named `Register [trainer]`. The possible gifts are not checklist items or resource pools.

This audit uses these source revisions:

- [`pret/pokered` at `0cd19d3`](https://github.com/pret/pokered/tree/0cd19d3b877b7dc66d12c7050bed9a7f38154d4b)
- [`pret/pokeyellow` at `e6ba569`](https://github.com/pret/pokeyellow/tree/e6ba56989b0f2694f393e6924820be11dcc1fbb8)
- [`pret/pokegold` at `656583c`](https://github.com/pret/pokegold/tree/656583c939d30f920a316177311a502dd222b57c)
- [`pret/pokecrystal` at `7a7881d`](https://github.com/pret/pokecrystal/tree/7a7881d0d62e0ddbd82dcf10e7116807487ac651)
- [`pret/pokeruby` at `63a8cbf`](https://github.com/pret/pokeruby/tree/63a8cbf0016b351a4e68f7036fa0b77e23d2f2c1)
- [`pret/pokefirered` at `c75f352`](https://github.com/pret/pokefirered/tree/c75f352304d529f6ba92d4f74b9cf8b5c3810788)
- [`pret/pokeemerald` at `201378b`](https://github.com/pret/pokeemerald/tree/201378bdc09692df7ba3530c9fe68b4c8efe1c00)

## Resource inventory

Each row below represents one marker, except the fruit-tree and renewable-hidden-item rows.

| Package | Map and coordinate | Resource | Renewal rule | Output |
| --- | --- | --- | --- | --- |
| Gold/Silver and Crystal | 30 tree coordinates | Fruit trees | Daily reset | One fixed Berry or Apricorn per tree |
| Gold/Silver and Crystal | Mt. Moon Square `(7, 7)` | Moon Stone | Clefairy dance each Monday night | Moon Stone x1 |
| Gold/Silver and Crystal | Route 36 National Park Gate `(0, 3)` | Bug-Catching Contest prize | One contest each Tuesday, Thursday, and Saturday | Sun Stone, Everstone, Gold Berry, or Berry x1, based on rank |
| Gold/Silver | Goldenrod Dept. Store 5F `(7, 5)` | Sunday TM reward | Once each Sunday | TM27 - Return or TM21 - Frustration x1, based on lead Pokémon happiness |
| Crystal | Goldenrod Dept. Store 5F `(7, 5)` | Sunday TM reward | Once each Sunday | TM27 - Return or TM21 - Frustration x1, based on lead Pokémon happiness |
| Gold/Silver | Lake of Rage Magikarp House `(2, 3)` | Ether | Every new personal Magikarp length record | Ether x1 |
| Crystal | Lake of Rage Magikarp House `(2, 3)` | Elixer | Every new personal Magikarp length record | Elixer x1 |
| Crystal | Battle Tower 1F `(7, 6)` | Battle Tower prize | Every completed seven-win challenge | Five of one selected vitamin |
| Ruby/Sapphire and Emerald | 88 coordinates | Berry plots | Replantable growth cycle | The currently planted berry; 80 plots begin seeded |
| Ruby/Sapphire and Emerald | Eight NPC coordinates | Berry gifts | Daily reset | One or two fixed, random, or condition-selected berries |
| Ruby/Sapphire and Emerald | Eight Shoal Cave coordinates | Shoal Salt or Shoal Shell | Tide cycle resets collected pickup flags | One fixed item per coordinate |
| FireRed/LeafGreen | 61 coordinates on 15 maps | Renewable hidden items | 1,500 steps followed by an eligible map entry | One fixed item at each possible location, subject to the map's reroll tier |
| FireRed/LeafGreen | Resort Gorgeous House `(4, 4)` | Selphy's reward | Every completed Pokémon request | One item selected from Selphy's pool |
| FireRed/LeafGreen | Route 12 Fishing House `(4, 4)` | Net Ball | Every new personal Magikarp size record | Net Ball x1 |
| FireRed/LeafGreen | Water Path House 1 `(3, 4)` | Nest Ball | Every new personal Heracross size record | Nest Ball x1 |

Gold/Silver therefore has 34 resources, Crystal has 35, Ruby/Sapphire and Emerald each have 104, and FireRed/LeafGreen has 64.

## Red/Blue and Yellow

Red, Blue, and Yellow have no qualifying renewable item source. Their visible items, hidden items, and free NPC gifts use persistent acquisition state. Their repeatable item sources are transactions rather than world resources.

The hidden-item handlers refuse an already collected flag and set that flag after a successful pickup ([Red/Blue handler](https://github.com/pret/pokered/blob/0cd19d3b877b7dc66d12c7050bed9a7f38154d4b/engine/events/hidden_items.asm#L1-L39), [Yellow handler](https://github.com/pret/pokeyellow/blob/e6ba56989b0f2694f393e6924820be11dcc1fbb8/engine/events/hidden_items.asm#L1-L44)). Visible item balls disappear after collection in both games ([Red/Blue item balls](https://github.com/pret/pokered/blob/0cd19d3b877b7dc66d12c7050bed9a7f38154d4b/engine/events/pick_up_item.asm#L1-L45), [Yellow item balls](https://github.com/pret/pokeyellow/blob/e6ba56989b0f2694f393e6924820be11dcc1fbb8/engine/events/pick_up_item.asm#L1-L45)). No source path restores either type.

Vending machines and Game Corner counters require money or coins, so their repeatability does not make them resources ([Red/Blue vending machine](https://github.com/pret/pokered/blob/0cd19d3b877b7dc66d12c7050bed9a7f38154d4b/engine/events/vending_machine.asm#L33-L75), [Red/Blue prize exchange](https://github.com/pret/pokered/blob/0cd19d3b877b7dc66d12c7050bed9a7f38154d4b/engine/events/prize_menu.asm#L181-L220)). Pay Day is a global battle mechanic rather than a location-bound item event.

The installed `rb` and `yellow` packages correctly contain zero resources.

## Gold/Silver

### Fruit trees

The package contains all 30 fruit-tree markers. The standard script gives the tree's fixed item and sets its picked flag. The daily reset clears all tree flags ([fruit-tree lifecycle](https://github.com/pret/pokegold/blob/656583c939d30f920a316177311a502dd222b57c/engine/events/fruit_trees.asm#L1-L69), [daily timer](https://github.com/pret/pokegold/blob/656583c939d30f920a316177311a502dd222b57c/engine/overworld/time.asm#L85-L97)).

### Four other resources

- The Monday-night Clefairy dance clears the Mt. Moon Square Moon Stone event, making the hidden pickup renewable each week ([dance and hidden item](https://github.com/pret/pokegold/blob/656583c939d30f920a316177311a502dd222b57c/maps/MountMoonSquare.asm#L17-L76)). The generator emits one fixed-output resource instead of a hidden checklist item.
- The Bug-Catching Contest is available once on Tuesday, Thursday, and Saturday. Rank determines Sun Stone, Everstone, Gold Berry, or Berry ([entry gate](https://github.com/pret/pokegold/blob/656583c939d30f920a316177311a502dd222b57c/maps/Route36NationalParkGate.asm#L45-L60), [award branches](https://github.com/pret/pokegold/blob/656583c939d30f920a316177311a502dd222b57c/engine/events/std_scripts.asm#L266-L369)). The generator emits one resource whose reward comments state the ranks.
- The Sunday receptionist gives TM27 - Return at happiness 150 or more and TM21 - Frustration below 50 ([happiness branches](https://github.com/pret/pokegold/blob/656583c939d30f920a316177311a502dd222b57c/maps/GoldenrodDeptStore5F.asm#L59-L102)). The guard is a daily-reset engine flag, so this is indefinitely repeatable on later Sundays. The generator emits one conditional resource instead of two checklist rewards.
- The Magikarp Length Rater gives an Ether each time the player beats the saved length record ([rater script](https://github.com/pret/pokegold/blob/656583c939d30f920a316177311a502dd222b57c/maps/LakeOfRageMagikarpHouse.asm#L9-L66), [record comparison](https://github.com/pret/pokegold/blob/656583c939d30f920a316177311a502dd222b57c/engine/events/magikarp.asm#L1-L56)). The generator emits a fixed-output resource whose comment explains the increasing record requirement.

The Lucky Number Show also refreshes weekly, but it is an OT-ID lottery and is intentionally excluded. This exclusion applies to equivalent lottery systems in later games. Gold/Silver phone trainers arrange rematches and swarms but do not give repeatable items.

## Crystal

Crystal retains the same 30 fruit trees and adds the same four resource types as Gold/Silver. Its Magikarp judge gives an Elixer instead of an Ether ([Crystal rater script](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/LakeOfRageMagikarpHouse.asm#L9-L66)). The Mt. Moon dance, contest, and Sunday TM scripts retain the same renewable structure ([Mt. Moon](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/MountMoonSquare.asm#L17-L76), [contest prizes](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/Route36NationalParkGate.asm#L240-L286), [Sunday TM](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/GoldenrodDeptStore5F.asm#L59-L99)).

Crystal also has a repeatable Battle Tower prize. Every completed seven-win challenge gives five copies of one vitamin. The five possible outcomes and their source-derived weights are documented in [Repeatable resource reward pools](repeatable-resource-reward-pools.md#crystal-battle-tower). The generator emits one resource at the receptionist instead of five checklist rewards.

### Phone registration checklist events

Ten Crystal phone contacts can repeatedly offer items after their phone registration has been enabled. The daily phone-item flags cover Beverly, Jose, Wade, Gina, Alan, Dana, Derek, Tully, Tiffany, and Wilton ([flag table](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/data/events/engine_flags.asm#L149-L170)). Wade and Wilton can select from several outcomes; the other contacts have fixed gifts. Those pools are not guide goals.

The generator replaces the possible gift checklist rows with ten `Event` checklist entries named `Register [trainer]`. Each entry uses the trainer object's coordinates. These entries represent defeating and registering the trainer, which is the one-time action that enables the renewable event. They remain checklist items and do not count toward Crystal's 35 resources.

Crystal's Lucky Number Show is excluded for the same reason as Gold/Silver's OT-ID lottery.

## Ruby/Sapphire and Emerald

Both Hoenn packages emit the same 104 location-bound renewable resources. The generators derive all 88 berry-tree coordinates from map object events and their initial state from the new-game berry assignments. Eight plots start empty. Eight daily NPC gifts use daily-reset flags, and eight Shoal Cave pickups return when the tide cycle resets their collection flags. See [Generation III Hoenn packages](gen3-hoenn-packages.md#renewable-resources) for the package boundary and representation rules.

The five one-time special-phrase rewards from the Berry Master's wife remain checklist items. Her later random daily fallback is one resource at the same NPC. The Berry Blender, Battle Point exchange, Lilycove lottery, Pickup, and multiplayer activities are excluded by the common resource boundary.

## FireRed/LeafGreen

The FireRed/LeafGreen generator emits 64 resources for both versions:

- The generator emits the 61 source-allowlisted renewable hidden items as resources. Their exact flags, maps, coordinates, reroll tiers, and 1,500-step lifecycle are documented in [FireRed and LeafGreen renewable hidden items](frlg-renewable-hidden-items.md).
- The generator emits Selphy's seven possible rewards as one weighted resource at `(4, 4)`. Her pool is documented in [Repeatable resource reward pools](repeatable-resource-reward-pools.md#comparison-with-selphy).
- The Route 12 judge is one fixed-output Net Ball resource. The judge awards another Net Ball whenever a submitted Magikarp beats the saved size record ([record branches and award](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/Route12_FishingHouse/scripts.inc#L30-L85)).
- The Water Path judge is one fixed-output Nest Ball resource. The judge awards another Nest Ball whenever a submitted Heracross beats the saved size record ([record branches and award](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/SixIsland_WaterPath_House1/scripts.inc#L7-L67)).

Do not include Pokemon Jump or Dodrio Berry Picking. Their Berry prizes require wireless multiplayer, which is outside the guide's resource scope. Do not include Trainer Tower prizes either. A challenge dataset records `receivedPrize`, and that state is cleared only when its dataset ID changes, not after each run ([prize guard](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/trainer_tower.c#L791-L817), [dataset reset](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/trainer_tower.c#L1043-L1052)). It is not an indefinitely renewable reward for a fixed challenge.

## Other exclusions and known parser false positives

Apply these exclusions consistently when adding later games:

- purchases, vending machines, Game Corner prizes, point shops, and item-for-item exchanges;
- crafting or conversion services such as Kurt's Apricorn Balls;
- multiplayer-only prizes and external distributions;
- global mechanics such as Pickup, Mystery Gift, Mom's purchases, wild held-item farming, and Pay Day;
- repeatable Pokémon encounters, which belong to encounter or special-Pokémon systems;
- OT-ID lotteries, including every later version of the Lucky Number or Pokémon Lotto system;
- scheduled but permanently claimed gifts, such as weekday siblings and the S.S. Aqua Metal Coat.

The generic Generation II event parser currently leaks transactions and duplicate award branches into checklist items. These defects and their correction requirements are tracked in [Known data issues](known-data-issues.md#generation-ii-event-extraction-includes-transactions). They must not become resources.

## Generator invariants

The current generators enforce these rules:

1. The resource contract supports optional resource and reward comments plus optional weighted or conditional reward outcomes.
2. Gold/Silver and Crystal generation asserts resource counts of 34 and 35.
3. Crystal generation replaces phone-gift outcomes with ten coordinate-bearing phone-registration checklist events.
4. FireRed/LeafGreen generation asserts 64 resource markers.
5. Red/Blue and Yellow generation retains zero resources.
6. Ruby/Sapphire and Emerald artifact tests assert 88 berry plots, eight daily berry gifts, and eight tide-reset pickups.

The generators derive membership and outcomes from source flags, tables, scripts, and map objects. Manual lists have exact count and absence assertions so a source update cannot silently change package behavior.

## Audit commands

These commands reproduce the installed-package counts and the broad source scans used during the audit:

```sh
for game in rb yellow gs crystal rs frlg emerald; do
  jq -r --arg game "$game" '[.areas[].items[]] as $items | [.areas[].resources[]?] as $resources | "\($game) items=\($items|length) resources=\($resources|length)"' \
    "PokemonFieldGuide/wwwroot/games/$game/data/fieldguide.json"
done
rg -n "giveitem|verbosegiveitem|hiddenitem|fruittree" /tmp/pokegold/maps /tmp/pokecrystal/maps --glob '*.asm'
rg -n "hidden_item|giveitem|receivedPrize" /tmp/pokefirered/data /tmp/pokefirered/src --glob '*.inc' --glob '*.json' --glob '*.c'
```
