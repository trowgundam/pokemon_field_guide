import fs from 'node:fs';
import path from 'node:path';

import { addFeebasEncounters, addHoennRenewableResources, addMassOutbreaks, readGen3Source } from '../gen3/source-data.mjs';
import { renderConnectedWorld, renderGen3Maps } from '../gen3/map-rendering.mjs';
import { addSpecial, extractScriptAcquisitions } from '../gen3/script-extraction.mjs';
import { buildPokedex, finishAreas, registerPokemonSprites, selectReachableAreas } from '../gen3/package-building.mjs';

const versions = [{ id: 'Ruby' }, { id: 'Sapphire' }];
const outdoorTypes = new Set(['MAP_TYPE_TOWN', 'MAP_TYPE_CITY', 'MAP_TYPE_ROUTE', 'MAP_TYPE_6']);
const hiddenWorldMaps = new Set(['MAP_BATTLE_TOWER_OUTSIDE']);
const excluded = /(?:SECRET_BASE|SINGLE_BATTLE_COLOSSEUM|TRADE_CENTER|RECORD_CORNER|UNION_ROOM|UNKNOWN_MAP|TEST|UNUSED)/;

const requireArea = (work, id) => {
  const area = work.areas.get(id);
  if (!area) throw new Error(`Ruby/Sapphire requires ${id}.`);
  return area;
};

function addTransport(area, id, name, x, y, destinations) {
  area.transports.push({ id: `${area.id}:${id}`, name, x, y, destinations });
}

function addRubySapphireContent(work) {
  extractScriptAcquisitions(work, { rubySapphire: true });
  addFeebasEncounters(work);
  addMassOutbreaks(work);
  addHoennRenewableResources(work);

  for (const species of ['TREECKO', 'TORCHIC', 'MUDKIP']) addSpecial(requireArea(work, 'MAP_ROUTE101'), `SPECIES_${species}`, 5);
  addSpecial(requireArea(work, 'MAP_CAVE_OF_ORIGIN_B4F'), 'SPECIES_GROUDON', 45, 'Static', 'Ruby');
  addSpecial(requireArea(work, 'MAP_CAVE_OF_ORIGIN_B4F'), 'SPECIES_KYOGRE', 45, 'Static', 'Sapphire');
  addSpecial(requireArea(work, 'MAP_SOUTHERN_ISLAND_INTERIOR'), 'SPECIES_LATIAS', 50, 'Static', 'Ruby');
  addSpecial(requireArea(work, 'MAP_SOUTHERN_ISLAND_INTERIOR'), 'SPECIES_LATIOS', 50, 'Static', 'Sapphire');
  addSpecial(requireArea(work, 'MAP_ROUTE110'), 'SPECIES_LATIOS', 40, 'Roaming', 'Ruby');
  addSpecial(requireArea(work, 'MAP_ROUTE110'), 'SPECIES_LATIAS', 40, 'Roaming', 'Sapphire');

  const summit = requireArea(work, 'MAP_MT_PYRE_SUMMIT');
  summit.items = summit.items.filter(item => item.name !== 'Red Or Blue Orb');
  summit.items.push(
    { id: `${summit.id}:event:RED_ORB:Ruby`, name: 'Red Orb', kind: 'Event', version: 'Ruby', icon: 'question_mark.png', x: -1, y: -1, quantity: 1 },
    { id: `${summit.id}:event:BLUE_ORB:Sapphire`, name: 'Blue Orb', kind: 'Event', version: 'Sapphire', icon: 'question_mark.png', x: -1, y: -1, quantity: 1 }
  );

  for (const [mapId, species, requested] of [
    ['MAP_RUSTBORO_CITY_HOUSE1', 'SPECIES_MAKUHITA', 'Slakoth'],
    ['MAP_FORTREE_CITY_HOUSE1', 'SPECIES_SKITTY', 'Pikachu'],
    ['MAP_PACIFIDLOG_TOWN_HOUSE3', 'SPECIES_CORSOLA', 'Bellossom']
  ]) addSpecial(requireArea(work, mapId), species, 0, 'Trade', 'Both', requested);

  for (const area of work.areas.values()) area.specialPokemon = area.specialPokemon
    .filter(pokemon => !['SPECIES_GROUDON_OR_KYOGRE', 'SPECIES_LATIAS_OR_LATIOS'].includes(pokemon.speciesId));

  const lilycove = requireArea(work, 'MAP_LILYCOVE_CITY_HARBOR');
  addTransport(lilycove, 'ferry', 'S.S. Tidal', 8, 10, [
    { id: 'battle-tower', targetId: 'MAP_BATTLE_TOWER_OUTSIDE', name: 'Battle Tower', version: 'Both', requirement: 'S.S. Ticket' },
    { id: 'southern-island', targetId: 'MAP_SOUTHERN_ISLAND_EXTERIOR', name: 'Southern Island', version: 'Both', requirement: 'Eon Ticket' }
  ]);
  addTransport(requireArea(work, 'MAP_SLATEPORT_CITY_HARBOR'), 'ferry', 'S.S. Tidal', 8, 10, [
    { id: 'battle-tower', targetId: 'MAP_BATTLE_TOWER_OUTSIDE', name: 'Battle Tower', version: 'Both', requirement: 'S.S. Ticket' }
  ]);
  addTransport(requireArea(work, 'MAP_BATTLE_TOWER_OUTSIDE'), 'ferry', 'S.S. Tidal', 19, 24, [
    { id: 'slateport', targetId: 'MAP_SLATEPORT_CITY_HARBOR', name: 'Slateport City', version: 'Both', requirement: 'S.S. Ticket' },
    { id: 'lilycove', targetId: 'MAP_LILYCOVE_CITY_HARBOR', name: 'Lilycove City', version: 'Both', requirement: 'S.S. Ticket' }
  ]);
  addTransport(requireArea(work, 'MAP_SOUTHERN_ISLAND_EXTERIOR'), 'ferry', 'S.S. Tidal', 13, 23, [
    { id: 'lilycove', targetId: 'MAP_LILYCOVE_CITY_HARBOR', name: 'Lilycove City', version: 'Both', requirement: 'Eon Ticket' }
  ]);
  requireArea(work, 'MAP_UNDERWATER_SEAFLOOR_CAVERN').entrances.push({
    id: 'MAP_UNDERWATER_SEAFLOOR_CAVERN:dive', targetId: 'MAP_SEAFLOOR_CAVERN_ENTRANCE',
    name: 'Seafloor Cavern Entrance', x: 6, y: 7
  });
}

