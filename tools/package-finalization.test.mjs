import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkPackages, formatPackageReport, generatePackage } from './package-finalization/index.mjs';

const png = Buffer.from('89504e470d0a1a0a', 'hex');

async function fixture() {
  const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'field-guide-finalization-'));
  await fs.mkdir(path.join(webRoot, 'games'), { recursive: true });
  await fs.writeFile(path.join(webRoot, 'games/catalog.json'), JSON.stringify({
    defaultGameId: 'test',
    games: [{
      id: 'test', name: 'Test', shortName: 'Test', pageTitle: 'Test',
      atlasTitle: 'Test', loadingLabel: 'LOADING TEST',
      dataPath: 'games/test/data/fieldguide.json',
      pokedexPath: 'games/test/data/pokedex.json',
      worldsPath: 'games/test/data/worlds.json',
      pokemonSpritePath: 'games/test/sprites/pokemon',
      itemSpritePath: 'games/test/sprites/items',
      defaultAreaId: 'AREA_OUTDOOR', defaultWorldId: 'test-world',
      versions: [{ id: 'Test', name: 'Test', progressVersion: 1, accent: '#000000', accentSoft: '#111111' }],
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
      encounters: [{ species: 'Test', speciesId: 'SPECIES_TEST', minLevel: 2, maxLevel: 2, chance: 100, method: 'Grass', type: 'Random', version: 'Both' }],
      items: [{ id: 'AREA_OUTDOOR:item:0', name: 'Item', kind: 'Visible', icon: itemFallback, x: 0, y: 0, quantity: 1 }],
      resources: [{ name: 'Berry', kind: 'Daily fruit tree', x: 0, y: 0 }],
      specialPokemon: [], entrances: []
    }],
    worlds: [{ id: 'test-world', image: worldMap, width: 16, height: 16, maps: [{ id: 'AREA_OUTDOOR', x: 0, y: 0, width: 16, height: 16 }] }],
    pokedex: [{ number: 1, regionalNumber: 1, name: 'Test', speciesId: 'SPECIES_TEST', availability: { Test: 'Obtainable' } }],
    pokemonSprites: { SPECIES_TEST: pokemon },
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
  assert.equal(formatPackageReport(report[0]), 'Generated Test: 1 area, 1 encounter, 1 item, and 0 special Pokémon.');

  const fieldGuide = JSON.parse(await fs.readFile(path.join(packageRoot, 'data/fieldguide.json')));
  assert.equal(fieldGuide.areas.length, 1);
  assert.deepEqual(fieldGuide.areas[0].resources, [{ name: 'Berry', kind: 'Daily fruit tree', x: 0, y: 0 }]);
  assert.equal(JSON.parse(await fs.readFile(path.join(packageRoot, 'data/package-manifest.json'))).pokemonSprites.SPECIES_TEST, 'test.png');
  await assert.rejects(fs.stat(path.join(packageRoot, 'maps/UNUSED.png')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(packageRoot, 'stale.txt')), { code: 'ENOENT' });
});

test('keeps conditional encounter tables and version-specific sprites independent', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas[0].encounters = [
        { ...draft.areas[0].encounters[0], condition: 'Morning' },
        { ...draft.areas[0].encounters[0], species: 'Night Test', speciesId: 'SPECIES_NIGHT_TEST', condition: 'Night' }
      ];
      draft.pokedex.push({ number: 2, regionalNumber: 2, name: 'Night Test', speciesId: 'SPECIES_NIGHT_TEST', availability: { Test: 'Obtainable' } });
      const nightSprite = await assets.pokemonSprite('night.png', target => fs.writeFile(target, png));
      const versionSprite = await assets.pokemonSprite('test-version.png', target => fs.writeFile(target, png));
      draft.pokemonSprites.SPECIES_NIGHT_TEST = nightSprite;
      draft.pokemonSpritesByVersion = { Test: { SPECIES_TEST: versionSprite } };
      return draft;
    }
  });

  const packageRoot = path.join(webRoot, 'games/test');
  const fieldGuide = JSON.parse(await fs.readFile(path.join(packageRoot, 'data/fieldguide.json')));
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'data/package-manifest.json')));
  assert.deepEqual(fieldGuide.areas[0].encounters.map(encounter => encounter.condition), ['Morning', 'Night']);
  assert.equal(manifest.pokemonSpritesByVersion.Test.SPECIES_TEST, 'test-version.png');
  assert.equal((await fs.stat(path.join(packageRoot, 'sprites/pokemon/test-version.png'))).isFile(), true);
});

