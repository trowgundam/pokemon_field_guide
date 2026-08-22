import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

const webRoot = path.resolve('PokemonFieldGuide/wwwroot');
const packages = ['gs', 'crystal'];
const interiorWorldMaps = new Set([
  'MAP_MOUNT_MOON_SQUARE',
  'MAP_NATIONAL_PARK',
  'MAP_NATIONAL_PARK_BUG_CONTEST',
  'MAP_OLIVINE_PORT',
  'MAP_RUINS_OF_ALPH_OUTSIDE',
  'MAP_TIN_TOWER_ROOF',
  'MAP_VERMILION_PORT'
]);

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));

for (const game of packages) test(`${game} uses package format 3 and standardized TM names`, () => {
  const manifest = json(path.join(webRoot, `games/${game}/data/package-manifest.json`));
  const fieldguide = json(path.join(webRoot, `games/${game}/data/fieldguide.json`));
  assert.equal(manifest.formatVersion, 3);
  const tms = fieldguide.areas.flatMap(area => area.items).filter(item => item.name.startsWith('TM'));
  assert(tms.length > 0);
  for (const item of tms) assert.match(item.name, /^TM\d{2} - .+$/);
  assert(tms.some(item => item.name === 'TM24 - Dragonbreath'));
});

for (const game of packages) test(`${game} models the Magnet Train and S.S. Aqua as transport`, () => {
  const fieldguide = json(path.join(webRoot, `games/${game}/data/fieldguide.json`));
  const areas = new Map(fieldguide.areas.map(area => [area.id, area]));
  const destination = (areaId, transportName, destinationName) => areas.get(areaId).transports
    .find(transport => transport.name === transportName).destinations.find(entry => entry.name === destinationName);

  assert.deepEqual(destination('MAP_GOLDENROD_CITY', 'Magnet Train', 'Saffron City'), {
    id: 'saffron-city', targetId: 'MAP_SAFFRON_CITY', name: 'Saffron City', version: 'Both',
    requirement: 'Rail Pass; power restored to Kanto'
  });
  assert.deepEqual(destination('MAP_SAFFRON_CITY', 'Magnet Train', 'Goldenrod City'), {
    id: 'goldenrod-city', targetId: 'MAP_GOLDENROD_CITY', name: 'Goldenrod City', version: 'Both',
    requirement: 'Rail Pass; power restored to Kanto'
  });
  assert.equal(areas.get('MAP_GOLDENROD_CITY').entrances.some(entry => entry.targetId === 'MAP_SAFFRON_CITY'), false);
  assert.equal(areas.get('MAP_SAFFRON_CITY').entrances.some(entry => entry.targetId === 'MAP_GOLDENROD_CITY'), false);

  assert.equal(destination('MAP_OLIVINE_PORT', 'S.S. Aqua', 'S.S. Aqua').targetId, 'MAP_FAST_SHIP_1F');
  assert.equal(destination('MAP_VERMILION_PORT', 'S.S. Aqua', 'S.S. Aqua').targetId, 'MAP_FAST_SHIP_1F');
  assert.deepEqual(areas.get('MAP_FAST_SHIP_1F').transports[0].destinations.map(({ name, requirement }) => ({ name, requirement })), [
    { name: 'Olivine City', requirement: 'Chosen when the voyage began in Vermilion City.' },
    { name: 'Vermilion City', requirement: 'Chosen when the voyage began in Olivine City.' }
  ]);
});

function decodePng(file) {
  const png = fs.readFileSync(file);
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  let offset = 8, width, height, colorType, bitDepth, compressed = Buffer.alloc(0);
  while (offset < png.length) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === 'IDAT') compressed = Buffer.concat([compressed, data]);
    offset += length + 12;
  }
  assert.equal(bitDepth, 8);
  assert.equal(colorType, 6);
  const encoded = zlib.inflateSync(compressed), stride = width * 4, decoded = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0, input = 0; y < height; y++) {
    const filter = encoded[input++];
    for (let x = 0; x < stride; x++, input++) {
      const left = x >= 4 ? decoded[y * stride + x - 4] : 0;
      const above = y ? decoded[(y - 1) * stride + x] : 0;
      const upperLeft = y && x >= 4 ? decoded[(y - 1) * stride + x - 4] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
      decoded[y * stride + x] = (encoded[input] + predictor) & 0xff;
    }
  }
  return { width, height, data: decoded };
}

