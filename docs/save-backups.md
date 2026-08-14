# Save backup format

Portable backups let users move locally stored checklist progress between browsers and devices. They are distinct from the internal `SavedProgress` local-storage document so internal compatibility fields do not become part of the public interchange contract.

## Version policy

The current format version is `0`. It is explicitly pre-release and may change without migration support until the project owner declares the version `1` cutoff. After that cutoff, import code must continue to recognize every released format and migrate it forward; never reinterpret an existing format version in place.

Every document has both a format discriminator and an integer version:

```json
{
  "format": "pokemon-field-guide-backup",
  "formatVersion": 0,
  "exportedAt": "2026-08-14T12:00:00+00:00",
  "games": {}
}
```

Import rejects a different discriminator or an unsupported version instead of guessing its structure.

## Version 0 payload

`games` is keyed by stable package ID. Each selected package contains its preferred game version and Pokédex mode plus a `profiles` object keyed by stable version ID:

```json
{
  "games": {
    "frlg": {
      "selectedVersion": "FireRed",
      "selectedDexMode": "Normal",
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

An export contains every version profile for each package selected by the user, including empty profiles. It does not contain the global theme or packages the user did not select.

## Import semantics

Import is package-scoped replacement, not a union:

- recognized packages in the file replace those packages' local profiles;
- packages absent from the file remain unchanged;
- unknown package IDs and unknown version IDs are ignored;
- valid selected-version and Pokédex-mode preferences are restored for imported packages;
- global preferences such as theme remain unchanged;
- a file is limited to 2 MB;
- the active package is reloaded after import so its selected version, accent, and checklist state update immediately.

When a future format is introduced, keep format detection separate from application of imported data. Add a version-specific reader or migration function, validate the complete input, and then apply the normalized current representation.