test('retains an empty map explicitly included in navigation', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:nav', targetId: 'NAVIGATION_MAP', name: 'Navigation Map', x: 0, y: 0 });
      draft.areas.push({
        id: 'NAVIGATION_MAP', name: 'Navigation Map', region: 'Test', mapImage: draft.areas[0].mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], items: [], specialPokemon: [], includeInNavigation: true,
        entrances: [{ id: 'NAVIGATION_MAP:out', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 }]
      });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert.equal(fieldGuide.areas.find(area => area.id === 'NAVIGATION_MAP').includeInNavigation, true);
});

test('retains a connected area whose only guide content is a renewable resource', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:grove', targetId: 'GROVE', name: 'Grove', x: 0, y: 0 });
      draft.areas.push({
        id: 'GROVE', name: 'Grove', region: 'Test', mapImage: draft.areas[0].mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], items: [],
        resources: [{ name: 'Berry', kind: 'Daily fruit tree', x: 0, y: 0 }], specialPokemon: [],
        entrances: [{ id: 'GROVE:out', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 }]
      });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert.deepEqual(fieldGuide.areas.map(area => area.id), ['AREA_OUTDOOR', 'GROVE']);
});

test('rejects a resource pool that mixes weighted and conditional rewards', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas[0].resources = [{
        name: 'Mixed prize', kind: 'Repeatable challenge', x: 0, y: 0,
        rewards: [
          { name: 'Weighted', quantity: 1, weight: 1 },
          { name: 'Conditional', quantity: 1, comment: 'First place.' }
        ]
      }];
      return draft;
    }
  }), /mixes weighted and conditional rewards/i);
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

  await assert.rejects(checkPackages({ webRoot }), /not reachable from a world warp.*BACK_ONLY/i);
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

test('retains an empty boundary that owns a version-specific entrance', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets), mapImage = draft.areas[0].mapImage;
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:hall', targetId: 'HALL', name: 'Hall', x: 0, y: 0 });
      draft.areas.push(
        {
          id: 'HALL', name: 'Hall', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], items: [], resources: [], specialPokemon: [],
          entrances: [{ id: 'HALL:room', targetId: 'ROOM', name: 'Room', x: 0, y: 0, version: 'Test' }]
        },
        {
          id: 'ROOM', name: 'Room', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], resources: [], specialPokemon: [], entrances: [],
          items: [{ id: 'ROOM:item', name: 'Item', kind: 'Visible', icon: draft.areas[0].items[0].icon, x: 0, y: 0, quantity: 1 }]
        }
      );
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  const hall = fieldGuide.areas.find(area => area.id === 'HALL');
  assert(hall);
  assert.deepEqual(hall.entrances, [{
    id: 'HALL:room', targetId: 'ROOM', name: 'Room', x: 0, y: 0, version: 'Test'
  }]);
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

test('rejects every disconnected draft area before contraction', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      draft.areas.push({
        id: 'DISCONNECTED', name: 'Disconnected', region: 'Test', mapImage: draft.areas[0].mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], items: [], specialPokemon: [],
        entrances: [{ id: 'DISCONNECTED:warp:0', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 }]
      });
      return draft;
    }
  }), /draft areas are not reachable from a world warp.*DISCONNECTED/i);
});

