import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkPackages, generatePackage } from './package-finalization/index.mjs';

const png = Buffer.from('89504e470d0a1a0a', 'hex');

async function fixture() {
  const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'field-guide-finalization-'));
  await fs.mkdir(path.join(webRoot, 'games'), { recursive: true });
  await fs.writeFile(path.join(webRoot, 'games/catalog.json'), JSON.stringify({
    defaultGameId: 'test',
    games: [{
      id: 'test', rules: 'test', name: 'Test', shortName: 'Test',
      dataPath: 'games/test/data/fieldguide.json',
      pokedexPath: 'games/test/data/pokedex.json',
      worldsPath: 'games/test/data/worlds.json',
      pokemonSpritePath: 'games/test/sprites/pokemon',
      itemSpritePath: 'games/test/sprites/items',
      defaultAreaId: 'AREA_OUTDOOR', defaultWorldId: 'test-world',
      validateWorldReachability: true,
      versions: [{ id: 'Test', name: 'Test', progressVersion: 1 }],
      regions: [{ id: 'Test', name: 'Test', worldId: 'test-world' }],
      dexModes: [{ id: 'Regional', name: 'Regional', regional: true }]
    }]
  }));
  return webRoot;
}

async function validDraft(assets) {
  const areaMap = await assets.map('AREA_OUTDOOR.png', target => fs.writeFile(target, png));
  const worldMap = await assets.map('WORLD_TEST.png', target => fs.writeFile(target, png));
  const pokemonFallback = await assets.pokemonSprite('question_mark.png', target => fs.writeFile(target, png));
  const pokemon = await assets.pokemonSprite('test.png', target => fs.writeFile(target, png));
  const itemFallback = await assets.itemSprite('question_mark.png', target => fs.writeFile(target, png));

  return {
    source: 'fixture',
    generated: '2026-08-20',
    areas: [{
      id: 'AREA_OUTDOOR', name: 'Outdoor', region: 'Test', mapImage: areaMap,
      mapWidth: 16, mapHeight: 16,
      encounters: [{ species: 'Test', speciesId: 'SPECIES_TEST', minLevel: 2, maxLevel: 2, chance: 100, method: 'Grass', version: 'Both' }],
      items: [{ id: 'AREA_OUTDOOR:item:0', name: 'Item', kind: 'Visible', icon: itemFallback, x: 0, y: 0, quantity: 1 }],
      specialPokemon: [], entrances: []
    }],
    worlds: [{ id: 'test-world', image: worldMap, width: 16, height: 16, maps: [{ id: 'AREA_OUTDOOR', x: 0, y: 0, width: 16, height: 16 }] }],
    pokedex: [{ number: 1, regionalNumber: 1, name: 'Test', speciesId: 'SPECIES_TEST', availability: { Test: 'Obtainable' } }],
    pokemonSprites: { SPECIES_TEST: pokemon },
    embeddedPokemon: [],
    pokemonFallback
  };
}

test('generates a complete package and checks the installed result', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));
  const packageRoot = path.join(webRoot, 'games/test');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'stale.txt'), 'remove me');

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      await assets.map('UNUSED.png', target => fs.writeFile(target, png));
      return draft;
    }
  });

  const report = await checkPackages({ webRoot });
  assert.deepEqual(report.map(result => result.gameId), ['test']);

  assert.equal(JSON.parse(await fs.readFile(path.join(packageRoot, 'data/fieldguide.json'))).areas.length, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(packageRoot, 'data/package-manifest.json'))).pokemonSprites.SPECIES_TEST, 'test.png');
  await assert.rejects(fs.stat(path.join(packageRoot, 'maps/UNUSED.png')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(packageRoot, 'stale.txt')), { code: 'ENOENT' });
});

