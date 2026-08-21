# Equivalent encounter table presentation

## Problem

Game packages preserve separate encounter tables for each source condition. Generation II often defines identical morning, day, and night tables. Rendering each condition separately adds UI categories without adding information. Gold and Silver can have different table equivalence, so the selected version must determine which categories collapse.

## Usage

UI callers continue to request groups through `GamePackage.EncounterGroups(area, versionId)`.

```csharp
var groups = gamePackage.EncounterGroups(area, activeVersionId);
```

Three identical time tables produce `Random encounters`. Equal morning and day tables produce `Random encounters · Morning / Day`. A different night table remains `Random encounters · Night`.

## Shape

`GamePackage.EncounterGroups` filters encounters for the active version before it compares tables. A private condition parser recognizes only trailing combinations of `Morning`, `Day`, and `Night`. It preserves prefixes such as `Swarm` and leaves conditions such as `Common trees` unchanged.

Table comparison ignores source order, `Condition`, and `Version`. It compares the species ID, the method, the level range, the chance, and duplicate row counts. An equal set keeps one representative table so displayed chances remain correct.

The public `EncounterGroup` type and both UI callers remain unchanged. `Encounter.Condition` preserves the source table dimension in the package contract. `GamePackage.EncounterGroups` hides the comparison and label rules behind its existing interface.

## Synthesis decision

Runtime presentation won over generator-time normalization. Runtime presentation handles each selected version independently and applies to every game package. Generator-time normalization would need to expand `Both` rows by version, collapse them, and compact them again.

## Tradeoffs accepted

- We accept a small comparison during UI grouping in exchange for preserving source tables in package data.
- We accept private parsing of the current condition strings in exchange for keeping time-label semantics out of package finalization.

## Alternatives considered

The Generation II adapter could rewrite equivalent conditions before package finalization. That approach keeps the runtime simpler, but it duplicates version handling and does not help other packages.

Package finalization could normalize every package. The package contract treats `condition` as an opaque string, so finalization does not own the meaning of time suffixes.

## Open questions and risks

- Do future packages need structured condition dimensions instead of display strings? The current change does not require them.

## Verification

`GamePackageTests` covers fully equal tables, equal subsets, unequal tables, prefixed conditions, precombined time labels, and version-specific equivalence. Run `just check` after changing encounter grouping.
