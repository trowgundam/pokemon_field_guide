import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('PokemonFieldGuide/wwwroot/games/rs/data');
const fieldGuide = JSON.parse(fs.readFileSync(path.join(root, 'fieldguide.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package-manifest.json')));
const worlds = JSON.parse(fs.readFileSync(path.join(root, 'worlds.json')));
const areas = new Map(fieldGuide.areas.map(area => [area.id, area]));

test('Ruby/Sapphire exposes Hoenn, Underwater, and ferry-only worlds', () => {
  assert.deepEqual(worlds.map(world => world.id), ['rs-hoenn', 'rs-underwater', 'rs-battle-tower']);
  assert(worlds.find(world => world.id === 'rs-hoenn').maps.some(map => map.id === 'MAP_SOUTHERN_ISLAND_EXTERIOR'));
  assert.equal(worlds.find(world => world.id === 'rs-battle-tower').maps.length, 1);
  assert(areas.get('MAP_LILYCOVE_CITY_HARBOR').transports[0].destinations
    .some(destination => destination.targetId === 'MAP_SOUTHERN_ISLAND_EXTERIOR' && destination.requirement === 'Eon Ticket'));
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
  assert(encounters.some(encounter => encounter.type === 'Underwater'));

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
