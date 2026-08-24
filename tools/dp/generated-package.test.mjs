import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../PokemonFieldGuide/wwwroot/games/dp');
const load = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const guide = load('fieldguide.json'), dex = load('pokedex.json'), worlds = load('worlds.json');
const area = id => guide.areas.find(candidate => candidate.id === id);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('Diamond and Pearl share one layered source-accurate Sinnoh package', () => {
  assert.equal(worlds.formatVersion, 2); assert.equal(worlds.worlds[0].id, 'dp-sinnoh');
  assert.equal(worlds.worlds[0].rendering.layers.length, 64); assert.ok(worlds.worlds[0].areas.length > 55);
  assert.ok(worlds.worlds[0].rendering.layers.every(layer => layer.minScale <= 1 / 8));
  assert.equal(worlds.worlds[0].areas.reduce((sum, candidate) => sum + candidate.regions.length, 0), 62);
  assert.equal(worlds.worlds[0].areas.find(candidate => candidate.id === 'MAP_JUBLIFE').regions.length, 1);
  assert.equal(dex.length, 493); assert.equal(Object.keys(dex[0].availability).sort().join(','), 'Diamond,Pearl');
  assert.equal(fs.readdirSync(root, { recursive: true }).some(file => /\.(?:glb|nsbmd|nsbtx)$/i.test(file)), false);
  const sprite = fs.readFileSync(path.join(root, 'sprites/pokemon/pikachu.png'));
  assert.deepEqual({ width: sprite.readUInt32BE(16), height: sprite.readUInt32BE(20) }, { width: 80, height: 160 });
});

test('Diamond and Pearl world regions follow the visible area silhouettes', () => {
  const twinleaf = worlds.worlds[0].areas.find(candidate => candidate.id === 'MAP_TWINLEAF');
  assert.ok(twinleaf.regions.some(region => region.points.length > 4));
});

test('Diamond and Pearl fill the two omitted rock-roof cells without creating selectable areas', () => {
  const world = worlds.worlds[0];
  const decorationIds = world.rendering.layers.map(layer => layer.id).filter(id => id.startsWith('sinnoh-rock-roof-'));
  assert.deepEqual(decorationIds, ['sinnoh-rock-roof-route-211', 'sinnoh-rock-roof-route-207-208']);
  assert.equal(world.areas.some(candidate => decorationIds.includes(candidate.id)), false);
});

test('Diamond and Pearl use source item sprites for every checklist item', () => {
  const fallbackHash = sha256(path.join(root, 'sprites/items/question_mark.png'));
  const fallbackItems = guide.areas.flatMap(candidate => candidate.items.map(item => ({ area: candidate.name, item })))
    .filter(({ item }) => sha256(path.join(root, 'sprites/items', path.basename(item.icon))) === fallbackHash)
    .map(({ area: areaName, item }) => `${item.name} @ ${areaName}`);
  assert.deepEqual(fallbackItems, []);
});

test('Diamond and Pearl index item sprites by the game item constant', () => {
  const items = guide.areas.flatMap(area => area.items);
  assert.equal(items.find(item => item.name === 'Odd Keystone')?.icon, '488-489.png');
  assert.equal(items.find(item => item.name === 'Amulet Coin')?.icon, '269-270.png');
});

test('Diamond and Pearl do not merge unused Seabreak Path cells into Jubilife', () => {
  const world = worlds.worlds[0];
  const jubilife = world.areas.findIndex(candidate => candidate.id === 'MAP_JUBLIFE');
  const layer = world.rendering.layers[jubilife];
  assert.ok(layer.width < 1200);
  assert.ok(layer.height < 1000);
});

test('Diamond and Pearl keep the Hearthome gate in front of Route 212', () => {
  const world = worlds.worlds[0];
  const hearthome = world.areas.findIndex(candidate => candidate.id === 'MAP_HEARTHOME');
  const route212 = world.areas.findIndex(candidate => candidate.id === 'MAP_ROUTE_212_NORTH');
  assert.ok(hearthome > route212);
});

test('Diamond and Pearl preserve version-exclusive availability and encounters', () => {
  assert.deepEqual(dex.find(entry => entry.speciesId === 'SPECIES_PHIONE').availability, {
    Diamond: 'Event distribution',
    Pearl: 'Event distribution'
  });
  assert.equal(dex.find(entry => entry.speciesId === 'SPECIES_DIALGA').availability.Pearl, 'Trade / transfer required');
  assert.equal(dex.find(entry => entry.speciesId === 'SPECIES_PALKIA').availability.Diamond, 'Trade / transfer required');
  assert.equal(dex.find(entry => entry.speciesId === 'SPECIES_MURKROW').availability.Pearl, 'Trade / transfer required');
  assert.equal(dex.find(entry => entry.speciesId === 'SPECIES_MISDREAVUS').availability.Diamond, 'Trade / transfer required');
  assert.equal(area('MAP_MOUNT_CORONET_SPEAR_PILLAR').specialPokemon.filter(entry => ['SPECIES_DIALGA', 'SPECIES_PALKIA'].includes(entry.speciesId)).length, 2);
  assert.equal(guide.areas.filter(candidate => candidate.encounters.some(encounter => encounter.method === 'Honey Tree')).length, 21);
  assert.ok(guide.areas.some(candidate => candidate.encounters.some(encounter => encounter.version === 'Diamond')));
  assert.ok(guide.areas.some(candidate => candidate.encounters.some(encounter => encounter.version === 'Pearl')));
});

