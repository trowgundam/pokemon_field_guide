import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const fieldguide = JSON.parse(fs.readFileSync(path.resolve('PokemonFieldGuide/wwwroot/games/frlg/data/fieldguide.json')));
const areas = new Map(fieldguide.areas.map(area => [area.id, area]));
const manifest = JSON.parse(fs.readFileSync(path.resolve('PokemonFieldGuide/wwwroot/games/frlg/data/package-manifest.json')));

test('FRLG uses package format 3 and standardized TM names', () => {
  assert.equal(manifest.formatVersion, 3);
  const tms = fieldguide.areas.flatMap(area => area.items).filter(item => item.name.startsWith('TM'));
  assert(tms.length > 0);
  for (const item of tms) assert.match(item.name, /^TM\d{2} - .+$/);
  assert(tms.some(item => item.name === 'TM01 - Focus Punch'));
});

test('FRLG exposes Seagallop destinations, including event islands, as transport', () => {
  const vermilion = areas.get('MAP_VERMILION_CITY').transports.find(transport => transport.name === 'Seagallop Ferry');
  assert.deepEqual(vermilion.destinations.map(({ name, requirement }) => ({ name, requirement })), [
    { name: 'One Island', requirement: 'Tri-Pass' },
    { name: 'Two Island', requirement: 'Tri-Pass' },
    { name: 'Three Island', requirement: 'Tri-Pass' },
    { name: 'Four Island', requirement: 'Rainbow Pass' },
    { name: 'Five Island', requirement: 'Rainbow Pass' },
    { name: 'Six Island', requirement: 'Rainbow Pass' },
    { name: 'Seven Island', requirement: 'Rainbow Pass' },
    { name: 'Navel Rock', requirement: 'Mystic Ticket' },
    { name: 'Birth Island', requirement: 'Aurora Ticket' }
  ]);
  for (const id of ['MAP_ONE_ISLAND', 'MAP_TWO_ISLAND', 'MAP_THREE_ISLAND_PORT',
    'MAP_FOUR_ISLAND', 'MAP_FIVE_ISLAND', 'MAP_SIX_ISLAND', 'MAP_SEVEN_ISLAND',
    'MAP_NAVEL_ROCK_EXTERIOR', 'MAP_BIRTH_ISLAND_EXTERIOR']) {
    assert(areas.get(id).transports.length > 0, `${id} has no ferry marker`);
  }
  const requirement = (areaId, destination) => areas.get(areaId).transports[0].destinations
    .find(entry => entry.name === destination).requirement;
  assert.equal(requirement('MAP_ONE_ISLAND', 'Two Island'), 'Tri-Pass');
  assert.equal(requirement('MAP_ONE_ISLAND', 'Four Island'), 'Rainbow Pass');
  assert.equal(requirement('MAP_FOUR_ISLAND', 'One Island'), 'Rainbow Pass');
});

test('FRLG exposes every renewable item source as a non-checklist resource', () => {
  const resources = fieldguide.areas.flatMap(area => area.resources ?? []);
  const renewableHidden = resources.filter(resource => resource.kind === '1,500-step renewable hidden item');

  assert.equal(resources.length, 64);
  assert.equal(renewableHidden.length, 61);
  assert(renewableHidden.some(resource => resource.name === 'Stardust' && resource.x === 23 && resource.y === 6));

  for (const area of fieldguide.areas) for (const resource of area.resources ?? []) {
    if (resource.kind !== '1,500-step renewable hidden item') continue;
    assert.equal(area.items.some(item => item.kind === 'Hidden' && item.x === resource.x && item.y === resource.y), false,
      `${area.id} retains renewable hidden item at ${resource.x},${resource.y}`);
  }
});

test('FRLG represents Selphy and both size judges as renewable resources', () => {
  const selphyArea = areas.get('MAP_FIVE_ISLAND_RESORT_GORGEOUS_HOUSE');
  assert.deepEqual(selphyArea.resources, [{
    name: "Selphy's reward", kind: 'Repeatable Pokémon request', x: 4, y: 4,
    comment: "Complete Selphy's requested Pokémon showing before the 250-step deadline.",
    rewards: [
      { name: 'Luxury Ball', quantity: 1, weight: 70 },
      { name: 'Big Pearl', quantity: 1, weight: 5 },
      { name: 'Pearl', quantity: 1, weight: 5 },
      { name: 'Stardust', quantity: 1, weight: 5 },
      { name: 'Star Piece', quantity: 1, weight: 5 },
      { name: 'Nugget', quantity: 1, weight: 5 },
      { name: 'Rare Candy', quantity: 1, weight: 5 }
    ]
  }]);
  assert.equal(selphyArea.items.some(item => ['Luxury Ball', 'Big Pearl', 'Pearl', 'Stardust', 'Star Piece', 'Nugget', 'Rare Candy'].includes(item.name)), false);

  for (const [areaId, name, x, y, species] of [
    ['MAP_ROUTE12_FISHING_HOUSE', 'Net Ball', 4, 4, 'Magikarp'],
    ['MAP_SIX_ISLAND_WATER_PATH_HOUSE1', 'Nest Ball', 3, 4, 'Heracross']
  ]) {
    assert.deepEqual(areas.get(areaId).resources, [{
      name, kind: 'Repeatable size record', x, y,
      comment: `Awarded each time you beat your saved ${species} size record.`
    }]);
    assert.equal(areas.get(areaId).items.some(item => item.kind === 'Event' && item.name === name), false);
  }
});
