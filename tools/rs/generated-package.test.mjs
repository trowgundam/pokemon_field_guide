import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('PokemonFieldGuide/wwwroot/games/rs/data');
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

test('Ruby/Sapphire exposes Hoenn, Underwater, and ferry-only worlds', () => {
  assert.deepEqual(worlds.map(world => world.id), ['rs-hoenn', 'rs-underwater', 'rs-battle-tower']);
  assert.equal(worldAreaIds('rs-hoenn').size, 49);
  assert.equal(worldAreaIds('rs-underwater').size, 4);
  for (const id of [
    'MAP_PETALBURG_WOODS', 'MAP_JAGGED_PASS', 'MAP_MT_CHIMNEY', 'MAP_MT_PYRE_EXTERIOR',
    'MAP_MT_PYRE_SUMMIT', 'MAP_SKY_PILLAR_OUTSIDE', 'MAP_SKY_PILLAR_TOP', 'MAP_SOOTOPOLIS_CITY',
    'MAP_SOUTHERN_ISLAND_EXTERIOR', 'MAP_SOUTHERN_ISLAND_INTERIOR', 'MAP_SAFARI_ZONE_SOUTHEAST'
  ]) assert.equal(worldAreaIds('rs-hoenn').has(id), false, `${id} belongs behind an entrance or transport`);
  assert.equal(worlds.find(world => world.id === 'rs-battle-tower').maps.length, 1);
  assert.equal(areas.has('MAP_LILYCOVE_CITY_HARBOR'), false);
  const lilycoveTransport = areas.get('MAP_LILYCOVE_CITY').transports[0];
  assert.deepEqual({ x: lilycoveTransport.x, y: lilycoveTransport.y }, { x: 12, y: 32 });
  assert(lilycoveTransport.destinations
    .some(destination => destination.targetId === 'MAP_SOUTHERN_ISLAND_EXTERIOR' && destination.requirement === 'Eon Ticket'));
  assert.equal(areas.get('MAP_SLATEPORT_CITY_HARBOR').transports.length, 1);
  assert.equal(fieldGuide.areas.some(area => area.id.includes('PROTOTYPE')), false);
});

test('Ruby/Sapphire keeps disconnected source maps behind navigation markers', () => {
  const safari = reachableInteriors('MAP_SAFARI_ZONE_SOUTHEAST');
  for (const id of [
    'MAP_SAFARI_ZONE_NORTHEAST', 'MAP_SAFARI_ZONE_NORTHWEST',
    'MAP_SAFARI_ZONE_SOUTHEAST', 'MAP_SAFARI_ZONE_SOUTHWEST'
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

test('Ruby/Sapphire retains version-dependent layouts and items', () => {
  assert.equal(manifest.formatVersion, 3);
  assert.deepEqual(Object.keys(manifest.areaMapsByVersion.Ruby).sort(), [
    'MAP_CAVE_OF_ORIGIN_B4F', 'MAP_SEAFLOOR_CAVERN_ROOM9'
  ]);
  const orbs = areas.get('MAP_MT_PYRE_SUMMIT').items.filter(item => item.name.endsWith('Orb'));
  assert.deepEqual(orbs.map(item => [item.name, item.version]).sort(), [
    ['Blue Orb', 'Sapphire'], ['Red Orb', 'Ruby']
  ]);
});

test('Ruby/Sapphire models conditional encounters and renewable sources', () => {
  const encounters = fieldGuide.areas.flatMap(area => area.encounters);
  const feebas = encounters.filter(encounter => encounter.speciesId === 'SPECIES_FEEBAS');
  assert.equal(feebas.length, 3);
  assert(feebas.every(encounter => encounter.chance === 50 && encounter.condition === 'Six save-dependent Feebas tiles'));
  assert(encounters.some(encounter => encounter.condition === 'Mass outbreak: Surskit'));
  assert(encounters.some(encounter => encounter.condition === 'Mass outbreak: Skitty'));
  assert(encounters.some(encounter => encounter.type === 'Underwater' && encounter.method === 'Underwater'));

  const resources = fieldGuide.areas.flatMap(area => area.resources);
  assert.equal(resources.filter(resource => resource.kind.startsWith('Renewable berry tree')).length, 88);
  assert.equal(resources.filter(resource => resource.kind === 'Daily berry gift').length, 8);
  assert.equal(resources.filter(resource => resource.kind === 'Tide-reset pickup').length, 8);
});

test('Ruby/Sapphire records gifts, trades, roamers, and event-island Pokémon', () => {
  const specials = fieldGuide.areas.flatMap(area => area.specialPokemon);
  for (const expected of [
    ['SPECIES_TREECKO', 'Gift', 'Both'], ['SPECIES_WYNAUT', 'Egg', 'Both'],
    ['SPECIES_GROUDON', 'Static', 'Ruby'], ['SPECIES_KYOGRE', 'Static', 'Sapphire'],
    ['SPECIES_LATIOS', 'Roaming', 'Ruby'], ['SPECIES_LATIAS', 'Roaming', 'Sapphire'],
    ['SPECIES_LATIAS', 'Static', 'Ruby'], ['SPECIES_LATIOS', 'Static', 'Sapphire'],
    ['SPECIES_MAKUHITA', 'Trade', 'Both']
  ]) assert(specials.some(pokemon => pokemon.speciesId === expected[0]
    && pokemon.kind === expected[1] && pokemon.version === expected[2]), expected.join(' / '));
});

test('Ruby/Sapphire labels TMs with their number and move', () => {
  const names = fieldGuide.areas.flatMap(area => area.items).map(item => item.name)
    .filter(name => /^TM(?:\d| )/i.test(name) && name !== 'TM Case');
  assert(names.includes('TM24 - Thunderbolt'));
  assert(names.every(name => /^TM\d{2} - .+/.test(name)), names.find(name => !/^TM\d{2} - .+/.test(name)));
});
