# Package finalization

Package finalization turns one game adapter's draft into a checked game package. It gives every current and future adapter the same package contract without teaching the shared module how any source project stores maps, encounters, palettes, or scripts.

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

The build callback performs source-specific extraction, rendering, and audits. It returns draft areas, worlds, Pokédex entries, Pokémon sprite associations, and embedded-icon declarations in memory. Renderers write PNGs through the managed asset workspace. They never receive the installed package path.

A world placement can use a cropped version of its area map. In that case, set `markerOffsetX` and `markerOffsetY` to the crop origin in map coordinates. Package finalization checks the crop bounds and every visible marker.

The read-only command checks every installed package:

```js
import { checkPackages } from './package-finalization/index.mjs';

await checkPackages();
```

## Interface shape

The module exports two operations:

```js
generatePackage({ gameId, build, webRoot? })
checkPackages({ webRoot? })
```

`webRoot` exists for temporary-directory tests. Routine callers omit it.

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
- empty entrance-chain contraction;
- junction retention across relevant branches of unequal length;
- missing-target rejection;
- area reachability from world placements;
- relevant-interior navigation from world markers;
- cross-document references;
- exact map and sprite use;
- world crop and marker bounds;
- final JSON serialization;
- staged checking and whole-package replacement.

The generated `data/package-manifest.json` contains build-only facts that runtime JSON does not need. These facts include Pokémon sprite associations, embedded icons, area aliases needed by installed legacy output, and encounter methods that represent independent chances instead of a 100 percent table.

## Failure behavior

Generation creates a temporary package beside the installed package. The adapter writes assets only inside that temporary directory. Package finalization transforms the draft, removes unreferenced staged assets, writes all four data documents, and checks the result through the same contract used by `checkPackages`.

If any extraction, rendering, transformation, or package check fails, package finalization deletes the temporary directory and leaves the installed package unchanged. After a staged package passes, package finalization renames the installed package to a backup, promotes the staged directory, and removes the backup. If promotion fails, it restores the backup.

## Tests

`node --test tools/package-finalization.test.mjs` uses real temporary directories. The tests cover complete replacement, unequal branch lengths, world-marker navigation, missing-target rejection, map and crop rejection, unused staged-asset removal, and preservation of an installed package after extraction or finalization fails. `just check` runs these tests before it checks the three committed packages.

## Synthesis decision

Three interfaces were compared. A byte-buffer draft had the smallest call shape, but it kept every rendered image in memory and pressured runtime Pokédex data to expose build-only sprite names. A declarative adapter object supported broad variation, but it created a larger interface that future adapters would have to learn.

The selected design uses one build callback and a managed asset workspace. This keeps the normal caller to one operation, works with Sharp's file output, and prevents package paths from leaking into game adapters. A private manifest keeps build facts out of runtime models.

## Tradeoffs accepted

- We accept temporary local paths inside opaque asset references so Sharp can compose staged images.
- We accept a build-only manifest so the read-only checker can verify exact Pokémon sprite use without game-ID branches.
- We accept a portable backup-and-rename transaction instead of a platform-specific directory exchange.
- We rebuild the complete package so stale generated files cannot survive.

## Alternatives rejected

Public `load`, `transform`, `validate`, `write`, and `publish` operations would expose required ordering and let callers create partial packages. That interface would be shallow.

Letting adapters write directly into a supplied package directory would leak layout, pruning, and lifecycle rules across the seam. Returning every PNG as a buffer would simplify filesystem ownership but make renderers hold all package assets in memory.
