# Package finalization

Package finalization turns one game adapter's draft into a checked game package. It gives every current and future adapter the same package contract without teaching the shared module how any source project stores maps, encounters, palettes, or scripts.

Before contraction, finalization follows directed entrance edges from every world placement and requires every draft area to be reachable. Adapters must omit unused, beta, debug, and inaccessible maps instead of relying on contraction to discard them. After contraction, package validation repeats the directed traversal over every retained area. This catches both source-graph gaps and disconnects introduced by contraction.

## Usage

A public generator command calls `generatePackage` once:

```js
import { generatePackage } from '../package-finalization/index.mjs';

await generatePackage({
  gameId: 'yellow',
  build: ({ definition, assets }) =>
    buildYellowDraft({ sourceRoot, definition, assets })
});
```

The build callback performs source-specific extraction, rendering, and audits. It returns draft areas, worlds, Pokédex entries, and Pokémon sprite associations in memory. Renderers write PNGs through the managed asset workspace. They never receive the installed package path.

A world placement can use a cropped version of its area map. In that case, set `markerOffsetX` and `markerOffsetY` to the crop origin in map coordinates. Package finalization checks the crop bounds and every visible marker.

The read-only command checks every installed package:

```js
import { checkPackages } from './package-finalization/index.mjs';

await checkPackages();
```

## Interface shape

The module exports three operations:

```js
generatePackage({ gameId, build, webRoot? })
checkPackages({ webRoot? })
formatPackageReport(report)
```

`webRoot` exists for temporary-directory tests. Routine callers omit it.

`generatePackage` and `checkPackages` return finalized package reports. Pass a report to `formatPackageReport` when a command needs a consistent count summary.

The interface does not expose catalog parsing, graph helpers, validation phases, asset pruning, serialization, staging paths, or replacement functions. Callers cannot skip or reorder those steps.

## Ownership

The game adapter owns facts that depend on one source or title:

- source paths and syntax;
- debug, prototype, and inaccessible-record exclusions;
- stable checklist ID construction;
- palette and rendering rules;
- fishing odds and acquisition rules;
- expected source counts and unavailable species.

Package finalization owns every package invariant:

- catalog paths and version IDs;
- unique area, checklist, world, and Pokédex IDs;
- deterministic encounter merging;
- empty entrance-chain contraction and explicit `includeInNavigation` retention;
- junction retention across relevant branches of unequal length;
- missing-target rejection;
- area reachability from world placements;
- directed draft and final graph reachability from world warps;
- interior navigation from world markers;
- cross-document references;
- exact map and sprite use;
- world crop and item, resource, and entrance marker bounds;
- final JSON serialization;
- staged checking and whole-package replacement.

The generated `data/package-manifest.json` contains runtime package facts that span the generated documents. Manifest format v2 records package-wide Pokémon sprite associations, optional per-version sprite associations, and area aliases. Package finalization validates the manifest before installation, and `GamePackageLoader` reads it with the other Game package documents.

The authoritative C# contracts in `PokemonFieldGuide.Shared` generate the JSON Schemas in `schemas/`. Package finalization validates staged documents against those schemas before it runs cross-document, graph, and asset checks. Run `just generate-schemas` after changing a serialized C# contract. `just check` fails when a committed schema is stale.

## Failure behavior

Generation creates a temporary package beside the installed package. The adapter writes assets only inside that temporary directory. Package finalization transforms the draft, removes unreferenced staged assets, writes all four data documents, and checks the result through the same contract used by `checkPackages`.

If any extraction, rendering, transformation, or package check fails, package finalization deletes the temporary directory and leaves the installed package unchanged. After a staged package passes, package finalization renames the installed package to a backup, promotes the staged directory, and removes the backup. If promotion fails, it restores the backup.

## Tests

`node --test tools/package-finalization.test.mjs` uses real temporary directories. The tests cover complete replacement, conditional encounter tables, per-version sprite retention, explicit empty-map navigation, unequal branch lengths, world-marker navigation, missing-target rejection, map and crop rejection, unused staged-asset removal, and preservation of an installed package after extraction or finalization fails. `just check` runs these tests before it checks the installed packages.

## Synthesis decision

Three interfaces were compared. A byte-buffer draft had the smallest call shape, but it kept every rendered image in memory and pressured runtime Pokédex data to expose build-only sprite names. A declarative adapter object supported broad variation, but it created a larger interface that future adapters would have to learn.

The selected design uses one build callback and a managed asset workspace. This keeps the normal caller to one operation, works with Sharp's file output, and prevents package paths from leaking into game adapters. A private manifest keeps build facts out of runtime models.

## Tradeoffs accepted

- We accept temporary local paths inside opaque asset references so Sharp can compose staged images.
- We load one manifest at build time and runtime so sprite and area-alias facts have one authority.
- We accept a portable backup-and-rename transaction instead of a platform-specific directory exchange.
- We rebuild the complete package so stale generated files cannot survive.

## Alternatives rejected

Public `load`, `transform`, `validate`, `write`, and `publish` operations would expose required ordering and let callers create partial packages. That interface would be shallow.

Letting adapters write directly into a supplied package directory would leak layout, pruning, and lifecycle rules across the seam. Returning every PNG as a buffer would simplify filesystem ownership but make renderers hold all package assets in memory.
