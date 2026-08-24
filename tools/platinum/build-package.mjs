import fs from 'node:fs/promises';
import path from 'node:path';

import { attachRenderedAreaMaps, buildLayeredWorldFromRender, sinnohRockRoofDecorations } from '../gen4/layered-world.mjs';
import { fileSlug } from '../gen4/display-names.mjs';
import { createGen4FallbackSprite, normalizeGen4ItemSprite, normalizeGen4PokemonSprite } from '../gen4/image-assets.mjs';
import { promoteCollidingEntrancesToTransports } from '../gen4/navigation.mjs';
import { buildPlatinumSource, platinumExcludedMap } from './source.mjs';

const relevant = area => area.includeInNavigation === true
  || area.encounters.length + area.items.length + area.resources.length + area.specialPokemon.length + area.transports.length > 0;
const worldLayout = Object.fromEntries([
  'MAP_HEADER_ACUITY_LAKEFRONT', 'MAP_HEADER_ROUTE_216', 'MAP_HEADER_ROUTE_217', 'MAP_HEADER_SNOWPOINT_CITY'
].map(id => [id, { cellZ: 2 }]));
const detachedWorldAreaIds = [
  'MAP_HEADER_IRON_ISLAND', 'MAP_HEADER_FULLMOON_ISLAND', 'MAP_HEADER_NEWMOON_ISLAND'
];
const worldLayerOrderOverrides = [
  { background: 'MAP_HEADER_ROUTE_206', foreground: 'MAP_HEADER_ETERNA_CITY' },
  { background: 'MAP_HEADER_ROUTE_212_NORTH', foreground: 'MAP_HEADER_HEARTHOME_CITY' }
];

export function addPlatinumNavigation(work) {
  for (const areaId of detachedWorldAreaIds) work.areas.get(areaId).includeInNavigation = true;
  const canalave = work.areas.get('MAP_HEADER_CANALAVE_CITY');
  canalave.transports.push({
    id: `${canalave.id}:ferry`, name: 'Canalave ferry', x: 43, y: 725,
    destinations: [
      { id: 'iron-island', targetId: 'MAP_HEADER_IRON_ISLAND', name: 'Iron Island', version: 'Both' },
      { id: 'fullmoon-island', targetId: 'MAP_HEADER_FULLMOON_ISLAND', name: 'Fullmoon Island', version: 'Both', requirement: 'Lunar Wing story event' },
      { id: 'newmoon-island', targetId: 'MAP_HEADER_NEWMOON_ISLAND', name: 'Newmoon Island', version: 'Both', requirement: 'Member Card event' }
    ]
  });
  const spearPillar = work.areas.get('MAP_HEADER_SPEAR_PILLAR');
  spearPillar.entrances.push({
    id: `${spearPillar.id}:distortion-world`, targetId: 'MAP_HEADER_DISTORTION_WORLD_GIRATINA_ROOM',
    name: 'Distortion World — Giratina Room', x: 31, y: 28, version: 'Both'
  });
  spearPillar.entrances.push({
    id: `${spearPillar.id}:hall-of-origin`, targetId: 'MAP_HEADER_HALL_OF_ORIGIN',
    name: 'Hall of Origin', x: 31, y: 28, version: 'Both'
  });
  const hearthomeElevator = work.areas.get('MAP_HEADER_HEARTHOME_CITY_SOUTHEAST_HOUSE_ELEVATOR');
  work.areas.get('MAP_HEADER_HEARTHOME_CITY_SOUTHEAST_HOUSE_1F').includeInNavigation = true;
  hearthomeElevator.transports.push({ id: `${hearthomeElevator.id}:floors`, name: 'Elevator floors', x: 3, y: 6, destinations: [
    { id: 'first-floor', targetId: 'MAP_HEADER_HEARTHOME_CITY_SOUTHEAST_HOUSE_1F', name: '1F', version: 'Both' },
    { id: 'second-floor', targetId: 'MAP_HEADER_HEARTHOME_CITY_SOUTHEAST_HOUSE_2F', name: '2F', version: 'Both' }
  ] });
  const marshGate = work.areas.get('MAP_HEADER_PASTORIA_CITY_OBSERVATORY_GATE_1F');
  marshGate.entrances.push({
    id: `${marshGate.id}:great-marsh`, targetId: 'MAP_HEADER_GREAT_MARSH_6',
    name: 'Great Marsh', x: 8, y: 5, version: 'Both'
  });
  const marshAreas = [...work.areas.values()].filter(area => area.id.startsWith('MAP_HEADER_GREAT_MARSH_') && relevant(area));
  const marshEntrance = work.areas.get('MAP_HEADER_GREAT_MARSH_6');
  marshEntrance.entrances.push(...marshAreas.filter(area => area !== marshEntrance).map((area, index) => ({
    id: `${marshEntrance.id}:connected-area:${index}`, targetId: area.id, name: area.name,
    x: 68, y: 116, version: 'Both', showMarker: false
  })));
  const turnbackEntrance = work.areas.get('MAP_HEADER_TURNBACK_CAVE_ENTRANCE');
  const turnbackRooms = [...work.areas.values()].filter(area => area.id.startsWith('MAP_HEADER_TURNBACK_CAVE_') && relevant(area));
  turnbackEntrance.entrances.push(...turnbackRooms.map((area, index) => ({
    id: `${turnbackEntrance.id}:dynamic-room:${index}`, targetId: area.id, name: area.name,
    x: 11, y: 1, version: 'Both', showMarker: false
  })));
  promoteCollidingEntrancesToTransports(work.areas);
  for (const area of work.areas.values()) area.entrances = area.entrances.map(entrance =>
    work.areas.has(entrance.targetId) && !platinumExcludedMap(entrance.targetId) ? entrance : { ...entrance, targetId: '' });
}

