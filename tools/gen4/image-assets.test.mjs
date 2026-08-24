import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { traceAlphaRegions } from './alpha-outline.mjs';
import { decodeGen4IndexedItemSprite, normalizeGen4ItemSprite, normalizeGen4PokemonSprite } from './image-assets.mjs';
import { maskCoveredAlpha, orderWorldPlacements } from './layered-world.mjs';
import { renderGroupsForMatrix } from './render-layout.mjs';

test('Generation IV sprite strips become transparent vertical animation frames', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gen4-sprite-'));
  try {
    const source = path.join(root, 'source.png'), target = path.join(root, 'target.png');
    const pixels = Buffer.alloc(8 * 4 * 3, 210);
    const set = (x, y, color) => color.forEach((value, channel) => { pixels[(y * 8 + x) * 3 + channel] = value; });
    set(1, 1, [20, 80, 140]);
    set(6, 2, [180, 60, 30]);
    await sharp(pixels, { raw: { width: 8, height: 4, channels: 3 } }).png().toFile(source);
    await normalizeGen4PokemonSprite(source, target);
    const { data, info } = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual({ width: info.width, height: info.height }, { width: 4, height: 8 });
    assert.deepEqual([...data.subarray((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)], [20, 80, 140, 255]);
    assert.deepEqual([...data.subarray((6 * 4 + 2) * 4, (6 * 4 + 2) * 4 + 4)], [180, 60, 30, 255]);
    assert.equal(data[3], 0);
    assert.equal(data[(7 * 4 + 3) * 4 + 3], 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Generation IV item sprites remove only the border-connected background', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gen4-item-sprite-'));
  try {
    const source = path.join(root, 'source.png'), target = path.join(root, 'target.png');
    const pixels = Buffer.alloc(4 * 4 * 3, 240);
    const set = (x, y, color) => color.forEach((value, channel) => { pixels[(y * 4 + x) * 3 + channel] = value; });
    set(1, 1, [30, 90, 150]);
    set(2, 1, [30, 90, 150]);
    set(1, 2, [30, 90, 150]);
    await sharp(pixels, { raw: { width: 4, height: 4, channels: 3 } }).png().toFile(source);

    await normalizeGen4ItemSprite(source, target);

    const { data } = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(data[3], 0);
    assert.deepEqual([...data.subarray((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)], [30, 90, 150, 255]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Diamond and Pearl indexed item graphics use their paired source palette', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gen4-indexed-item-'));
  try {
    const graphics = Buffer.alloc(0x30 + 512), palette = Buffer.alloc(0x28 + 32);
    graphics.write('RGCN'); graphics.write('RAHC', 0x10); graphics.writeUInt32LE(3, 0x1c); graphics.writeUInt32LE(512, 0x28);
    graphics[0x30] = 0x21;
    palette.write('RLCN'); palette.write('TTLP', 0x10); palette.writeUInt16LE(0x001f, 0x28 + 2); palette.writeUInt16LE(0x03e0, 0x28 + 4);
    const graphicsFile = path.join(root, 'item.NCGR'), paletteFile = path.join(root, 'item.NCLR'), target = path.join(root, 'item.png');
    await fs.writeFile(graphicsFile, graphics); await fs.writeFile(paletteFile, palette);

    await decodeGen4IndexedItemSprite(graphicsFile, paletteFile, target);

    const { data, info } = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual({ width: info.width, height: info.height }, { width: 32, height: 32 });
    assert.deepEqual([...data.subarray(0, 8)], [255, 0, 0, 255, 0, 255, 0, 255]);
    assert.equal(data[2 * 4 + 3], 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('installed Generation IV item sprites decode with transparent borders', async () => {
  for (const packageId of ['dp', 'platinum']) {
    const directory = new URL(`../../PokemonFieldGuide/wwwroot/games/${packageId}/sprites/items/`, import.meta.url);
    for (const fileName of await fs.readdir(directory)) {
      const source = fileURLToPath(new URL(fileName, directory));
      const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const borderAlpha = [];
      for (let x = 0; x < info.width; x++) {
        borderAlpha.push(data[(x * 4) + 3]);
        borderAlpha.push(data[((info.height - 1) * info.width + x) * 4 + 3]);
      }
      for (let y = 1; y < info.height - 1; y++) {
        borderAlpha.push(data[(y * info.width) * 4 + 3]);
        borderAlpha.push(data[(y * info.width + info.width - 1) * 4 + 3]);
      }
      assert.equal(Math.max(...borderAlpha), 0, `${packageId}/${fileName} has an opaque border pixel`);
    }
  }
});

test('alpha regions follow visible overhang instead of the image rectangle', () => {
  const width = 8, height = 6, pixels = Buffer.alloc(width * height * 4);
  const fill = (left, top, right, bottom) => {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) pixels[(y * width + x) * 4 + 3] = 255;
  };
  fill(0, 2, 8, 6);
  fill(2, 0, 5, 2);

  const [region] = traceAlphaRegions(pixels, width, height, { blockSize: 1, minComponentPixels: 1, simplifyTolerance: 0 });

  assert.deepEqual(region, [
    { x: 2, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2 }, { x: 8, y: 2 },
    { x: 8, y: 6 }, { x: 0, y: 6 }, { x: 0, y: 2 }, { x: 2, y: 2 }
  ]);
});

test('world layer overrides preserve a northern building above its southern route', () => {
  const placements = [
    { header: 'NORTHERN_BUILDING', minCellX: 0, minCellZ: 1 },
    { header: 'OTHER_AREA', minCellX: 1, minCellZ: 1 },
    { header: 'SOUTHERN_ROUTE', minCellX: 0, minCellZ: 2 }
  ];

  const ordered = orderWorldPlacements(placements, [
    { background: 'SOUTHERN_ROUTE', foreground: 'NORTHERN_BUILDING' }
  ]);

  assert.deepEqual(ordered.map(placement => placement.header), ['OTHER_AREA', 'SOUTHERN_ROUTE', 'NORTHERN_BUILDING']);
});

test('world contours exclude pixels owned by foreground layers', () => {
  const background = { data: Buffer.alloc(3 * 2, 255), width: 3, height: 2, x: 0, y: 0 };
  const foreground = { data: Buffer.from([255, 255]), width: 2, height: 1, x: 1, y: 1 };

  assert.deepEqual([...maskCoveredAlpha(background, [foreground])], [255, 255, 255, 255, 0, 0]);
});

test('the main Sinnoh render groups declared areas and drops EVERYWHERE cells', () => {
  const groups = renderGroupsForMatrix({ id: 0, cells: [
    { x: 0, z: 0, header: null },
    { x: 1, z: 0, header: 'HEARTHOME' },
    { x: 2, z: 0, header: 'HEARTHOME' },
    { x: 1, z: 1, header: 'HEARTHOME' },
    { x: 2, z: 1, header: 'HEARTHOME' },
    { x: 3, z: 1, header: 'ROUTE_209' }
  ] });
  assert.deepEqual(groups.map(group => [group.header, group.cells.length]), [['HEARTHOME', 4], ['ROUTE_209', 1]]);
  assert.equal(groups.flatMap(group => group.cells).some(cell => cell.header === null), false);
});