const pixelAt = (png, x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x + 1) * 4)];
const overlapArea = (left, right) => Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  * Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));

for (const game of packages) test(`${game} has one connected overworld with interior-like maps excluded`, () => {
  const worlds = json(path.join(webRoot, `games/${game}/data/worlds.json`));
  assert.equal(worlds.length, 1);
  const placements = new Map(worlds[0].maps.map(placement => [placement.id, placement]));
  for (const id of interiorWorldMaps) assert.equal(placements.has(id), false, `${id} belongs behind an entrance`);
  for (const id of ['MAP_NEW_BARK_TOWN', 'MAP_ROUTE_22', 'MAP_ROUTE_23', 'MAP_ROUTE_26', 'MAP_ROUTE_27', 'MAP_ROUTE_28', 'MAP_VICTORY_ROAD_OVERWORLD'])
    assert.equal(placements.has(id), true, `${id} must be on the connected world`);

  const connector = placements.get('MAP_VICTORY_ROAD_OVERWORLD');
  assert.deepEqual({ width: connector.width, height: connector.height }, { width: 320, height: 320 });
  const route22 = placements.get('MAP_ROUTE_22'), route23 = placements.get('MAP_ROUTE_23');
  const route26 = placements.get('MAP_ROUTE_26'), route28 = placements.get('MAP_ROUTE_28');
  for (const placement of [route22, route23, route26, route28]) {
    const source = decodePng(path.join(webRoot, `games/${game}/maps/${placement.id.replace('MAP_', '')}.png`));
    assert.deepEqual({ width: placement.width, height: placement.height }, { width: source.width, height: source.height },
      `${placement.id} still has its obsolete shared-junction crop`);
    assert.deepEqual({ x: placement.markerOffsetX, y: placement.markerOffsetY }, { x: 0, y: 0 });
  }
  assert.equal(route28.x + route28.width, connector.x, 'Route 28 must stop at the west edge');
  assert.equal(route22.x, connector.x + connector.width, 'Route 22 must start at the east edge');
  assert.equal(route23.y + route23.height, connector.y, 'Route 23 must stop at the north edge');
  assert.equal(route26.y, connector.y + connector.height, 'Route 26 must start at the south edge');
  assert.equal(route23.x, connector.x);
  assert.equal(route26.x, connector.x);
  assert.equal(route28.y, connector.y + 16);
  assert.equal(route22.y, connector.y + 16);
  const junction = [route22, route23, route26, route28, connector];
  for (let left = 0; left < junction.length; left++) for (let right = left + 1; right < junction.length; right++)
    assert.equal(overlapArea(junction[left], junction[right]), 0,
      `${junction[left].id} overlaps ${junction[right].id}`);

  const connectorImage = decodePng(path.join(webRoot, `games/${game}/maps/VICTORY_ROAD_OVERWORLD.png`));
  assert.notDeepEqual(pixelAt(connectorImage, 0, 0), [0, 0, 0, 0], 'Victory Road square must have a rocky texture');
  for (let y = 0; y < connectorImage.height; y += 32) for (let x = 0; x < connectorImage.width; x += 32)
    assert.deepEqual(pixelAt(connectorImage, x, y), pixelAt(connectorImage, 0, 0), 'Victory Road texture must tile cleanly');
  const placementOrder = worlds[0].maps.map(placement => placement.id);
  assert.equal(placementOrder.at(-1), 'MAP_VICTORY_ROAD_OVERWORLD', 'Victory Road connector hotspot must be on top');
});

for (const game of packages) test(`${game} keeps Ruins of Alph Outside behind both overworld gates`, () => {
  const placements = new Map(json(path.join(webRoot, `games/${game}/data/worlds.json`))[0].maps
    .map(placement => [placement.id, placement]));
  assert.equal(placements.has('MAP_RUINS_OF_ALPH_OUTSIDE'), false);
  const areas = new Map(json(path.join(webRoot, `games/${game}/data/fieldguide.json`)).areas.map(area => [area.id, area]));
  const targets = id => areas.get(id).entrances.map(entrance => entrance.targetId);
  assert(targets('MAP_ROUTE_32').includes('MAP_RUINS_OF_ALPH_OUTSIDE'));
  assert(targets('MAP_ROUTE_36').includes('MAP_RUINS_OF_ALPH_OUTSIDE'));
  assert(targets('MAP_RUINS_OF_ALPH_OUTSIDE').includes('MAP_ROUTE_32'));
  assert(targets('MAP_RUINS_OF_ALPH_OUTSIDE').includes('MAP_ROUTE_36'));
});

