# Known data issues

This page lists confirmed defects in installed generated packages. It describes current output, not desired behavior. Remove an entry only after the generator fix, regenerated packages, progress migration, tests, and documentation land together.

## Generation II event extraction includes transactions

The generic Generation II event extractor treats every literal `giveitem` or `verbosegiveitem` command in a map script as a checklist item. That rule also captures purchases, exchanges, and alternate branches of one award.

The installed `gs` and `crystal` packages contain these incorrect checklist rows:

- Fresh Water, Soda Pop, and Lemonade purchases from both the Goldenrod and Celadon department-store vending machines;
- TM purchases from both the Goldenrod and Celadon Game Corners;
- the Moomoo Milk purchase in the Route 39 Farmhouse;
- the Ragecandybar purchase in Mahogany Town; and
- two S.S. Aqua Metal Coat rows for alternate paths to the same one-time award.

The installed `gs` package also contains seven results from Kurt's Apricorn conversion service. Its two Lure Ball rows combine the legitimate one-time gift with one conversion result. Crystal uses `verbosegiveitemvar` for the conversion branches, so the current literal-command parser does not emit those seven Crystal rows.

These transactions must not contribute to checklist completion. The S.S. Aqua Metal Coat must remain as one checklist acquisition.

The source audit and exclusion rule are recorded in [Resource audit for all game packages](all-packages-resource-audit.md#other-exclusions-and-known-parser-false-positives). The incorrect rows are present in the committed `PokemonFieldGuide/wwwroot/games/gs/data/fieldguide.json` and `PokemonFieldGuide/wwwroot/games/crystal/data/fieldguide.json` files.

### Correction requirements

Treat the correction as a released checklist-identifier change:

1. Make the Generation II adapters distinguish purchases, conversions, and duplicate award branches from one-time gifts.
2. Regenerate both packages from compatible source checkouts.
3. Add exact assertions for every removed row and the retained one-time awards.
4. Increment the Gold, Silver, and Crystal `progressVersion` values.
5. Add and test sequential migrations that remove only the retired IDs while preserving unrelated and unknown progress.
6. Update or remove this entry after `just check` and representative backup migrations pass.
