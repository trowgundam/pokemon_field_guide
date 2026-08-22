import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('PokemonFieldGuide/wwwroot/games/emerald/data');
const fieldGuide = JSON.parse(fs.readFileSync(path.join(root, 'fieldguide.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package-manifest.json')));
const worlds = JSON.parse(fs.readFileSync(path.join(root, 'worlds.json')));
const areas = new Map(fieldGuide.areas.map(area => [area.id, area]));

const worldAreaIds = worldId => new Set(worlds.find(world => world.id === worldId).maps.map(map => map.id));

const reachableInteriors = startId => {
  const reachable = new Set(), pending = [startId];
  while (pending.length) {
    const id = pending.shift();
    if (reachable.has(id) || !areas.has(id)) continue;
    reachable.add(id);
    pending.push(...areas.get(id).entrances.map(entrance => entrance.targetId));
  }
  return reachable;
};

test('Emerald exposes Hoenn, Underwater, and the transport-only Battle Frontier', () => {
  assert.equal(manifest.formatVersion, 3);
  assert.deepEqual(worlds.map(world => world.id), [
    'emerald-hoenn', 'emerald-underwater', 'emerald-battle-frontier'
  ]);
  assert.deepEqual(worlds.find(world => world.id === 'emerald-battle-frontier').maps.map(map => map.id), [
    'MAP_BATTLE_FRONTIER_OUTSIDE_WEST', 'MAP_BATTLE_FRONTIER_OUTSIDE_EAST'
  ]);
  assert.equal(worldAreaIds('emerald-hoenn').size, 49);
  assert.equal(worldAreaIds('emerald-underwater').size, 4);
  for (const id of [
    'MAP_PETALBURG_WOODS', 'MAP_JAGGED_PASS', 'MAP_MT_CHIMNEY', 'MAP_MT_PYRE_EXTERIOR',
    'MAP_MT_PYRE_SUMMIT', 'MAP_SKY_PILLAR_OUTSIDE', 'MAP_SKY_PILLAR_TOP', 'MAP_SOOTOPOLIS_CITY',
    'MAP_SOUTHERN_ISLAND_EXTERIOR', 'MAP_SOUTHERN_ISLAND_INTERIOR', 'MAP_SAFARI_ZONE_SOUTH'
  ]) assert.equal(worldAreaIds('emerald-hoenn').has(id), false, `${id} belongs behind an entrance or transport`);
  assert.equal(areas.has('MAP_LILYCOVE_CITY_HARBOR'), false);
  const lilycoveTransport = areas.get('MAP_LILYCOVE_CITY').transports[0];
  assert.deepEqual({ x: lilycoveTransport.x, y: lilycoveTransport.y }, { x: 12, y: 32 });
  const destinations = lilycoveTransport.destinations;
  assert.deepEqual(destinations.map(destination => destination.name), [
    'Battle Frontier', 'Southern Island', 'Navel Rock', 'Birth Island', 'Faraway Island'
  ]);
  assert.equal(fieldGuide.areas.some(area => area.id.includes('PROTOTYPE')), false);
  assert.equal(areas.get('MAP_SLATEPORT_CITY_HARBOR').transports.length, 1);
});

test('Emerald keeps disconnected source maps behind navigation markers', () => {
  const safari = reachableInteriors('MAP_SAFARI_ZONE_SOUTH');
  for (const id of [
    'MAP_SAFARI_ZONE_NORTH', 'MAP_SAFARI_ZONE_NORTHWEST', 'MAP_SAFARI_ZONE_SOUTH',
    'MAP_SAFARI_ZONE_NORTHEAST', 'MAP_SAFARI_ZONE_SOUTHWEST', 'MAP_SAFARI_ZONE_SOUTHEAST'
  ]) assert(safari.has(id), `${id} must remain in the Safari Zone interior graph`);

  assert.deepEqual(areas.get('MAP_UNDERWATER_SOOTOPOLIS_CITY').entrances
    .find(entrance => entrance.targetId === 'MAP_SOOTOPOLIS_CITY'), {
    id: 'MAP_UNDERWATER_SOOTOPOLIS_CITY:dive:MAP_SOOTOPOLIS_CITY',
    targetId: 'MAP_SOOTOPOLIS_CITY', name: 'Sootopolis City', x: 9, y: 6
  });
  assert.deepEqual(areas.get('MAP_SOOTOPOLIS_CITY').entrances
    .find(entrance => entrance.targetId === 'MAP_UNDERWATER_SOOTOPOLIS_CITY'), {
    id: 'MAP_SOOTOPOLIS_CITY:dive:MAP_UNDERWATER_SOOTOPOLIS_CITY',
    targetId: 'MAP_UNDERWATER_SOOTOPOLIS_CITY', name: 'Underwater Sootopolis City', x: 29, y: 53
  });
});