export async function buildRubySapphirePackage({ source, assets, sharp }) {
  source = path.resolve(source);
  if (!fs.existsSync(path.join(source, 'data/layouts/layouts.json'))) throw new Error(`${source} is not a compatible pret/pokeruby checkout.`);
  const work = readGen3Source({ source, versions });
  addRubySapphireContent(work);

  const mirageLayout = 'LAYOUT_UNREFERENCED_MAP';
  requireArea(work, 'MAP_ROUTE130').mapLayout = mirageLayout;
  const includedMapIds = [...work.sourceMaps.keys()].filter(id => !excluded.test(id));
  const rendered = await renderGen3Maps({ source, assets, sharp, extraLayoutIds: [
    mirageLayout, 'LAYOUT_UNKNOWN_MAP_082FF894', 'LAYOUT_UNKNOWN_MAP_083041B4'
  ], includedMapIds });
  rendered.mapsById.get('MAP_ROUTE130').layout = mirageLayout;

  const hoennMapIds = [...work.sourceMaps.values()]
    .filter(map => outdoorTypes.has(map.map_type) && !hiddenWorldMaps.has(map.id) && !excluded.test(map.id))
    .map(map => map.id);
  const underwaterMapIds = [...work.sourceMaps.values()].filter(map => map.map_type === 'MAP_TYPE_UNDERWATER').map(map => map.id);
  const hoenn = await renderConnectedWorld(rendered, { id: 'rs-hoenn', name: 'Hoenn', mapIds: hoennMapIds, rootId: 'MAP_LITTLEROOT_TOWN' });
  const underwater = await renderConnectedWorld(rendered, { id: 'rs-underwater', name: 'Underwater', mapIds: underwaterMapIds, rootId: underwaterMapIds[0] });
  const battleTower = await renderConnectedWorld(rendered, { id: 'rs-battle-tower', name: 'Battle Tower', mapIds: [...hiddenWorldMaps], rootId: 'MAP_BATTLE_TOWER_OUTSIDE' });
  const worlds = [hoenn, underwater, battleTower];
  const areas = selectReachableAreas(work, worlds, excluded);
  finishAreas(work, areas, rendered.mapAssets);
  const pokedex = buildPokedex(work, areas);
  const { pokemonSprites, pokemonFallback } = await registerPokemonSprites(work, pokedex, assets, sharp, false);

  return {
    source: 'pret/pokeruby', generated: new Date().toISOString().slice(0, 10), areas, worlds, pokedex,
    pokemonSprites, pokemonFallback,
    areaMapsByVersion: {
      Ruby: {
        MAP_CAVE_OF_ORIGIN_B4F: {
          image: rendered.mapAssets.get('LAYOUT_UNKNOWN_MAP_082FF894'), width: 19 * 16, height: 19 * 16
        },
        MAP_SEAFLOOR_CAVERN_ROOM9: {
          image: rendered.mapAssets.get('LAYOUT_UNKNOWN_MAP_083041B4'), width: 27 * 16, height: 46 * 16
        }
      }
    }
  };
}
