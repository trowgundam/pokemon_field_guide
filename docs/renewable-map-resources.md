# Renewable map resources

## Problem

Several games contain free, location-bound item sources that can be used repeatedly. Examples include daily fruit trees, weekly pickups, record-judge prizes, and repeatable challenge rewards. They need map markers, but they cannot behave like `GuideItem`: every guide item has checklist identity and contributes to completion. Treating a renewable source as an item would leak recurring activity into saved progress and backups.

## Usage

Package adapters put renewable pickups in `GuideArea.Resources`:

```json
{
  "name": "Blue Apricorn",
  "kind": "Daily fruit tree",
  "x": 16,
  "y": 5
}
```

The map renders each resource with a distinct marker and displays its `kind`. Search matches the resource name and kind. `GamePackage.AreaChecklist` continues to derive item IDs only from `GuideArea.Items`, so resources have no collected state and do not affect percentages.

## Shape

`GuideArea.Resources` is a list of `GuideMapResource`. A resource has a display name, kind, map coordinates, and an optional comment. The kind describes the source and renewal schedule, such as `Daily fruit tree`, `Weekly pickup`, or `Repeatable size record`. The comment explains requirements that apply to the whole interaction. A fixed-output resource uses the item name as its marker name. An interaction with multiple possible outputs uses one activity name and an optional reward list.

A resource deliberately has no checklist ID, icon, or version. The missing ID makes accidental persistence impossible. The package finalizer owns retention and coordinate validation, while the page owns the marker appearance. See [Repeatable resource reward pools](repeatable-resource-reward-pools.md) for weighted and condition-based outcomes.

The collection is optional in the wire contract and defaults to an empty list. Existing packages therefore remain valid while their generators are migrated. Finalization emits the collection for newly generated packages.

This is a small public type with a useful structural guarantee. It keeps the lifecycle rule in the data model instead of requiring renewable-kind checks in checklist, UI, state, and backup code. The UI must not infer a daily schedule from the collection itself.

## Synthesis decision

The selected design uses a dedicated resource collection. The other candidate replaced all item and entrance coordinates with a polymorphic marker collection that referenced guide content. That model would remove the existing negative-coordinate convention and unify overlays, but it would also require regenerating all five packages and validating new item and entrance references. The broader migration did not earn its cost for one non-checklist marker type.

## Tradeoffs accepted

- We accept separate item, entrance, and resource marker loops in exchange for a backward-compatible package change.
- We accept a purpose-built resource type in exchange for making renewable pickups impossible to save as collected.
- We use a CSS marker rather than an item asset, so resource markers do not create item-sprite ownership or pruning rules.

## Alternatives considered

- Reusing `GuideItem` with a `Renewable` kind lost because every missed conditional could add a renewable pickup to progress state.
- A discriminated `GuideArea.Markers` model was cleaner for every spatial overlay, but exposed reference resolution and forced a five-package migration.

## Generator guidance

Classify a source as a resource only when all of these statements are true:

- It gives a free item through a location-bound pickup or event.
- The same save can obtain the output repeatedly.
- The interaction has no permanent completion goal that belongs in the checklist.

Do not classify purchases, currency or item exchanges, crafting services, multiplayer-only prizes, global delivery mechanics, repeatable Pokémon encounters, or OT-ID lotteries as resources. A scheduled appearance alone does not prove renewability; confirm that the acquisition flag or counter resets. An activity whose reward becomes harder to repeat, such as beating a saved size record, still qualifies when the source permits another award.

Some renewable mechanics have a separate one-time enabling goal. Crystal phone gifts are the current example: registering the trainer belongs in `GuideArea.Items` as a coordinate-bearing `Event` checklist entry, while the later gift pool is not represented. Model the enabling action, not every renewable outcome.

Extract resources from authoritative source tables, flags, scripts, and map objects. Audit the complete source-defined set, emit the in-game item name for fixed outputs, and put the cadence or interaction type in `kind`. Use comments for requirements that are not clear from the marker name. Do not create checklist identity for the renewable output. If a later game introduces informational overlays outside this lifecycle, consider a broader discriminated marker model instead of stretching this collection.

The complete package audit and exclusion rationale are recorded in [Resource audit for all game packages](all-packages-resource-audit.md).
