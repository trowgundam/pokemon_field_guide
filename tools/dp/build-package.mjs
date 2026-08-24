import fs from 'node:fs/promises';
import path from 'node:path';

import { attachRenderedAreaMaps, buildLayeredWorldFromRender, sinnohRockRoofDecorations } from '../gen4/layered-world.mjs';
import { dpExcludedMap, buildDpSource } from './source.mjs';
import { fileSlug } from '../gen4/display-names.mjs';
import { createGen4FallbackSprite, decodeGen4IndexedItemSprite, normalizeGen4ItemSprite, normalizeGen4PokemonSprite } from '../gen4/image-assets.mjs';
import { promoteCollidingEntrancesToTransports } from '../gen4/navigation.mjs';

const relevant = area => area.includeInNavigation === true || area.encounters.length + area.items.length + area.resources.length + area.specialPokemon.length + area.transports.length > 0;
const worldLayout = Object.fromEntries([
  'MAP_ACUITY_LAKEFRONT', 'MAP_ROUTE_216', 'MAP_ROUTE_217', 'MAP_SNOWPOINT'
].map(id => [id, { cellZ: 2 }]));
const detachedWorldAreaIds = [
  'MAP_IRON_ISLAND_EXTERIOR', 'MAP_FULLMOON_ISLAND_EXTERIOR', 'MAP_NEWMOON_ISLAND_EXTERIOR'
];
const worldLayerOrderOverrides = [
  { background: 'MAP_ROUTE_212_NORTH', foreground: 'MAP_HEARTHOME' }
];

export function addDpNavigation(work) {
  for (const areaId of detachedWorldAreaIds) work.areas.get(areaId).includeInNavigation = true;
  const canalave = work.areas.get('MAP_CANALAVE');
  canalave.transports.push({ id: `${canalave.id}:ferry`, name: 'Canalave ferry', x: 43, y: 725, destinations: [
    { id: 'iron-island', targetId: 'MAP_IRON_ISLAND_EXTERIOR', name: 'Iron Island', version: 'Both' },
    { id: 'fullmoon-island', targetId: 'MAP_FULLMOON_ISLAND_EXTERIOR', name: 'Fullmoon Island', version: 'Both', requirement: 'Lunar Wing story event' },
    { id: 'newmoon-island', targetId: 'MAP_NEWMOON_ISLAND_EXTERIOR', name: 'Newmoon Island', version: 'Both', requirement: 'Member Card event' }
  ] });
  const spearPillar = work.areas.get('MAP_MOUNT_CORONET_SPEAR_PILLAR');
  spearPillar.entrances.push({ id: `${spearPillar.id}:hall-of-origin`, targetId: 'MAP_HALL_OF_ORIGIN', name: 'Hall of Origin', x: 31, y: 28, version: 'Both' });
  const lighthouseElevator = work.areas.get('MAP_SUNYSHORE_VISTA_LIGHTHOUSE_ELEVATOR');
  lighthouseElevator.entrances.push({ id: `${lighthouseElevator.id}:observation-deck`, targetId: 'MAP_SUNYSHORE_VISTA_LIGHTHOUSE_OBSERVATION_DECK', name: 'Observation Deck', x: 6, y: 3, version: 'Both', showMarker: false });
  const hearthomeElevator = work.areas.get('MAP_HEARTHOME_SOUTHEAST_HOUSE_ELEVATOR');
  work.areas.get('MAP_HEARTHOME_SOUTHEAST_HOUSE_1F').includeInNavigation = true;
  hearthomeElevator.transports.push({ id: `${hearthomeElevator.id}:floors`, name: 'Elevator floors', x: 3, y: 6, destinations: [
    { id: 'first-floor', targetId: 'MAP_HEARTHOME_SOUTHEAST_HOUSE_1F', name: '1F', version: 'Both' },
    { id: 'second-floor', targetId: 'MAP_HEARTHOME_SOUTHEAST_HOUSE_2F', name: '2F', version: 'Both' }
  ] });
  const marshEntrance = work.areas.get('MAP_GREAT_MARSH_AREA_6');
  const marshAreas = [...work.areas.values()].filter(area => area.id.startsWith('MAP_GREAT_MARSH_AREA_') && relevant(area));
  marshEntrance?.entrances.push(...marshAreas.filter(area => area !== marshEntrance).map((area, index) => ({ id: `${marshEntrance.id}:connected-area:${index}`, targetId: area.id, name: area.name, x: 68, y: 116, version: 'Both', showMarker: false })));
  const turnbackEntrance = work.areas.get('MAP_TURNBACK_CAVE_ENTRANCE');
  const turnbackRooms = [...work.areas.values()].filter(area => area.id.startsWith('MAP_TURNBACK_CAVE_') && relevant(area));
  turnbackEntrance.entrances.push(...turnbackRooms.filter(area => area !== turnbackEntrance).map((area, index) => ({ id: `${turnbackEntrance.id}:dynamic-room:${index}`, targetId: area.id, name: area.name, x: 11, y: 1, version: 'Both', showMarker: false })));
  promoteCollidingEntrancesToTransports(work.areas);
  for (const area of work.areas.values()) area.entrances = area.entrances.map(entrance =>
    work.areas.has(entrance.targetId) && !dpExcludedMap(entrance.targetId) ? entrance : { ...entrance, targetId: '' });
}