test('rejects every disconnected retained area after contraction', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));
  await generatePackage({ gameId: 'test', webRoot, build: async ({ assets }) => validDraft(assets) });

  const fieldGuidePath = path.join(webRoot, 'games/test/data/fieldguide.json');
  const fieldGuide = JSON.parse(await fs.readFile(fieldGuidePath));
  fieldGuide.areas.push({
    id: 'DISCONNECTED', name: 'Disconnected', region: 'Test', mapImage: fieldGuide.areas[0].mapImage,
    mapWidth: 16, mapHeight: 16, encounters: [], items: [], specialPokemon: [], entrances: []
  });
  await fs.writeFile(fieldGuidePath, JSON.stringify(fieldGuide));

  await assert.rejects(checkPackages({ webRoot }), /final areas are not reachable from a world warp.*DISCONNECTED/i);
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
  }), /targets missing area MISSING/i);
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

test('writes manifest v3 and retains version-specific area maps', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      const versionMap = await assets.map('AREA_TEST.png', target => fs.writeFile(target, png));
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:room', name: 'Room', targetId: 'ROOM', x: 0, y: 0 });
      draft.areas.push({
        id: 'ROOM', name: 'Room', region: 'Test', mapImage: draft.areas[0].mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], items: [], specialPokemon: [], includeInNavigation: true,
        entrances: [{ id: 'ROOM:out', name: 'Outdoor', targetId: 'AREA_OUTDOOR', x: 0, y: 0 }]
      });
      draft.areaMapsByVersion = {
        Test: { ROOM: { image: versionMap, width: 32, height: 48 } }
      };
      return draft;
    }
  });

  const packageRoot = path.join(webRoot, 'games/test');
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'data/package-manifest.json')));
  assert.equal(manifest.formatVersion, 3);
  assert.deepEqual(manifest.areaMapsByVersion.Test.ROOM, {
    image: 'games/test/maps/AREA_TEST.png', width: 32, height: 48
  });
  assert.equal((await fs.stat(path.join(packageRoot, 'maps/AREA_TEST.png'))).isFile(), true);
});

test('retains transport destinations without contracting them into entrances', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      const hiddenWorld = await assets.map('WORLD_HIDDEN.png', target => fs.writeFile(target, png));
      draft.areas[0].transports = [{
        id: 'AREA_OUTDOOR:ferry', name: 'Ferry', x: 0, y: 0,
        destinations: [{ id: 'frontier', name: 'Frontier', targetId: 'FRONTIER', version: 'Both', requirement: 'Invitation' }]
      }];
      draft.areas.push({
        id: 'FRONTIER', name: 'Frontier', region: 'Test', mapImage: draft.areas[0].mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], items: [], specialPokemon: [], entrances: [],
        transports: [{ id: 'FRONTIER:return', name: 'Return ferry', x: 0, y: 0,
          destinations: [{ id: 'return', name: 'Outdoor', targetId: 'AREA_OUTDOOR', version: 'Both' }] }],
        includeInNavigation: true
      });
      draft.worlds.push({ id: 'hidden-world', name: 'Frontier', image: hiddenWorld, width: 16, height: 16,
        maps: [{ id: 'FRONTIER', x: 0, y: 0, width: 16, height: 16 }] });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert.deepEqual(fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR').entrances, []);
  assert.equal(fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR').transports[0].destinations[0].targetId, 'FRONTIER');
});

test('promotes a transport-only interior to its unique outdoor entrance', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      const mapImage = draft.areas[0].mapImage;
      draft.areas[0].entrances.push({
        id: 'AREA_OUTDOOR:harbor', targetId: 'HARBOR', name: 'Harbor', x: 0, y: 0
      });
      draft.areas.push(
        {
          id: 'HARBOR', name: 'Harbor', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], items: [], resources: [], specialPokemon: [],
          entrances: [{ id: 'HARBOR:out', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 }],
          transports: [{
            id: 'HARBOR:ferry', name: 'Ferry', x: 0, y: 0,
            destinations: [{ id: 'island', name: 'Island', targetId: 'ISLAND', version: 'Both' }]
          }]
        },
        {
          id: 'ISLAND', name: 'Island', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [],
          items: [{ id: 'ISLAND:item', name: 'Item', kind: 'Visible', icon: draft.areas[0].items[0].icon, x: 0, y: 0, quantity: 1 }],
          resources: [], specialPokemon: [], entrances: []
        }
      );
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  const outdoor = fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR');
  assert.equal(fieldGuide.areas.some(area => area.id === 'HARBOR'), false);
  assert.deepEqual(outdoor.entrances, []);
  assert.deepEqual(outdoor.transports, [{
    id: 'HARBOR:ferry', name: 'Ferry', x: 0, y: 0,
    destinations: [{ id: 'island', name: 'Island', targetId: 'ISLAND', version: 'Both' }]
  }]);
});

