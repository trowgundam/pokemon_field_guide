# Checklist backup format

Portable backups move selected Checklist profiles between browsers and devices. They do not contain theme, animation, game-selection, or Pokédex-mode preferences.

The Local guide state uses a separate browser-local document. Changes to one contract do not change the other contract's version.

## Version policy

New exports use backup format v2. Import accepts backup formats v1 and v2.

Every backup has a discriminator and an integer format version:

```json
{
  "format": "pokemon-field-guide-backup",
  "formatVersion": 2,
  "games": {}
}
```

Import rejects another discriminator or an unsupported version. It validates and migrates every recognized profile before it offers the import preview.

Backup v1 included `selectedVersion` and `selectedDexMode`. Import ignores both fields. They were preferences and should not have been part of the portable contract. This is a deliberate correction to the original v1 import behavior.

## Version 2 payload

`games` is keyed by stable Game package ID. Each package has Checklist profiles keyed by stable game-version ID:

```json
{
  "format": "pokemon-field-guide-backup",
  "formatVersion": 2,
  "games": {
    "frlg": {
      "profileVersions": {
        "FireRed": 2
      },
      "profiles": {
        "FireRed": {
          "caught": ["SPECIES_PIKACHU"],
          "collected": ["MAP_VIRIDIAN_CITY:item:0"],
          "completedSpecial": [
            {
              "id": "MAP_SAFFRON_CITY:Gift:SPECIES_HITMONLEE:Both",
              "speciesId": "SPECIES_HITMONLEE"
            }
          ]
        }
      }
    }
  }
}
```

The export dialog presents each game version as one selectable Checklist profile. The document groups profiles by Game package to avoid repeating package metadata.

The exporter includes a selected profile when the profile is empty. Importing that profile clears matching local progress after the user confirms the replacement.

Backup v2 has no `exportedAt` field. The downloaded file's metadata records its creation time.

## Checklist profile versions

`profileVersions` records the schema version of every included Checklist profile. The target version comes from the matching catalog entry's `progressVersion`.

Checklist profile v2 separates direct caught marks from caught status implied by completed special acquisitions. Each new completed acquisition records its stable acquisition ID and species ID. The guide displays a species as caught when either condition is true:

- The profile contains a direct caught mark for the species.
- At least one completed special acquisition names the species.

The v1-to-v2 migration preserves every v1 `caught` entry as a direct mark. It preserves completed acquisition IDs without guessing their species. This conservative migration does not remove existing caught status.

Unknown checklist IDs remain in a profile. Only a sequential Game package migration may rename or remove an ID.

## Import behavior

Import has two steps. The guide first validates the file and lists every recognized Checklist profile. The user then selects which profiles to apply.

Each preview row states whether import adds, replaces, or clears local progress. Import applies the selected rows in one browser-storage write. If the write fails, the displayed state does not change.

Import follows these rules:

- A selected profile replaces the matching local profile.
- An unselected or absent profile remains unchanged.
- An empty selected profile clears the matching local profile.
- Unknown package and version IDs are ignored.
- Preferences remain unchanged for both v1 and v2 files.
- A file cannot exceed 2 MB.

## Local guide state

The browser-local document remains envelope format v1 at storage key `frlg-field-guide-v1`. The historical key remains unchanged for compatibility.

Profiles use keys in the form `<package-id>:<version-id>`. Each profile has a matching entry in `profileVersions`. The Local guide state module reads raw browser text, validates the envelope, migrates installed profiles, and writes the complete document before it publishes a changed snapshot to the page.

If the document is malformed or unsupported, the guide does not overwrite it. The recovery screen can download the exact stored text as a `.txt` file. The user must explicitly delete the local data to start from defaults.

Normal reset is different from recovery deletion. Normal reset clears only the Checklist profiles selected by the user and preserves every preference.

## Required change procedure

Increment the version that owns the changed interpretation:

- Increment the backup format when the portable envelope or backup validation rules change.
- Increment only the affected catalog `progressVersion` when a Checklist profile's structure, identifier meaning, or interpretation changes.
- Increment the local envelope format when browser-local preferences or the envelope change independently of Checklist profiles.

Every increment requires sequential migration from the preceding supported version, tests for representative old data, validation before mutation, and updated examples in this document. Never discard unrelated Checklist profiles or preferences during migration.
