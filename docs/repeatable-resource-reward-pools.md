# Repeatable resource reward pools

This page preserves the source research for repeatable reward pools and records their current package representation.

## Conclusion

Crystal's Battle Tower is one renewable resource with a reward pool, not five overlapping map markers or five checklist items. A successful challenge awards five copies of one randomly selected vitamin. The same one-marker rule applies to conditional outcomes such as Bug-Catching Contest ranks and the Sunday happiness TMs.

The Battle Tower research uses `pret/pokecrystal` commit [`7a7881d`](https://github.com/pret/pokecrystal/tree/7a7881d0d62e0ddbd82dcf10e7116807487ac651) as its primary source. The repository builds the English Crystal 1.0, 1.1, and Australian ROMs from the same source ([supported builds](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/README.md#L3-L12)). The relevant scripts and constants have no revision conditions. The Battle Tower resource applies to Crystal, not Gold or Silver.

## Crystal Battle Tower

The player earns a reward after defeating seven Battle Tower trainers. `BATTLETOWER_STREAK_LENGTH` is 7, and the battle-room loop sends the player to the reward script when the win counter reaches that value ([streak constant](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/constants/battle_tower_constants.asm#L1-L2), [completion check](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTowerBattleRoom.asm#L20-L40), [reward handoff](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTowerBattleRoom.asm#L105-L112)).

The game selects the reward when the player starts a challenge, before the receptionist leads the player to the elevator. The selected item remains in `sBattleTowerReward`, so saving between battles does not reroll it ([challenge script](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTower1F.asm#L75-L118), [saved reward](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/engine/events/battle_tower/battle_tower.asm#L955-L976)).

The reward is repeatable per completed challenge. The active receptionist script has no daily or step gate. After the player receives a reward, a new challenge resets the seven-trainer counter and selects another reward ([new-challenge reset and selection](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTower1F.asm#L55-L99), [counter reset](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/engine/events/battle_tower/battle_tower.asm#L889-L904)). Crystal still contains text about a daily battle limit, but its script is marked unreferenced and the active explanation omits that rule ([unused limit script](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTower1F.asm#L222-L225), [active explanation](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTower1F.asm#L447-L456)).

Each outcome has quantity 5. The reward range starts at `HP_UP` and ends at `CALCIUM`, but the chooser rejects `LUCKY_PUNCH` between them ([reward constants](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/constants/battle_tower_constants.asm#L63-L67), [contiguous item IDs](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/constants/item_constants.asm#L34-L40), [reward chooser](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/engine/events/battle_tower/battle_tower.asm#L955-L976)). The resulting pool is:

| Item | Quantity | Selection weight | Probability |
| --- | ---: | ---: | ---: |
| HP Up | 5 | 2 | 2/7, about 28.57% |
| Protein | 5 | 2 | 2/7, about 28.57% |
| Iron | 5 | 1 | 1/7, about 14.29% |
| Carbos | 5 | 1 | 1/7, about 14.29% |
| Calcium | 5 | 1 | 1/7, about 14.29% |

These odds are not 20% each. `maskbits 6` keeps the low three random bits, which produces values 0 through 7. The chooser maps 6 back to 0 and 7 back to 1, then rejects value 4 because it names Lucky Punch. The seven accepted paths therefore give HP Up and Protein two paths each, and each other vitamin one path ([`maskbits` definition](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/macros/code.asm#L26-L43), [mapping and rejection](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/engine/events/battle_tower/battle_tower.asm#L955-L969)).

The reward script gives five copies of the selected item. If the bag cannot accept all five, the script leaves the reward pending and tells the player to make room ([award script](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTower1F.asm#L121-L139), [capacity check](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/engine/events/battle_tower/battle_tower.asm#L906-L933)).

## Marker location

Use one marker on `BATTLE_TOWER_1F` at the receptionist's coordinate, `(7, 6)`. The completion script returns the player to `(7, 7)` and awards the item through the receptionist flow. The receptionist object is the stable map location that represents both starting and collecting the challenge reward ([return position](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTowerBattleRoom.asm#L105-L112), [receptionist object](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTower1F.asm#L795-L813)).

Installed resource data:

- Name: `Battle Tower prize`
- Kind: `Repeatable seven-win challenge`
- Coordinate: `(7, 6)` on `BATTLE_TOWER_1F`
- Reward pool: the five outcomes above, each with quantity and integer weight

## Comparison with Selphy

Selphy and the Battle Tower have the same map-model shape: one repeatable interaction at one coordinate selects one item from a pool. Neither interaction has permanent completion state. Selphy's 250-step counter is a request deadline, while the Battle Tower's cadence is completion of seven battles ([Selphy timeout and resampling](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/field_specials.c#L661-L688), [Battle Tower completion check](https://github.com/pret/pokecrystal/blob/7a7881d0d62e0ddbd82dcf10e7116807487ac651/maps/BattleTowerBattleRoom.asm#L20-L40)).

Selphy's nominal pool is one Luxury Ball at 70%, or one of six deluxe items at 5% each. Her marker belongs at `(4, 4)` in `FiveIsland_ResortGorgeous_House` ([Selphy reward sampler](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/field_specials.c#L652-L659), [branch selection](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/field_specials.c#L711-L717), [Selphy object](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/data/maps/FiveIsland_ResortGorgeous_House/map.json#L17-L31)). The Battle Tower pool differs in both quantity and odds: every outcome gives five items, and the source's bit-mask mapping favors HP Up and Protein.

## Data-model consequence

A repeatable resource needs one marker and zero checklist IDs. It can also have a resource comment and a list of reward outcomes. Each outcome needs an item name and quantity. A random outcome has a selection weight. A condition-based outcome instead has a comment such as `First place` or `Lead Pokémon happiness is at least 150`.

The pool belongs to the interaction, not to separate coordinates. The same shape covers Selphy, the Battle Tower, the Bug-Catching Contest, and the Sunday TM event even though their renewal and selection rules differ.

Fixed outputs do not need a one-row pool. Use the item as the resource name and put shared qualification text in the resource comment. The Magikarp and Heracross judges therefore use `Ether`, `Elixer`, `Net Ball`, or `Nest Ball` as their marker name, with a comment such as `Awarded each time you beat your saved size record`.

## Package representation

The marker remains in `GuideArea.Resources`. `GuideMapResource.Comment` and `GuideMapResource.Rewards` hold optional interaction and outcome details. A resource without rewards has one fixed output named by the marker. A resource with rewards represents one repeatable interaction with several possible outcomes.

Selphy's package data uses one marker:

```json
{
	"name": "Selphy's reward",
	"kind": "Repeatable Pokémon request",
	"x": 4,
	"y": 4,
	"comment": "Complete Selphy's requested Pokémon showing before the 250-step deadline.",
	"rewards": [
		{ "name": "Luxury Ball", "quantity": 1, "weight": 70 },
		{ "name": "Big Pearl", "quantity": 1, "weight": 5 },
		{ "name": "Pearl", "quantity": 1, "weight": 5 },
		{ "name": "Stardust", "quantity": 1, "weight": 5 },
		{ "name": "Star Piece", "quantity": 1, "weight": 5 },
		{ "name": "Nugget", "quantity": 1, "weight": 5 },
		{ "name": "Rare Candy", "quantity": 1, "weight": 5 }
	]
}
```

The Battle Tower marker stores weights `2, 2, 1, 1, 1`. The UI divides each weight by the sum of all weights, then displays `28.57%` or `14.29%`. Package data does not store rounded percentages.

Condition-based pools omit weights. For example:

```json
{
	"name": "Sunday TM reward",
	"kind": "Weekly happiness reward",
	"x": 7,
	"y": 5,
	"comment": "Available once each Sunday.",
	"rewards": [
		{ "name": "TM Return", "quantity": 1, "comment": "Lead Pokémon happiness is at least 150." },
		{ "name": "TM Frustration", "quantity": 1, "comment": "Lead Pokémon happiness is below 50." }
	]
}
```

## Resource contract

```csharp
public sealed class GuideMapResource
{
	[JsonRequired, MinLength(1)] public string Name { get; set; } = "";
	[JsonRequired, MinLength(1)] public string Kind { get; set; } = "";
	[JsonRequired] public int X { get; set; }
	[JsonRequired] public int Y { get; set; }
	[MinLength(1)]
	public string? Comment { get; set; }
	public List<GuideResourceReward> Rewards { get; set; } = [];
}

public sealed class GuideResourceReward
{
	[JsonRequired, MinLength(1)] public string Name { get; set; } = "";
	[JsonRequired, Range(1, int.MaxValue)] public int Quantity { get; set; }
	[Range(1, int.MaxValue)] public int? Weight { get; set; }
	[MinLength(1)]
	public string? Comment { get; set; }
}
```

`Comment` and `Rewards` remain optional on the wire, and `Rewards` defaults to an empty list. Existing fruit trees, fixed weekly pickups, record prizes, and renewable hidden items need no reward rows because the resource name already identifies their fixed output.

The package finalizer rejects blank comments, empty reward names, nonpositive quantities, and nonpositive supplied weights. A pool cannot mix weighted and unweighted outcomes: every row has a weight for a random pool, or no row has a weight for a condition-based pool. Search matches resource comments, reward names, and reward comments. The resource detail view lists each reward's quantity and comment, plus a calculated percentage when the pool is weighted. Reward rows remain text-only and do not add item-sprite ownership or asset-pruning rules.

## Designs considered

The selected design extends `GuideMapResource` because all examples have the same lifecycle as existing resources. They are renewable, have one map coordinate, and have no checklist state. Optional comments and reward lists add the missing information without changing fixed-output records.

A separate `GuideArea.Activities` collection would distinguish interactions from pickups. It would also duplicate resource search, navigation retention, marker rendering, and checklist exclusion. The lifecycle does not justify another collection.

A polymorphic resource hierarchy would make fixed-output, weighted, and conditional variants explicit. It would require a discriminator on every resource and a migration of existing generated packages. The optional list keeps existing records valid while finalization enforces consistent weights within a pool.

Do not store a floating-point `chance` on each reward. Rounded values cannot represent Crystal's sevenths exactly, and sum validation needs a tolerance. Positive integer weights preserve random source tables and let the UI calculate percentages consistently. Do not invent weights for rank, happiness, score, or other conditional branches; describe those requirements in comments.
