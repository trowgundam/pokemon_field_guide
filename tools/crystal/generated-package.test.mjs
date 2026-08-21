import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const webRoot = path.resolve('PokemonFieldGuide/wwwroot');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));

test('Crystal keeps the Battle Tower exterior and entrance chain', () => {
  const fieldguide = json(path.join(webRoot, 'games/crystal/data/fieldguide.json'));
  const areas = new Map(fieldguide.areas.map(area => [area.id, area]));
  for (const id of ['MAP_ROUTE_40', 'MAP_BATTLE_TOWER_OUTSIDE', 'MAP_BATTLE_TOWER_1F'])
    assert(areas.has(id), `${id} is missing from the Crystal package`);
  assert.equal(areas.has('MAP_ROUTE_40_BATTLE_TOWER_GATE'), false, 'walk-through gate should contract away');
  assert(areas.get('MAP_ROUTE_40').entrances.some(entrance => entrance.targetId === 'MAP_BATTLE_TOWER_OUTSIDE'));
  assert(areas.get('MAP_BATTLE_TOWER_OUTSIDE').entrances.some(entrance => entrance.targetId === 'MAP_BATTLE_TOWER_1F'));
  const placements = new Map(json(path.join(webRoot, 'games/crystal/data/worlds.json'))[0].maps.map(placement => [placement.id, placement]));
  const route40 = placements.get('MAP_ROUTE_40'), exteriorPlacement = placements.get('MAP_BATTLE_TOWER_OUTSIDE');
  assert(exteriorPlacement, 'Battle Tower Outside belongs on the world');
  assert.equal(exteriorPlacement.x, route40.x);
  assert.equal(exteriorPlacement.y + exteriorPlacement.height, route40.y);
  assert.deepEqual({ width: exteriorPlacement.width, height: exteriorPlacement.height }, { width: 320, height: 320 });
  assert.equal(areas.get('MAP_BATTLE_TOWER_1F').items.some(item => item.name === 'From Mem' || item.name === 'From Mom'), false);
  assert.deepEqual(areas.get('MAP_BATTLE_TOWER_1F').items.map(item => [item.name, item.quantity]).sort(),
    ['Calcium', 'Carbos', 'HP Up', 'Iron', 'Protein'].map(name => [name, 5]).sort());
  const exterior = path.join(webRoot, 'games/crystal/maps/BATTLE_TOWER_OUTSIDE.png');
  assert(fs.existsSync(exterior));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(exterior)).digest('hex'),
    'c297dca8852ac9980ab31569317243ccf597302ef15d49d9317f09d70e8b0a74');
});
