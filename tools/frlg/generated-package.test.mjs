import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const fieldguide = JSON.parse(fs.readFileSync(path.resolve('PokemonFieldGuide/wwwroot/games/frlg/data/fieldguide.json')));
const areas = new Map(fieldguide.areas.map(area => [area.id, area]));

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