function reachableAreas(work, outdoorIds) {
  const reachable = new Set(), queue = [...outdoorIds];
  while (queue.length) {
    const id = queue.shift(); if (!id || reachable.has(id) || dpExcludedMap(id) || !work.areas.has(id)) continue;
    reachable.add(id); const area = work.areas.get(id);
    queue.push(...area.entrances.map(entrance => entrance.targetId));
    for (const transport of area.transports) queue.push(...transport.destinations.map(destination => destination.targetId));
    if (id.startsWith('MAP_GREAT_MARSH_AREA_')) queue.push(...[...work.areas.values()].filter(candidate => candidate.id.startsWith('MAP_GREAT_MARSH_AREA_') && relevant(candidate)).map(candidate => candidate.id));
    if (id.startsWith('MAP_TURNBACK_CAVE_')) queue.push(...[...work.areas.values()].filter(candidate => candidate.id.startsWith('MAP_TURNBACK_CAVE_') && relevant(candidate)).map(candidate => candidate.id));
  }
  return [...reachable].map(id => work.areas.get(id));
}

async function registerSprites(work, assets) {
  const fallbackPng = await createGen4FallbackSprite();
  const pokemonFallback = await assets.pokemonSprite('question_mark.png', target => fs.writeFile(target, fallbackPng));
  await assets.itemSprite('question_mark.png', target => fs.writeFile(target, fallbackPng));
  const pokemonSprites = {};
  for (const entry of work.pokedex) {
    const fileName = `${fileSlug(entry.speciesId)}.png`, spriteRoot = path.join(work.source, 'files/poketool/pokegra/pokegra');
    const candidates = [3, 2].map(offset => path.join(spriteRoot, `narc_${String(entry.number * 6 + offset).padStart(4, '0')}.png`));
    const sourceFile = await candidates.reduce(async (foundPromise, candidate) => (await foundPromise) ?? fs.access(candidate).then(() => candidate, () => null), Promise.resolve(null));
    if (!sourceFile) throw new Error(`No Diamond/Pearl front sprite exists for ${entry.speciesId}.`);
    pokemonSprites[entry.speciesId] = await assets.pokemonSprite(fileName, target => normalizeGen4PokemonSprite(sourceFile, target));
  }
  const itemSprites = new Map();
  for (const item of [...work.areas.values()].flatMap(area => area.items)) {
    const spriteKey = `${item.iconId}-${item.iconPaletteId}`;
    if (!itemSprites.has(spriteKey)) {
      const sourceRoot = path.join(work.source, 'files/itemtool/itemdata/item_icon');
      const graphicsName = `narc_${String(item.iconId).padStart(4, '0')}`;
      const paletteName = `narc_${String(item.iconPaletteId).padStart(4, '0')}`;
      const pngSource = path.join(sourceRoot, `${graphicsName}.png`);
      const pngExists = await fs.access(pngSource).then(() => true).catch(error => {
        if (error.code === 'ENOENT') return false;
        throw error;
      });
      const graphicsSource = path.join(sourceRoot, `${graphicsName}.NCGR`);
      const paletteSource = path.join(sourceRoot, `${paletteName}.NCLR`);
      const rawExists = await Promise.all([graphicsSource, paletteSource].map(sourceFile => fs.access(sourceFile)
        .then(() => true).catch(error => error.code === 'ENOENT' ? false : Promise.reject(error))))
        .then(results => results.every(Boolean));
      const catalogItem = [...work.items.values()].find(candidate => candidate.icon === item.iconId
        && candidate.iconPalette === item.iconPaletteId);
      const platinumSource = catalogItem
        ? path.join(work.platinumSource, 'res/items/icons', `${fileSlug(catalogItem.id)}.png`)
        : null;
      const platinumExists = platinumSource
        ? await fs.access(platinumSource).then(() => true).catch(error => error.code === 'ENOENT' ? false : Promise.reject(error))
        : false;
      itemSprites.set(spriteKey, await assets.itemSprite(`${spriteKey}.png`, target => pngExists
        ? normalizeGen4ItemSprite(pngSource, target)
        : rawExists ? decodeGen4IndexedItemSprite(graphicsSource, paletteSource, target)
          : platinumExists ? normalizeGen4ItemSprite(platinumSource, target) : fs.writeFile(target, fallbackPng)));
    }
    item.icon = itemSprites.get(spriteKey); delete item.iconId; delete item.iconPaletteId;
  }
  return { pokemonSprites, pokemonFallback };
}