test('promotes a transport-only interior through an empty entrance chain', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets), mapImage = draft.areas[0].mapImage;
      draft.areas[0].entrances.push({
        id: 'AREA_OUTDOOR:terminal', targetId: 'TERMINAL', name: 'Terminal', x: 0, y: 0
      });
      draft.areas.push(
        {
          id: 'TERMINAL', name: 'Terminal', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], items: [], resources: [], specialPokemon: [],
          entrances: [
            { id: 'TERMINAL:out', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 },
            { id: 'TERMINAL:harbor', targetId: 'HARBOR', name: 'Harbor', x: 0, y: 0 }
          ]
        },
        {
          id: 'HARBOR', name: 'Harbor', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], items: [], resources: [], specialPokemon: [],
          entrances: [{ id: 'HARBOR:terminal', targetId: 'TERMINAL', name: 'Terminal', x: 0, y: 0 }],
          transports: [{
            id: 'HARBOR:ferry', name: 'Ferry', x: 0, y: 0,
            destinations: [{ id: 'island', name: 'Island', targetId: 'ISLAND', version: 'Both' }]
          }]
        },
        {
          id: 'ISLAND', name: 'Island', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], resources: [], specialPokemon: [], entrances: [],
          items: [{ id: 'ISLAND:item', name: 'Item', kind: 'Visible', icon: draft.areas[0].items[0].icon, x: 0, y: 0, quantity: 1 }]
        }
      );
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  const outdoor = fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR');
  assert.equal(fieldGuide.areas.some(area => area.id === 'TERMINAL' || area.id === 'HARBOR'), false);
  assert.equal(outdoor.entrances.length, 0);
  assert.equal(outdoor.transports[0].id, 'HARBOR:ferry');
});

test('does not promote a transport host that reaches content through an empty chain', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets), mapImage = draft.areas[0].mapImage;
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:harbor', targetId: 'HARBOR', name: 'Harbor', x: 0, y: 0 });
      draft.areas.push(
        {
          id: 'HARBOR', name: 'Harbor', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], items: [], resources: [], specialPokemon: [],
          entrances: [
            { id: 'HARBOR:out', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 },
            { id: 'HARBOR:hall', targetId: 'HALL', name: 'Hall', x: 0, y: 0 }
          ],
          transports: [{ id: 'HARBOR:ferry', name: 'Ferry', x: 0, y: 0,
            destinations: [{ id: 'return', name: 'Outdoor', targetId: 'AREA_OUTDOOR', version: 'Both' }] }]
        },
        {
          id: 'HALL', name: 'Hall', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], items: [], resources: [], specialPokemon: [],
          entrances: [
            { id: 'HALL:harbor', targetId: 'HARBOR', name: 'Harbor', x: 0, y: 0 },
            { id: 'HALL:room', targetId: 'ROOM', name: 'Room', x: 0, y: 0 }
          ]
        },
        {
          id: 'ROOM', name: 'Room', region: 'Test', mapImage,
          mapWidth: 16, mapHeight: 16, encounters: [], resources: [], specialPokemon: [], entrances: [],
          items: [{ id: 'ROOM:item', name: 'Item', kind: 'Visible', icon: draft.areas[0].items[0].icon, x: 0, y: 0, quantity: 1 }]
        }
      );
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert(fieldGuide.areas.some(area => area.id === 'HARBOR'));
  assert.equal(fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR').transports.length, 0);
});

