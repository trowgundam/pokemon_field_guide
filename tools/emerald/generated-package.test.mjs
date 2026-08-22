import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('PokemonFieldGuide/wwwroot/games/emerald/data');
const fieldGuide = JSON.parse(fs.readFileSync(path.join(root, 'fieldguide.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package-manifest.json')));
const worlds = JSON.parse(fs.readFileSync(path.join(root, 'worlds.json')));
const areas = new Map(fieldGuide.areas.map(area => [area.id, area]));

test('Emerald exposes Hoenn, Underwater, and the transport-only Battle Frontier', () => {
  assert.equal(manifest.formatVersion, 3);
  assert.deepEqual(worlds.map(world => world.id), [
    'emerald-hoenn', 'emerald-underwater', 'emerald-battle-frontier'
  ]);
  assert.deepEqual(worlds.find(world => world.id === 'emerald-battle-frontier').maps.map(map => map.id), [
    'MAP_BATTLE_FRONTIER_OUTSIDE_WEST', 'MAP_BATTLE_FRONTIER_OUTSIDE_EAST'
  ]);
  const destinations = areas.get('MAP_LILYCOVE_CITY_HARBOR').transports[0].destinations;
  assert.deepEqual(destinations.map(destination => destination.name), [
    'Battle Frontier', 'Southern Island', 'Navel Rock', 'Birth Island', 'Faraway Island'
  ]);
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
  assert(encounters.some(encounter => encounter.type === 'Underwater'));
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