test('rejects a relevant interior that no world marker can open', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));
  await generatePackage({ gameId: 'test', webRoot, build: async ({ assets }) => validDraft(assets) });

  const fieldGuidePath = path.join(webRoot, 'games/test/data/fieldguide.json');
  const fieldGuide = JSON.parse(await fs.readFile(fieldGuidePath));
  fieldGuide.areas.push({
    id: 'BACK_ONLY', name: 'Back Only', region: 'Test', mapImage: fieldGuide.areas[0].mapImage,
    mapWidth: 16, mapHeight: 16, encounters: [],
    items: [{ id: 'BACK_ONLY:item', name: 'Item', kind: 'Visible', icon: 'question_mark.png', x: 0, y: 0, quantity: 1 }],
    specialPokemon: [], entrances: [{ id: 'BACK_ONLY:out', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 }]
  });
  await fs.writeFile(fieldGuidePath, JSON.stringify(fieldGuide));

  await assert.rejects(checkPackages({ webRoot }), /BACK_ONLY.*not navigable|not navigable.*BACK_ONLY/i);
});

test('retains an empty junction instead of guessing among relevant targets', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas.push(
        { id: 'JUNCTION', name: 'Junction', region: 'Test', mapImage: draft.areas[0].mapImage, mapWidth: 16, mapHeight: 16, encounters: [], items: [], specialPokemon: [], entrances: [
          { id: 'JUNCTION:warp:0', targetId: 'TARGET_A', name: 'A', x: 0, y: 0 },
          { id: 'JUNCTION:warp:1', targetId: 'TARGET_B', name: 'B', x: 1, y: 0 }
        ] },
        { id: 'TARGET_A', name: 'A', region: 'Test', mapImage: draft.areas[0].mapImage, mapWidth: 16, mapHeight: 16, encounters: [], items: [{ id: 'A:item', name: 'A', kind: 'Visible', icon: draft.areas[0].items[0].icon, x: 0, y: 0, quantity: 1 }], specialPokemon: [], entrances: [{ id: 'TARGET_A:junction', targetId: 'JUNCTION', name: 'Junction', x: 0, y: 0 }] },
        { id: 'TARGET_B', name: 'B', region: 'Test', mapImage: draft.areas[0].mapImage, mapWidth: 16, mapHeight: 16, encounters: [], items: [{ id: 'B:item', name: 'B', kind: 'Visible', icon: draft.areas[0].items[0].icon, x: 0, y: 0, quantity: 1 }], specialPokemon: [], entrances: [{ id: 'TARGET_B:junction', targetId: 'JUNCTION', name: 'Junction', x: 0, y: 0 }] }
      );
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:warp:0', targetId: 'JUNCTION', name: 'Junction', x: 0, y: 0 });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert.equal(fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR').entrances[0].targetId, 'JUNCTION');
  assert.deepEqual(fieldGuide.areas.find(area => area.id === 'JUNCTION').entrances.map(entrance => entrance.targetId), ['TARGET_A', 'TARGET_B']);
});

test('retains a junction when relevant branches have different lengths', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      const mapImage = draft.areas[0].mapImage, icon = draft.areas[0].items[0].icon;
      const empty = (id, entrances) => ({ id, name: id, region: 'Test', mapImage, mapWidth: 16, mapHeight: 16, encounters: [], items: [], specialPokemon: [], entrances });
      const target = (id, entrances) => ({ ...empty(id, entrances), items: [{ id: `${id}:item`, name: 'Item', kind: 'Visible', icon, x: 0, y: 0, quantity: 1 }] });
      draft.areas.push(
        empty('JUNCTION', [
          { id: 'JUNCTION:near', targetId: 'TARGET_NEAR', name: 'Near', x: 0, y: 0 },
          { id: 'JUNCTION:path', targetId: 'PATH_1', name: 'Path', x: 1, y: 0 }
        ]),
        empty('PATH_1', [
          { id: 'PATH_1:junction', targetId: 'JUNCTION', name: 'Junction', x: 0, y: 0 },
          { id: 'PATH_1:path', targetId: 'PATH_2', name: 'Path', x: 1, y: 0 }
        ]),
        empty('PATH_2', [
          { id: 'PATH_2:path', targetId: 'PATH_1', name: 'Path', x: 0, y: 0 },
          { id: 'PATH_2:far', targetId: 'TARGET_FAR', name: 'Far', x: 1, y: 0 }
        ]),
        target('TARGET_NEAR', [{ id: 'TARGET_NEAR:junction', targetId: 'JUNCTION', name: 'Junction', x: 0, y: 0 }]),
        target('TARGET_FAR', [{ id: 'TARGET_FAR:path', targetId: 'PATH_2', name: 'Path', x: 0, y: 0 }])
      );
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:junction', targetId: 'JUNCTION', name: 'Junction', x: 0, y: 0 });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert.equal(fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR').entrances[0].targetId, 'JUNCTION');
  assert.deepEqual(fieldGuide.areas.find(area => area.id === 'JUNCTION').entrances.map(entrance => entrance.targetId), ['TARGET_NEAR', 'TARGET_FAR']);
});

