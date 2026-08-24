import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../PokemonFieldGuide/wwwroot/games/platinum');
const load = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const guide = load('fieldguide.json'), dex = load('pokedex.json'), worlds = load('worlds.json');
const area = id => guide.areas.find(candidate => candidate.id === id);
const pngSize = file => { const data = fs.readFileSync(file); assert.equal(data.subarray(1, 4).toString(), 'PNG'); return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }; };

test('Platinum ships a layered 2D Sinnoh world without runtime 3D assets', () => {
  assert.equal(worlds.formatVersion, 2); assert.equal(worlds.worlds.length, 1);
  const world = worlds.worlds[0]; assert.equal(world.id, 'platinum-sinnoh'); assert.equal(world.rendering.layers.length, 65); assert.ok(world.areas.length > 55);
  assert.ok(world.rendering.layers.every(layer => layer.minScale <= 1 / 8));
  assert.equal(world.areas.reduce((sum, candidate) => sum + candidate.regions.length, 0), 63);
  assert.equal(world.areas.find(candidate => candidate.id === 'MAP_HEADER_JUBILIFE_CITY').regions.length, 1);
  assert.deepEqual(pngSize(path.join(root, 'maps/WORLD_SINNOH_OVERVIEW.png')), { width: Math.round(world.rendering.width / 8), height: Math.round(world.rendering.height / 8) });
  for (const layer of world.rendering.layers) {
    const file = path.join(root, layer.image.replace('games/platinum/', ''));
    assert.deepEqual(pngSize(file), { width: layer.width, height: layer.height });
  }
  assert.equal(fs.readdirSync(root, { recursive: true }).some(file => /\.(?:glb|nsbmd|nsbtx)$/i.test(file)), false);
  assert.deepEqual(pngSize(path.join(root, 'sprites/pokemon/pikachu.png')), { width: 80, height: 160 });
});

test('Platinum world regions follow the visible area silhouettes', () => {
  const twinleaf = worlds.worlds[0].areas.find(candidate => candidate.id === 'MAP_HEADER_TWINLEAF_TOWN');
  assert.ok(twinleaf.regions.some(region => region.points.length > 4));
});

test('Platinum fills the two omitted rock-roof cells without creating selectable areas', () => {
  const world = worlds.worlds[0];
  const decorationIds = world.rendering.layers.map(layer => layer.id).filter(id => id.startsWith('sinnoh-rock-roof-'));
  assert.deepEqual(decorationIds, ['sinnoh-rock-roof-route-211', 'sinnoh-rock-roof-route-207-208']);
  assert.equal(world.areas.some(candidate => decorationIds.includes(candidate.id)), false);
});

test('Platinum keeps the Eterna Cycling Road gate in front of Route 206', () => {
  const world = worlds.worlds[0];
  const eterna = world.areas.findIndex(candidate => candidate.id === 'MAP_HEADER_ETERNA_CITY');
  const route206 = world.areas.findIndex(candidate => candidate.id === 'MAP_HEADER_ROUTE_206');
  assert.ok(eterna > route206);
});

test('Platinum keeps the Hearthome gate in front of Route 212', () => {
  const world = worlds.worlds[0];
  const hearthome = world.areas.findIndex(candidate => candidate.id === 'MAP_HEADER_HEARTHOME_CITY');
  const route212 = world.areas.findIndex(candidate => candidate.id === 'MAP_HEADER_ROUTE_212_NORTH');
  assert.ok(hearthome > route212);
});

test('Platinum represents Honey Trees and the Distortion World scope as designed', () => {
  assert.equal(guide.areas.filter(candidate => candidate.encounters.some(encounter => encounter.method === 'Honey Tree')).length, 21);
  const distortion = guide.areas.filter(candidate => candidate.id.includes('DISTORTION_WORLD'));
  assert.deepEqual(distortion.map(candidate => candidate.id), ['MAP_HEADER_DISTORTION_WORLD_GIRATINA_ROOM']);
  assert.equal(distortion[0].items.length, 0);
  assert.ok(distortion[0].specialPokemon.some(entry => entry.speciesId === 'SPECIES_GIRATINA' && entry.level === 47));
  const turnback = area('MAP_HEADER_TURNBACK_CAVE_GIRATINA_ROOM');
  assert.ok(turnback.items.some(item => item.name === 'Griseous Orb'));
  assert.equal(turnback.mapAnchors.some(anchor => anchor.tileX === 11 && anchor.tileY === 13), true);
});