test('Emerald retains event-island and single-player legendary encounters', () => {
  const specials = fieldGuide.areas.flatMap(area => area.specialPokemon);
  for (const [speciesId, areaId, level] of [
    ['SPECIES_DEOXYS', 'MAP_BIRTH_ISLAND_EXTERIOR', 30],
    ['SPECIES_MEW', 'MAP_FARAWAY_ISLAND_INTERIOR', 30],
    ['SPECIES_HO_OH', 'MAP_NAVEL_ROCK_TOP', 70],
    ['SPECIES_LUGIA', 'MAP_NAVEL_ROCK_BOTTOM', 70],
    ['SPECIES_GROUDON', 'MAP_TERRA_CAVE_END', 70],
    ['SPECIES_KYOGRE', 'MAP_MARINE_CAVE_END', 70]
  ]) assert(specials.some(pokemon => pokemon.speciesId === speciesId
    && pokemon.id.startsWith(areaId) && pokemon.level === level), `${speciesId} in ${areaId}`);
  assert.equal(specials.some(pokemon => pokemon.id.includes('BATTLE_PIKE') || pokemon.id.includes('BATTLE_PYRAMID')), false);
});

test('Emerald models conditional wild tables and both Shoal Cave states', () => {
  const encounters = fieldGuide.areas.flatMap(area => area.encounters);
  assert.equal(new Set(encounters.filter(encounter => encounter.condition?.startsWith('Altering Cave state:'))
    .map(encounter => encounter.condition)).size, 9);
  assert(encounters.some(encounter => encounter.condition === 'Mass outbreak: Nuzleaf'));
  assert(encounters.some(encounter => encounter.speciesId === 'SPECIES_FEEBAS'
    && encounter.condition === 'Six save-dependent Feebas tiles' && encounter.chance === 50));
  assert(encounters.some(encounter => encounter.type === 'Underwater' && encounter.method === 'Underwater'));
  assert(areas.has('MAP_SHOAL_CAVE_HIGH_TIDE_ENTRANCE_ROOM'));
  assert(areas.has('MAP_SHOAL_CAVE_HIGH_TIDE_INNER_ROOM'));
});

test('Emerald audits renewable sources and four NPC trades', () => {
  const resources = fieldGuide.areas.flatMap(area => area.resources);
  assert.equal(resources.filter(resource => resource.kind.startsWith('Renewable berry tree')).length, 88);
  assert.equal(resources.filter(resource => resource.kind === 'Daily berry gift').length, 8);
  assert.equal(resources.filter(resource => resource.kind === 'Tide-reset pickup').length, 8);
  assert.equal(fieldGuide.areas.flatMap(area => area.specialPokemon)
    .filter(pokemon => pokemon.kind === 'Trade').length, 4);
});

test('Emerald lists both valid outcomes of the roaming Eon choice', () => {
  const specials = fieldGuide.areas.flatMap(area => area.specialPokemon);
  for (const speciesId of ['SPECIES_LATIOS', 'SPECIES_LATIAS']) {
    assert(specials.some(pokemon => pokemon.speciesId === speciesId && pokemon.kind === 'Roaming'));
    assert(areas.get('MAP_SOUTHERN_ISLAND_INTERIOR').specialPokemon
      .some(pokemon => pokemon.speciesId === speciesId && pokemon.kind === 'Static'));
  }
});