test('keeps a transport interior that owns checklist content', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      const mapImage = draft.areas[0].mapImage;
      draft.areas[0].entrances.push({
        id: 'AREA_OUTDOOR:harbor', targetId: 'HARBOR', name: 'Harbor', x: 0, y: 0
      });
      draft.areas.push({
        id: 'HARBOR', name: 'Harbor', region: 'Test', mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], resources: [], specialPokemon: [],
        items: [{ id: 'HARBOR:item', name: 'Ticket', kind: 'Event', icon: draft.areas[0].items[0].icon, x: -1, y: -1, quantity: 1 }],
        entrances: [{ id: 'HARBOR:out', targetId: 'AREA_OUTDOOR', name: 'Outdoor', x: 0, y: 0 }],
        transports: [{
          id: 'HARBOR:ferry', name: 'Ferry', x: 0, y: 0,
          destinations: [{ id: 'return', name: 'Outdoor', targetId: 'AREA_OUTDOOR', version: 'Both' }]
        }]
      });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert(fieldGuide.areas.some(area => area.id === 'HARBOR'));
  assert.equal(fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR').transports.length, 0);
});

test('keeps a transport-only interior with ambiguous outdoor entrances', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets), mapImage = draft.areas[0].mapImage;
      const secondOutdoor = {
        id: 'AREA_OUTDOOR_2', name: 'Second Outdoor', region: 'Test', mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], items: [], resources: [], specialPokemon: [], entrances: []
      };
      const harbor = {
        id: 'HARBOR', name: 'Harbor', region: 'Test', mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], items: [], resources: [], specialPokemon: [], entrances: [],
        transports: [{
          id: 'HARBOR:ferry', name: 'Ferry', x: 0, y: 0,
          destinations: [{ id: 'return', name: 'Outdoor', targetId: 'AREA_OUTDOOR', version: 'Both' }]
        }]
      };
      draft.areas.push(secondOutdoor, harbor);
      draft.areas[0].entrances.push({ id: 'AREA_OUTDOOR:harbor', targetId: 'HARBOR', name: 'Harbor', x: 0, y: 0 });
      secondOutdoor.entrances.push({ id: 'AREA_OUTDOOR_2:harbor', targetId: 'HARBOR', name: 'Harbor', x: 0, y: 0 });
      draft.worlds[0].width = 32;
      draft.worlds[0].maps.push({ id: 'AREA_OUTDOOR_2', x: 16, y: 0, width: 16, height: 16 });
      return draft;
    }
  });

  const fieldGuide = JSON.parse(await fs.readFile(path.join(webRoot, 'games/test/data/fieldguide.json')));
  assert(fieldGuide.areas.some(area => area.id === 'HARBOR'));
  assert.equal(fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR').transports.length, 0);
  assert.equal(fieldGuide.areas.find(area => area.id === 'AREA_OUTDOOR_2').transports.length, 0);
});

test('rejects a hidden world without an inbound transport path', async t => {
  const webRoot = await fixture();
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));

  await assert.rejects(generatePackage({
    gameId: 'test', webRoot, formatVersion: 3,
    build: async ({ assets }) => {
      const draft = await validDraft(assets);
      const hiddenWorld = await assets.map('WORLD_HIDDEN.png', target => fs.writeFile(target, png));
      draft.areas.push({
        id: 'FRONTIER', name: 'Frontier', region: 'Test', mapImage: draft.areas[0].mapImage,
        mapWidth: 16, mapHeight: 16, encounters: [], items: [], specialPokemon: [], entrances: [], includeInNavigation: true
      });
      draft.worlds.push({ id: 'hidden-world', name: 'Frontier', image: hiddenWorld, width: 16, height: 16,
        maps: [{ id: 'FRONTIER', x: 0, y: 0, width: 16, height: 16 }] });
      return draft;
    }
  }), /hidden world.*hidden-world.*inbound transport/i);
});
