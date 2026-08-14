# Agent guide

This repository contains a static Blazor WebAssembly field guide for Pokémon FireRed and LeafGreen. Preserve the interactive-map design and the accuracy of decomp-derived data.

## Essential commands

Run commands from the repository root unless noted otherwise.

```sh
dotnet build frle_fieldguide/frle_fieldguide.csproj
dotnet run --project frle_fieldguide/frle_fieldguide.csproj
```

Always run the build after changing Razor, C#, JavaScript, CSS, generated JSON, or deployment configuration.

Keep commits small, focused, and independently revertible. Separate unrelated data, behavior, styling, deployment, and documentation changes into distinct commits; do not bundle the entire working tree into one catch-all commit.

## Architecture

- `frle_fieldguide/Pages/Home.razor` contains most UI and application behavior.
- `frle_fieldguide/wwwroot/index.html` contains startup appearance, local-storage helpers, and map pan/zoom interop.
- `frle_fieldguide/wwwroot/css/app.css` contains global, theme, atlas, modal, and responsive styling.
- `frle_fieldguide/Models/FieldGuideData.cs` defines both generated JSON models and persisted progress.
- `tools/generate-fieldguide.mjs` is the source of truth for `fieldguide.json` and `pokedex.json`.
- `tools/render-maps.mjs` renders individual layouts, connected world canvases, and `worlds.json` from a `pret/pokefirered` checkout.

## Data and asset rules

- Do not hand-edit generated JSON when the correction belongs in a generator. Update the generator and regenerate the output.
- Preserve stable checklist IDs. Changing item or special-Pokémon IDs can silently invalidate users' saved progress.
- Collection state is intentionally separate for FireRed and LeafGreen. Appearance and Pokédex view preferences are shared settings.
- Keep all 386 Generation III species in the National Pokédex. The Normal Pokédex is the 151-species Kanto Dex.
- Availability labels distinguish normal single-player acquisition, event distribution, and trade/transfer requirements.
- Preserve starter-dependent roaming-beast encounters and event-script static encounters when changing extraction logic.
- Exclude prototype, unused, and multiplayer/link-room maps from generated guide data, and do not emit entrances whose destination was excluded.
- Use menu Pokémon sprites and bag item icons where available. Retain the question-mark fallback for missing assets.
- Unown's checked-in menu sheet does not provide the expected standalone asset; `PokemonIcon` deliberately embeds the Unown A sprite fallback.
- Map images use native 16-pixel metatiles and pixelated rendering. Avoid browser smoothing or arbitrary resampling.
- Markers and hotspots must not appear before their base map image is loaded.

## Interaction expectations

- Outdoor areas form connected, pannable, zoomable world maps rather than separate route cards.
- Empty transition maps should resolve to the nearest relevant interior, but ordinary gates into another outdoor zone should not create redundant interior markers.
- Interior groups must remain reachable and pannable/zoomable.
- Dragging must work over area hotspots and must not trigger native image dragging or leave pointer capture stuck.
- Marker screen size should remain usable across zoom levels.
- Natural sorting is required: `Route 3` precedes `Route 20`.
- Encounter order is Random, Surfing, fishing by Old/Good/Super Rod, Roaming, Rock Smash, Static, then Event/Gift/Trade.
- Item order is Visible, Hidden, then Event.
- Dark mode is the default. Controls must remain legible in both themes, and the active game's accent color must be respected.
- At narrow viewport widths, the document must not scroll horizontally and the atlas must retain usable vertical space below the responsive header.
- Resetting progress clears both games' checklist state but preserves game, theme, and Pokédex-mode preferences.

## Regeneration

With a compatible `pret/pokefirered` checkout:

```sh
node tools/generate-fieldguide.mjs /path/to/pokefirered frle_fieldguide/wwwroot/data/fieldguide.json
node tools/render-maps.mjs /path/to/pokefirered frle_fieldguide/wwwroot/maps
```

`render-maps.mjs` requires `sharp`. Generated assets are committed because the deployed site must not depend on a ROM or a decomp checkout.

## Scope and safety

- Do not add or request a ROM; the decompilation contains the required source data and assets.
- Do not remove generated maps or sprites merely because they are not referenced by the currently selected area.
- Do not reset, rename, or migrate the local-storage key without an explicit compatibility plan.
- Keep GitHub Pages base-path behavior intact for both `index.html` and `service-worker.published.js` when editing startup files or the deployment workflow.
