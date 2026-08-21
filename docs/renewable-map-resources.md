# Renewable map resources

## Problem

Gold, Silver, and Crystal contain 30 fruit trees that yield a berry or Apricorn once per day. They need map markers, but they cannot behave like `GuideItem`: every guide item has checklist identity and contributes to completion. Treating a renewable pickup as an item would leak daily activity into saved progress and backups.

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

`GuideArea.Resources` is a list of `GuideMapResource`. A resource has a display name, kind, and map coordinates. The kind describes the source and renewal schedule, such as `Daily fruit tree`, `Weekly harvest`, or `Repeatable pickup`. It deliberately has no checklist ID, icon, quantity, or version. The missing ID makes accidental persistence impossible. The package finalizer owns retention and coordinate validation, while the page owns the marker appearance.

The collection is optional in the wire contract and defaults to an empty list. Existing Red/Blue, Yellow, and FireRed/LeafGreen packages therefore remain valid. Finalization emits the collection for newly generated packages.

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

Extract renewable resources from authoritative source tables and map objects. Audit the complete source-defined set, emit the in-game reward name, and put the cadence or interaction type in `kind`. Do not create checklist identity for a resource. If a later game introduces informational overlays that are not renewable resources, consider a broader discriminated marker model instead of stretching this collection beyond its lifecycle rule.