for (const game of packages) test(`${game} exposes every renewable item source as a non-checklist map resource`, () => {
  const fieldguide = json(path.join(webRoot, `games/${game}/data/fieldguide.json`));
  const areas = new Map(fieldguide.areas.map(area => [area.id, area]));
  const resources = fieldguide.areas.flatMap(area => area.resources ?? []);

  assert.equal(resources.length, game === 'gs' ? 34 : 35);
  assert.deepEqual(areas.get('MAP_ROUTE_29').resources, [
    { name: 'Berry', kind: 'Daily fruit tree', x: 12, y: 2 }
  ]);
  assert(areas.get('MAP_ROUTE_37').resources.some(resource =>
    resource.name === 'Blue Apricorn' && resource.x === 16 && resource.y === 5));
  assert(areas.get('MAP_ROUTE_30').resources.some(resource => resource.name === 'PSNCureBerry'));
  assert.equal(fieldguide.areas.flatMap(area => area.items)
    .some(item => item.kind === 'Daily fruit tree'), false);
  assert(areas.get('MAP_MOUNT_MOON_SQUARE').resources.some(resource =>
    resource.name === 'Moon Stone' && resource.kind === 'Weekly hidden pickup' && resource.x === 7 && resource.y === 7));
  assert.deepEqual(areas.get('MAP_ROUTE_36_NATIONAL_PARK_GATE').resources.find(resource => resource.name === 'Bug-Catching Contest prize').rewards,
    [
      { name: 'Sun Stone', quantity: 1, comment: 'First place.' },
      { name: 'Everstone', quantity: 1, comment: 'Second place.' },
      { name: 'Gold Berry', quantity: 1, comment: 'Third place.' },
      { name: 'Berry', quantity: 1, comment: 'Consolation prize.' }
    ]);
  assert.deepEqual(areas.get('MAP_GOLDENROD_DEPT_STORE_5F').resources.find(resource => resource.name === 'Sunday TM reward').rewards,
    [
      { name: 'TM27 - Return', quantity: 1, comment: 'Lead Pokémon happiness is at least 150.' },
      { name: 'TM21 - Frustration', quantity: 1, comment: 'Lead Pokémon happiness is below 50.' }
    ]);
  const recordPrize = areas.get('MAP_LAKE_OF_RAGE_MAGIKARP_HOUSE').resources.find(resource => resource.kind === 'Repeatable size record');
  assert.equal(recordPrize.name, game === 'gs' ? 'Ether' : 'Elixer');
  assert.match(recordPrize.comment, /beat your saved Magikarp length record/i);
  for (const [areaId, names] of [
    ['MAP_MOUNT_MOON_SQUARE', ['Moon Stone']],
    ['MAP_ROUTE_36_NATIONAL_PARK_GATE', ['Sun Stone', 'Everstone', 'Gold Berry', 'Berry']],
    ['MAP_GOLDENROD_DEPT_STORE_5F', ['TM27 - Return', 'TM21 - Frustration']],
    ['MAP_LAKE_OF_RAGE_MAGIKARP_HOUSE', [game === 'gs' ? 'Ether' : 'Elixer']]
  ]) assert.equal(areas.get(areaId).items.some(item => names.includes(item.name)), false, `${areaId} retains a renewable checklist item`);
  assert.equal(areas.get('MAP_RADIO_TOWER_1F').items.some(item => ['Master Ball', 'Exp Share'].includes(item.name)), false,
    'Lucky Number lottery rewards remain checklist items');
});

test('Generation II battle sprites have transparent backgrounds', () => {
  for (const file of [
    'games/gs/sprites/pokemon/bulbasaur-gold.png',
    'games/gs/sprites/pokemon/bulbasaur-silver.png',
    'games/crystal/sprites/pokemon/bulbasaur.png'
  ]) {
    const alpha = Array.from(decodePng(path.join(webRoot, file)).data).filter((_, index) => index % 4 === 3);
    assert(alpha.some(value => value === 0), `${file} has no transparent pixels`);
    assert(alpha.some(value => value === 255), `${file} has no opaque pixels`);
  }
});
