# Save backup format

Portable backups let users move locally stored checklist progress between browsers and devices. They are distinct from the internal `SavedProgress` local-storage document so internal compatibility fields do not become part of the public interchange contract.

## Version policy

The backup format is finalized at version `1`, the first released and supported format. The earlier v0 development format is intentionally unsupported. From v1 onward, import code must continue to recognize every released format and migrate it forward; never reinterpret an existing format version in place.

Every document has both a format discriminator and an integer version:

```json
{
  "format": "pokemon-field-guide-backup",
  "formatVersion": 1,
  "exportedAt": "2026-08-14T12:00:00+00:00",
  "games": {}
}
```

Import rejects a different discriminator or an unsupported version instead of guessing its structure.

## Version 1 payload

`games` is keyed by stable package ID. Each selected package contains its preferred game version and Pokédex mode plus a `profiles` object keyed by stable version ID:

```json
{
  "games": {
    "frlg": {
      "selectedVersion": "FireRed",
      "selectedDexMode": "Normal",
      "profileVersions": {
        "FireRed": 1,
        "LeafGreen": 1
      },
      "profiles": {
        "FireRed": {
          "caught": ["SPECIES_PIKACHU"],
          "collected": ["MAP_VIRIDIAN_CITY:item:0"],
          "completedSpecial": []
        },
        "LeafGreen": {
          "caught": [],
          "collected": [],
          "completedSpecial": []
        }
      }
    }
  }
}
```

The export UI presents each version as an individual game. The serialized document still groups selected profiles beneath their shared package ID, so package metadata and assets are not duplicated. Selected profiles are included even when empty; unselected sibling versions, global preferences, and unselected packages are omitted.

`profileVersions` is keyed exactly like `profiles` and records the schema version of each included game. A v1 profile without a corresponding version is invalid. Backup format version and profile schema versions serve different purposes: the former versions the portable envelope, while the latter allows one game to migrate independently of its paired game or other installed packages.

## Local save format

The browser-local document uses a v1 envelope through `SavedProgress.FormatVersion`. Its `ProfileVersions` dictionary is keyed as `<package-id>:<version-id>` and records the schema version for each entry in `Profiles`. The target version comes from `GameVersionDefinition.ProgressVersion` in the package catalog.

Every stored profile must have a corresponding version. Newly created profiles are stamped with the catalog's current version. Unversioned data and any local envelope or profile newer than the running application are rejected rather than guessed at or silently downgraded.

## Import semantics

Import is profile-scoped replacement, not a union of checklist entries:

- recognized version profiles in the file replace the corresponding local profiles;
- sibling versions and packages absent from the file remain unchanged;
- unknown package IDs and unknown version IDs are ignored;
- valid selected-version and Pokédex-mode preferences are restored for imported packages;
- global preferences such as theme remain unchanged;
- a file is limited to 2 MB;
- the active package is reloaded after import so its selected version, accent, and checklist state update immediately.

## Required change procedure

Version numbers must be incremented when their serialized contract or interpretation changes:

- increment the backup `FormatVersion` when the portable envelope, package records, or validation semantics change;
- increment only the affected catalog `progressVersion` when that game's profile structure, identifier meaning, or checklist interpretation changes;
- increment the local `SavedProgress.FormatVersion` when the local envelope or global preference structure changes independently of profiles.

Every increment requires a sequential migration from each immediately preceding supported version, fixtures or tests covering old data, validation before mutation, and updated examples in this document. Never overwrite, reinterpret, or remove an already released version. Migrations must preserve unrelated packages and sibling-version profiles. If no safe automatic conversion exists, reject the data with a specific error instead of discarding progress.

When a future backup format is introduced, keep format detection separate from application of imported data. Add a version-specific reader or migration function, validate the complete input, and then apply the normalized current representation.
