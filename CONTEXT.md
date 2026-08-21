# Pokemon Field Guide

Pokemon Field Guide turns data from several Pokemon games into one atlas and completion guide while keeping each game's progress independent.

## Language

**Game package**:
The metadata, guide data, maps, sprites, and exceptional rules shared by one game family. A package can contain multiple game versions, but each version keeps separate progress.
_Avoid_: Game bundle, title package

**Game adapter**:
The package-owned knowledge that reads one game's source formats and produces draft package data. It contains only behavior specific to that game's source.
_Avoid_: Game generator, source parser

**Package finalization**:
The game-neutral process that turns draft package data into a release-ready game package. It applies the package contract consistently across every game adapter.
_Avoid_: Package cleanup, post-processing

**Package invariant**:
A rule that every game package must satisfy regardless of its source. Source-specific facts and audits are not package invariants and remain with the game adapter.
_Avoid_: Shared rule, global rule

**Area checklist**:
The unique Pokemon species available through encounters or special acquisitions in one area and game version, together with the items found there. A species appears once regardless of how many ways it can be acquired.
_Avoid_: Area completion, location checklist
