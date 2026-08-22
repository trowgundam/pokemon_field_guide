import fs from 'node:fs';
import path from 'node:path';

import { addFeebasEncounters, addHoennRenewableResources, addMassOutbreaks, readGen3Source } from '../gen3/source-data.mjs';
import { renderConnectedWorld, renderGen3Maps } from '../gen3/map-rendering.mjs';
import { addSpecial, extractScriptAcquisitions } from '../gen3/script-extraction.mjs';
import { buildPokedex, finishAreas, registerPokemonSprites, selectReachableAreas } from '../gen3/package-building.mjs';

const versions = [{ id: 'Emerald' }];
const outdoorTypes = new Set(['MAP_TYPE_TOWN', 'MAP_TYPE_CITY', 'MAP_TYPE_ROUTE', 'MAP_TYPE_OCEAN_ROUTE']);
const frontierMaps = new Set(['MAP_BATTLE_FRONTIER_OUTSIDE_WEST', 'MAP_BATTLE_FRONTIER_OUTSIDE_EAST']);
const excluded = /(?:SECRET_BASE|SINGLE_BATTLE_COLOSSEUM|TRADE_CENTER|RECORD_CORNER|UNION_ROOM|UNKNOWN_MAP|TEST|UNUSED|BATTLE_PIKE_ROOM_WILD_MONS|BATTLE_PYRAMID_FLOOR)/;

const requireArea = (work, id) => {
  const area = work.areas.get(id);
  if (!area) throw new Error(`Emerald requires ${id}.`);
  return area;
};

const addTransport = (area, id, name, x, y, destinations) =>
  area.transports.push({ id: `${area.id}:${id}`, name, x, y, destinations });

function addEmeraldTransports(work) {
  addTransport(requireArea(work, 'MAP_LILYCOVE_CITY_HARBOR'), 'ferry', 'S.S. Tidal', 8, 10, [
    { id: 'battle-frontier', targetId: 'MAP_BATTLE_FRONTIER_OUTSIDE_WEST', name: 'Battle Frontier', version: 'Both', requirement: 'Meet Scott aboard S.S. Tidal' },
    { id: 'southern-island', targetId: 'MAP_SOUTHERN_ISLAND_EXTERIOR', name: 'Southern Island', version: 'Both', requirement: 'Eon Ticket' },
    { id: 'navel-rock', targetId: 'MAP_NAVEL_ROCK_HARBOR', name: 'Navel Rock', version: 'Both', requirement: 'Mystic Ticket' },
    { id: 'birth-island', targetId: 'MAP_BIRTH_ISLAND_HARBOR', name: 'Birth Island', version: 'Both', requirement: 'Aurora Ticket' },
    { id: 'faraway-island', targetId: 'MAP_FARAWAY_ISLAND_ENTRANCE', name: 'Faraway Island', version: 'Both', requirement: 'Old Sea Map' }
  ]);
  addTransport(requireArea(work, 'MAP_SLATEPORT_CITY_HARBOR'), 'ferry', 'S.S. Tidal', 8, 10, [
    { id: 'battle-frontier', targetId: 'MAP_BATTLE_FRONTIER_OUTSIDE_WEST', name: 'Battle Frontier', version: 'Both', requirement: 'Meet Scott aboard S.S. Tidal' }
  ]);
  addTransport(requireArea(work, 'MAP_BATTLE_FRONTIER_OUTSIDE_WEST'), 'ferry', 'S.S. Tidal', 19, 68, [
    { id: 'slateport', targetId: 'MAP_SLATEPORT_CITY_HARBOR', name: 'Slateport City', version: 'Both', requirement: 'S.S. Ticket' },
    { id: 'lilycove', targetId: 'MAP_LILYCOVE_CITY_HARBOR', name: 'Lilycove City', version: 'Both', requirement: 'S.S. Ticket' }
  ]);
  for (const [mapId, x, y, requirement] of [
    ['MAP_SOUTHERN_ISLAND_EXTERIOR', 13, 23, 'Eon Ticket'],
    ['MAP_BIRTH_ISLAND_HARBOR', 8, 5, 'Aurora Ticket'],
    ['MAP_NAVEL_ROCK_HARBOR', 8, 5, 'Mystic Ticket'],
    ['MAP_FARAWAY_ISLAND_ENTRANCE', 13, 39, 'Old Sea Map']
  ]) addTransport(requireArea(work, mapId), 'return-ferry', 'Return ferry', x, y, [
    { id: 'lilycove', targetId: 'MAP_LILYCOVE_CITY_HARBOR', name: 'Lilycove City', version: 'Both', requirement }
  ]);
}

