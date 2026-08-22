# FireRed and LeafGreen package

FireRed and LeafGreen share the `frlg` package. Package finalization emits manifest format v3 so the package can represent transport markers and explicit record versions.

## Technical Machine names

The adapter reads the 50 `ITEM_TM##_MOVE` aliases from `include/constants/items.h`. It uses each alias to emit `TM## - Move`, such as `TM01 - Focus Punch`. The source audit fails unless all 50 aliases are present.

TM labels are display data. Checklist IDs remain based on the source map, acquisition kind, position, or script offset. A label correction does not change saved progress.

## Seagallop transport

The Seagallop Ferry marker in Vermilion City lists One Island through Seven Island. The first three destinations require the Tri-Pass. The remaining four require the Rainbow Pass. Navel Rock and Birth Island are also destinations with Mystic Ticket and Aurora Ticket requirements.

Each main-island harbor has a return ferry and the other main-island destinations. Navel Rock and Birth Island each have a return ferry to Vermilion City. Requirements are informational and do not create checklist entries.

The draft attaches island markers to the source harbor maps at the sailor coordinates. Package finalization promotes each marker through its empty harbor to the visible island map. This keeps harbor transition maps out of navigation while preserving source-derived marker placement.

## Verification

Regenerate the package and run its artifact test:

```sh
just generate-frlg /path/to/pokefirered
node --test tools/frlg/generated-package.test.mjs
```