test('Platinum retains canonical species and dynamic navigation semantics', () => {
  assert.equal(dex.length, 493);
  for (const species of ['SPECIES_MANAPHY', 'SPECIES_PHIONE', 'SPECIES_DARKRAI', 'SPECIES_SHAYMIN', 'SPECIES_ARCEUS']) assert.equal(dex.find(entry => entry.speciesId === species).availability.Platinum, 'Event distribution');
  assert.ok(guide.areas.flatMap(candidate => candidate.entrances).some(entrance => entrance.showMarker === false));
  assert.ok(guide.areas.filter(candidate => (candidate.mapAnchors?.length ?? 0) > 0).length > 100);
});

test('Platinum includes scripted rewards and dynamic encounter sources', () => {
  const eventItems = guide.areas.flatMap(candidate => candidate.items).filter(item => item.kind === 'Event');
  assert.ok(eventItems.length > 60);
  for (const name of ['Bicycle', 'Explorer Kit', 'Old Rod', 'Good Rod', 'Super Rod', 'Master Ball', 'HM03 - Surf']) {
    assert.ok(eventItems.some(item => item.name === name), name);
  }

  const encounters = guide.areas.flatMap(candidate => candidate.encounters);
  const feebas = encounters.filter(encounter => encounter.speciesId === 'SPECIES_FEEBAS');
  assert.equal(feebas.length, 3);
  assert.ok(feebas.every(encounter => encounter.chance === 50 && encounter.condition === 'Four daily save-dependent Feebas tiles'));
  assert.ok(encounters.some(encounter => encounter.speciesId === 'SPECIES_DITTO'
    && encounter.condition === 'Trophy Garden daily pool · National Pokédex'));
  assert.ok(encounters.some(encounter => encounter.speciesId === 'SPECIES_KANGASKHAN'
    && encounter.condition === 'Great Marsh daily pool · National Pokédex'));
});

test('Platinum evolves local species and documents external prerequisites', () => {
  for (const species of ['SPECIES_BLISSEY', 'SPECIES_CROBAT', 'SPECIES_ESPEON', 'SPECIES_GLACEON', 'SPECIES_LEAFEON', 'SPECIES_LUCARIO', 'SPECIES_TOGEKISS']) {
    assert.equal(dex.find(entry => entry.speciesId === species).availability.Platinum, 'Obtainable', species);
  }
  const spiritomb = guide.areas.flatMap(candidate => candidate.specialPokemon).find(entry => entry.speciesId === 'SPECIES_SPIRITOMB');
  assert.equal(spiritomb.note, 'Requires 32 conversations with other players in the Underground.');
  for (const species of ['SPECIES_REGIROCK', 'SPECIES_REGICE', 'SPECIES_REGISTEEL', 'SPECIES_REGIGIGAS']) {
    assert.equal(dex.find(entry => entry.speciesId === species).availability.Platinum, 'Trade / transfer required', species);
  }
});

test('Platinum replaces colliding state entrances with transport choices', () => {
  for (const candidate of guide.areas) {
    const coordinates = new Set();
    for (const entrance of candidate.entrances.filter(entry => entry.showMarker !== false && entry.targetId)) {
      const key = `${entrance.x},${entrance.y}`;
      assert.equal(coordinates.has(key), false, `${candidate.id} has colliding entrance markers at ${key}`);
      coordinates.add(key);
    }
  }
  const spear = area('MAP_HEADER_SPEAR_PILLAR').transports.find(transport => transport.destinations.length === 2);
  assert.deepEqual(spear.destinations.map(destination => destination.targetId).sort(), [
    'MAP_HEADER_DISTORTION_WORLD_GIRATINA_ROOM', 'MAP_HEADER_HALL_OF_ORIGIN'
  ]);
  assert.equal(
    area('MAP_HEADER_ACUITY_LAKEFRONT').transports.filter(transport => transport.name === 'Entrance choices').length,
    1
  );
});

test('Platinum detaches Canalave ferry islands and compacts the snow component', () => {
  const destinations = area('MAP_HEADER_CANALAVE_CITY').transports.find(transport => transport.name === 'Canalave ferry').destinations;
  assert.deepEqual(destinations.map(destination => destination.targetId), [
    'MAP_HEADER_IRON_ISLAND',
    'MAP_HEADER_FULLMOON_ISLAND',
    'MAP_HEADER_NEWMOON_ISLAND'
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
  const snow = ['MAP_HEADER_ACUITY_LAKEFRONT', 'MAP_HEADER_ROUTE_216', 'MAP_HEADER_ROUTE_217', 'MAP_HEADER_SNOWPOINT_CITY']
    .map(worldArea);
  const snowBottom = Math.max(...snow.map(candidate => verticalBounds(candidate).max));
  const route211Top = verticalBounds(worldArea('MAP_HEADER_ROUTE_211_WEST')).min;
  assert.ok(route211Top - snowBottom > 0 && route211Top - snowBottom < 600);
});