function reachableAreas(work, outdoorIds) {
  const reachable = new Set(), queue = [...outdoorIds];
  while (queue.length) {
    const id = queue.shift();
    if (!id || reachable.has(id) || platinumExcludedMap(id) || !work.areas.has(id)) continue;
    reachable.add(id);
    const area = work.areas.get(id);
    queue.push(...area.entrances.map(entrance => entrance.targetId));
    for (const transport of area.transports) queue.push(...transport.destinations.map(destination => destination.targetId));
    if (id.startsWith('MAP_HEADER_GREAT_MARSH_')) {
      queue.push(...[...work.areas.values()].filter(candidate => candidate.id.startsWith('MAP_HEADER_GREAT_MARSH_') && relevant(candidate)).map(candidate => candidate.id));
    }
    if (id.startsWith('MAP_HEADER_TURNBACK_CAVE_')) {
      queue.push(...[...work.areas.values()].filter(candidate => candidate.id.startsWith('MAP_HEADER_TURNBACK_CAVE_') && relevant(candidate)).map(candidate => candidate.id));
    }
  }
  const distortionRoom = 'MAP_HEADER_DISTORTION_WORLD_GIRATINA_ROOM';
  return [...reachable].filter(id => !id.includes('DISTORTION_WORLD') || id === distortionRoom).map(id => work.areas.get(id));
}

async function registerSprites(work, pokedex, assets) {
  const fallbackPng = await createGen4FallbackSprite();
  const pokemonFallback = await assets.pokemonSprite('question_mark.png', target => fs.writeFile(target, fallbackPng));
  await assets.itemSprite('question_mark.png', target => fs.writeFile(target, fallbackPng));
  const pokemonSprites = {};
  for (const entry of pokedex) {
    const fileName = `${fileSlug(entry.speciesId)}.png`;
    const spriteDirectory = path.join(work.source, 'res/pokemon', fileSlug(entry.speciesId));
    const candidates = ['male_front.png', 'female_front.png'];
    const sourceFile = await candidates.reduce(async (foundPromise, candidate) => {
      const found = await foundPromise;
      if (found) return found;
      const candidatePath = path.join(spriteDirectory, candidate);
      return fs.access(candidatePath).then(() => candidatePath, () => null);
    }, Promise.resolve(null));
    if (!sourceFile) throw new Error(`No front sprite exists for ${entry.speciesId}.`);
    pokemonSprites[entry.speciesId] = await assets.pokemonSprite(fileName, target => normalizeGen4PokemonSprite(sourceFile, target));
  }
  const itemSprites = new Map();
  for (const item of [...work.areas.values()].flatMap(area => area.items)) {
    if (!itemSprites.has(item.iconId)) {
      const sourceFile = path.join(work.source, 'res/items/icons', `${item.iconId}.png`);
      const sourceExists = await fs.access(sourceFile).then(() => true).catch(error => {
        if (error.code === 'ENOENT') return false;
        throw error;
      });
      itemSprites.set(item.iconId, await assets.itemSprite(`${item.iconId}.png`, target => sourceExists
        ? normalizeGen4ItemSprite(sourceFile, target)
        : fs.writeFile(target, fallbackPng)));
    }
    item.icon = itemSprites.get(item.iconId);
    delete item.iconId;
  }
  return { pokemonSprites, pokemonFallback };
}

export async function buildPlatinumPackage({ source, renderedMaps, assets }) {
  if (!renderedMaps) throw new Error('Platinum production generation requires rendered source maps.');
  const work = buildPlatinumSource(source);
  addPlatinumNavigation(work);
  const worldRender = await buildLayeredWorldFromRender({
    work, rendered: renderedMaps, assets, worldId: 'platinum-sinnoh', worldName: 'Sinnoh', layout: worldLayout,
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
  const { pokemonSprites, pokemonFallback } = await registerSprites(work, work.pokedex, assets);
  const retained = new Set(areas.map(area => area.id));
  const unreachableRelevant = [...work.areas.values()].filter(area => relevant(area) && !retained.has(area.id) && !platinumExcludedMap(area.id));
  if (unreachableRelevant.length) throw new Error(`Platinum relevant areas are unreachable: ${unreachableRelevant.map(area => area.id).join(', ')}.`);
  return {
    source: 'pret/pokeplatinum', generated: new Date().toISOString().slice(0, 10), areas,
    worlds: { formatVersion: 2, worlds: [worldRender.world] }, pokedex: work.pokedex,
    pokemonSprites, pokemonFallback
  };
}