test('rejects a relevant area without a rendered map', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas[0].mapImage = null;
      return draft;
    }
  }), /expected a registered map asset reference/i);
});

test('rejects a cropped world placement without marker offsets', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.worlds[0].maps[0].width = 8;
      return draft;
    }
  }), /cropped placement.*marker offsets/i);
});

test('rejects a visible marker outside its cropped world placement', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas[0].mapWidth = 32;
      Object.assign(draft.worlds[0].maps[0], { markerOffsetX: 1, markerOffsetY: 0 });
      return draft;
    }
  }), /visible marker.*outside.*placement/i);
});

test('ignores missing targets in disconnected discarded draft areas', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas.push({
        id: 'DISCARDED', name: 'Discarded', region: 'Test', mapImage: null,
        mapWidth: 0, mapHeight: 0, encounters: [], items: [], specialPokemon: [],
        entrances: [{ id: 'DISCARDED:warp:0', targetId: 'MISSING', name: 'Missing', x: 0, y: 0 }]
      });
      return draft;
    }
  });

  assert.equal(JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json'))).areas.length, 1);
});

test('omits an entrance whose valid chain contains no guide data', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas.push({
        id: 'EMPTY', name: 'Empty', region: 'Test', mapImage: null,
        mapWidth: 0, mapHeight: 0, encounters: [], items: [], specialPokemon: [], entrances: []
      });
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:warp:0', targetId: 'EMPTY', name: 'Empty', x: 0, y: 0 });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert.deepEqual(fieldGuide.areas[0].entrances, []);
});

test('omits an entrance that loops back to its source area', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:warp:0', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert.deepEqual(fieldGuide.areas[0].entrances, []);
});

test('rejects a missing branch beside a valid contraction target', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas.push(
        {
          id: 'JUNCTION', name: 'Junction', region: 'Test', mapImage: null,
          mapWidth: 0, mapHeight: 0, encounters: [], items: [], specialPokemon: [], entrances: [
            { id: 'JUNCTION:warp:0', targetId: 'TARGET', name: 'Target', x: 0, y: 0 },
            { id: 'JUNCTION:warp:1', targetId: 'MISSING', name: 'Missing', x: 1, y: 0 }
          ]
        },
        {
          id: 'TARGET', name: 'Target', region: 'Test', mapImage: draft.areas[0].mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [],
          items: [{ id: 'TARGET:item', name: 'Item', kind: 'Visible', icon: draft.areas[0].items[0].icon, x: 0, y: 0, quantity: 1 }],
          specialPokemon: [], entrances: []
        }
      );
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:warp:0', targetId: 'JUNCTION', name: 'Junction', x: 0, y: 0 });
      return draft;
    }
  }), /reached missing area MISSING/i);
});

test('leaves the installed package unchanged when a build fails', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));
  const packageRoot = path.join(webRoot, 'games/test');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'sentinel.txt'), 'old package');

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot,
    build: async () => { throw new Error('source audit failed'); }
  }), /source audit failed/);

  assert.equal(await fs.readFile(path.join(packageRoot, 'sentinel.txt'), 'utf8'), 'old package');
});

test('leaves the installed package unchanged when draft finalization fails', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));
  const packageRoot = path.join(webRoot, 'games/test');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'sentinel.txt'), 'old package');

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas[0].mapImage = null;
      return draft;
    }
  }), /expected a registered map asset reference/i);

  assert.equal(await fs.readFile(path.join(packageRoot, 'sentinel.txt'), 'utf8'), 'old package');
});