export async function buildDpPackage({ source, platinumSource, renderedMaps, assets }) {
  if (!renderedMaps) throw new Error('Diamond/Pearl production generation requires rendered source maps.');
  const work = buildDpSource(source, platinumSource); addDpNavigation(work);
  const worldRender = await buildLayeredWorldFromRender({
    work, rendered: renderedMaps, assets, worldId: 'dp-sinnoh', worldName: 'Sinnoh', layout: worldLayout,
    detachedAreaIds: detachedWorldAreaIds, layerOrderOverrides: worldLayerOrderOverrides,
    decorativeLayerIds: sinnohRockRoofDecorations.map(decoration => decoration.id)
  });
  const areas = reachableAreas(work, worldRender.outdoorIds);
  await attachRenderedAreaMaps({
    areas, outdoorIds: worldRender.outdoorIds, detachedPlacements: worldRender.detachedPlacements,
    rendered: renderedMaps, assets
  });
  for (const area of areas) {
    area.mapImage ??= worldRender.overviewImage;
    delete area.mapMatrixId;
  }
  const { pokemonSprites, pokemonFallback } = await registerSprites(work, assets);
  const retained = new Set(areas.map(area => area.id));
  const unreachableRelevant = [...work.areas.values()].filter(area => relevant(area) && !retained.has(area.id) && !dpExcludedMap(area.id));
  if (unreachableRelevant.length) throw new Error(`Diamond/Pearl relevant areas are unreachable: ${unreachableRelevant.map(area => area.id).join(', ')}.`);
  return { source: 'pret/pokediamond', generated: new Date().toISOString().slice(0, 10), areas, worlds: { formatVersion: 2, worlds: [worldRender.world] }, pokedex: work.pokedex, pokemonSprites, pokemonFallback };
}