function addDynamicCaveEntrances(work) {
  for (const [mapId, x, y] of [
    ['MAP_ROUTE114', 7, 4], ['MAP_ROUTE114', 6, 46], ['MAP_ROUTE115', 21, 6], ['MAP_ROUTE115', 36, 10],
    ['MAP_ROUTE116', 59, 13], ['MAP_ROUTE116', 79, 6], ['MAP_ROUTE118', 42, 6], ['MAP_ROUTE118', 9, 6]
  ]) requireArea(work, mapId).entrances.push({
    id: `${mapId}:terra-cave:${x}:${y}`, targetId: 'MAP_TERRA_CAVE_ENTRANCE',
    name: 'Terra Cave (possible location)', x, y
  });
  requireArea(work, 'MAP_UNDERWATER_MARINE_CAVE').entrances.push({
    id: 'MAP_UNDERWATER_MARINE_CAVE:emerge', targetId: 'MAP_MARINE_CAVE_ENTRANCE',
    name: 'Marine Cave Entrance', x: 6, y: 7
  });
  requireArea(work, 'MAP_UNDERWATER_SEAFLOOR_CAVERN').entrances.push({
    id: 'MAP_UNDERWATER_SEAFLOOR_CAVERN:dive', targetId: 'MAP_SEAFLOOR_CAVERN_ENTRANCE',
    name: 'Seafloor Cavern Entrance', x: 6, y: 7
  });
}

function addEmeraldContent(work) {
  extractScriptAcquisitions(work);
  addFeebasEncounters(work);
  addMassOutbreaks(work);
  addHoennRenewableResources(work);
  addEmeraldTransports(work);
  addDynamicCaveEntrances(work);

  for (const species of ['TREECKO', 'TORCHIC', 'MUDKIP']) addSpecial(requireArea(work, 'MAP_ROUTE101'), `SPECIES_${species}`, 5);
  for (const species of ['LATIOS', 'LATIAS']) {
    addSpecial(requireArea(work, 'MAP_ROUTE110'), `SPECIES_${species}`, 40, 'Roaming');
  }
  for (const [mapId, species, requested] of [
    ['MAP_RUSTBORO_CITY_HOUSE1', 'SPECIES_SEEDOT', 'Ralts'],
    ['MAP_FORTREE_CITY_HOUSE1', 'SPECIES_PLUSLE', 'Volbeat'],
    ['MAP_PACIFIDLOG_TOWN_HOUSE3', 'SPECIES_HORSEA', 'Bagon'],
    ['MAP_BATTLE_FRONTIER_LOUNGE6', 'SPECIES_MEOWTH', 'Skitty']
  ]) addSpecial(requireArea(work, mapId), species, 0, 'Trade', 'Both', requested);
}

export async function buildEmeraldPackage({ source, assets, sharp }) {
  source = path.resolve(source);
  if (!fs.existsSync(path.join(source, 'data/layouts/layouts.json'))) throw new Error(`${source} is not a compatible pret/pokeemerald checkout.`);
  const work = readGen3Source({ source, versions });
  addEmeraldContent(work);
  requireArea(work, 'MAP_ROUTE130').mapLayout = 'LAYOUT_ROUTE130_MIRAGE_ISLAND';

  const includedMapIds = [...work.sourceMaps.keys()].filter(id => !excluded.test(id));
  const rendered = await renderGen3Maps({ source, assets, sharp,
    extraLayoutIds: ['LAYOUT_ROUTE130_MIRAGE_ISLAND'], includedMapIds });
  rendered.mapsById.get('MAP_ROUTE130').layout = 'LAYOUT_ROUTE130_MIRAGE_ISLAND';

  const hoennMapIds = [...work.sourceMaps.values()]
    .filter(map => outdoorTypes.has(map.map_type) && !frontierMaps.has(map.id) && !excluded.test(map.id))
    .map(map => map.id);
  const underwaterMapIds = [...work.sourceMaps.values()].filter(map => map.map_type === 'MAP_TYPE_UNDERWATER').map(map => map.id);
  const worlds = [
    await renderConnectedWorld(rendered, { id: 'emerald-hoenn', name: 'Hoenn', mapIds: hoennMapIds, rootId: 'MAP_LITTLEROOT_TOWN' }),
    await renderConnectedWorld(rendered, { id: 'emerald-underwater', name: 'Underwater', mapIds: underwaterMapIds, rootId: underwaterMapIds[0] }),
    await renderConnectedWorld(rendered, { id: 'emerald-battle-frontier', name: 'Battle Frontier', mapIds: [...frontierMaps], rootId: 'MAP_BATTLE_FRONTIER_OUTSIDE_WEST' })
  ];
  const areas = selectReachableAreas(work, worlds, excluded);
  finishAreas(work, areas, rendered.mapAssets);
  const pokedex = buildPokedex(work, areas);
  const { pokemonSprites, pokemonFallback } = await registerPokemonSprites(work, pokedex, assets, sharp, true);
  return {
    source: 'pret/pokeemerald', generated: new Date().toISOString().slice(0, 10),
    areas, worlds, pokedex, pokemonSprites, pokemonFallback
  };
}
