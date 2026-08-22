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
  assert.deepEqual(areas.get('MAP_BATTLE_TOWER_1F').items, []);
  assert.deepEqual(areas.get('MAP_BATTLE_TOWER_1F').resources, [{
    name: 'Battle Tower prize', kind: 'Repeatable seven-win challenge', x: 7, y: 6,
    comment: 'Awarded after seven consecutive wins.',
    rewards: [
      { name: 'HP Up', quantity: 5, weight: 2 },
      { name: 'Protein', quantity: 5, weight: 2 },
      { name: 'Iron', quantity: 5, weight: 1 },
      { name: 'Carbos', quantity: 5, weight: 1 },
      { name: 'Calcium', quantity: 5, weight: 1 }
    ]
  }]);
  const exterior = path.join(webRoot, 'games/crystal/maps/BATTLE_TOWER_OUTSIDE.png');
  assert(fs.existsSync(exterior));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(exterior)).digest('hex'),
    'c297dca8852ac9980ab31569317243ccf597302ef15d49d9317f09d70e8b0a74');
});

test('Crystal tracks phone registration instead of renewable phone gifts', () => {
  const fieldguide = json(path.join(webRoot, 'games/crystal/data/fieldguide.json'));
  const areas = new Map(fieldguide.areas.map(area => [area.id, area]));
  const registrations = [
    ['MAP_NATIONAL_PARK', 'Beverly', 18, 29, ['Nugget']],
    ['MAP_ROUTE_27', 'Jose', 58, 13, ['Star Piece']],
    ['MAP_ROUTE_31', 'Wade', 21, 13, ['Berry', 'Psncureberry', 'Przcureberry', 'Bitter Berry']],
    ['MAP_ROUTE_34', 'Gina', 10, 26, ['Leaf Stone']],
    ['MAP_ROUTE_36', 'Alan', 31, 14, ['Fire Stone']],
    ['MAP_ROUTE_38', 'Dana', 15, 3, ['Thunderstone']],
    ['MAP_ROUTE_39', 'Derek', 10, 22, ['Nugget']],
    ['MAP_ROUTE_42', 'Tully', 40, 10, ['Water Stone']],
    ['MAP_ROUTE_43', 'Tiffany', 9, 25, ['Pink Bow']],
    ['MAP_ROUTE_44', 'Wilton', 35, 3, ['Ultra Ball', 'Great Ball', 'Poké Ball']]
  ];

  for (const [areaId, trainer, x, y, giftNames] of registrations) {
    const registration = areas.get(areaId).items.find(item => item.id === `${areaId}:event:REGISTER_${trainer.toUpperCase()}`);
    assert.deepEqual(registration, {
      id: `${areaId}:event:REGISTER_${trainer.toUpperCase()}`,
      name: `Register ${trainer}`,
      kind: 'Event', icon: 'question_mark.png', x, y, quantity: 1
    });
    assert.equal(areas.get(areaId).items.some(item => item.kind === 'Event' && giftNames.includes(item.name)), false,
      `${trainer}'s renewable gifts remain checklist items`);
  }
});