test('Diamond and Pearl include scripted rewards and dynamic encounter sources', () => {
  const eventItems = guide.areas.flatMap(candidate => candidate.items).filter(item => item.kind === 'Event');
  assert.ok(eventItems.length > 60);
  for (const name of ['Bicycle', 'Explorer Kit', 'Old Rod', 'Good Rod', 'Super Rod', 'Master Ball', 'HM03 - Surf']) {
    assert.ok(eventItems.some(item => item.name === name), name);
  }

  const encounters = guide.areas.flatMap(candidate => candidate.encounters);
  const feebas = encounters.filter(encounter => encounter.speciesId === 'SPECIES_FEEBAS');
  assert.equal(feebas.length, 6);
  assert.ok(feebas.every(encounter => encounter.chance === 50 && encounter.condition === 'Four daily save-dependent Feebas tiles'));
  assert.ok(encounters.some(encounter => encounter.speciesId === 'SPECIES_PORYGON'
    && encounter.condition === 'Trophy Garden daily pool · National Pokédex'));
  assert.ok(encounters.some(encounter => encounter.speciesId === 'SPECIES_KANGASKHAN'
    && encounter.condition === 'Great Marsh daily pool · National Pokédex'));
});

test('Diamond and Pearl document acquisition prerequisites', () => {
  const spiritomb = area('MAP_ROUTE_209').specialPokemon.find(entry => entry.speciesId === 'SPECIES_SPIRITOMB');
  assert.equal(spiritomb.note, 'Requires 32 conversations with other players in the Underground.');
  assert.deepEqual(dex.find(entry => entry.speciesId === 'SPECIES_REGIGIGAS').availability, {
    Diamond: 'Trade / transfer required', Pearl: 'Trade / transfer required'
  });
});

test('Diamond and Pearl replace colliding state entrances with transport choices', () => {
  for (const candidate of guide.areas) {
    const coordinates = new Set();
    for (const entrance of candidate.entrances.filter(entry => entry.showMarker !== false && entry.targetId)) {
      const key = `${entrance.x},${entrance.y}`;
      assert.equal(coordinates.has(key), false, `${candidate.id} has colliding entrance markers at ${key}`);
      coordinates.add(key);
    }
  }
  assert.ok(area('MAP_ROUTE_214').transports.some(transport => transport.destinations.length === 3));
  assert.equal(
    area('MAP_ACUITY_LAKEFRONT').transports.filter(transport => transport.name === 'Entrance choices').length,
    1
  );
});

test('Diamond and Pearl source coordinates resolve expected Route 216 content', () => {
  const route = area('MAP_ROUTE_216');
  assert.deepEqual(route.items.map(item => item.name), ['TM13 - Ice Beam', 'Full Heal', 'Mental Herb', 'HP Up', 'PP Up']);
  const projection = worlds.worlds[0].areas.find(candidate => candidate.id === route.id);
  for (const item of route.items) assert.ok(projection.anchors.some(anchor => anchor.tileX === item.x && anchor.tileY === item.y));
  assert.ok(guide.areas.flatMap(candidate => candidate.entrances).some(entrance => entrance.showMarker === false));
});

test('Diamond and Pearl detach Canalave ferry islands and compact the snow component', () => {
  const destinations = area('MAP_CANALAVE').transports.find(transport => transport.name === 'Canalave ferry').destinations;
  assert.deepEqual(destinations.map(destination => destination.targetId), [
    'MAP_IRON_ISLAND_EXTERIOR',
    'MAP_FULLMOON_ISLAND_EXTERIOR',
    'MAP_NEWMOON_ISLAND_EXTERIOR'
  ]);

  const worldArea = id => worlds.worlds[0].areas.find(candidate => candidate.id === id);
  for (const destination of destinations) {
    const island = area(destination.targetId);
    assert.equal(worldArea(destination.targetId), undefined);
    assert.notEqual(island.mapImage, worlds.worlds[0].rendering.overviewImage);
    assert.ok(island.mapWidth > 0 && island.mapHeight > 0 && island.mapAnchors.length > 0);
  }
  const verticalBounds = candidate => ({
    min: Math.min(...candidate.regions.flatMap(region => region.points.map(point => point.y))),
    max: Math.max(...candidate.regions.flatMap(region => region.points.map(point => point.y)))
  });
  const snow = ['MAP_ACUITY_LAKEFRONT', 'MAP_ROUTE_216', 'MAP_ROUTE_217', 'MAP_SNOWPOINT']
    .map(worldArea);
  const snowBottom = Math.max(...snow.map(candidate => verticalBounds(candidate).max));
  const route211Top = verticalBounds(worldArea('MAP_ROUTE_211_WEST')).min;
  assert.ok(route211Top - snowBottom > 0 && route211Top - snowBottom < 600);
});
