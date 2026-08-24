import fs from 'node:fs/promises';
import sharp from 'sharp';

import { questionMarkSpritePng } from '../package-finalization/assets.mjs';

function clearBorderBackground(data, width, height, top) {
  const counts = new Map();
  const key = pixel => `${data[pixel]},${data[pixel + 1]},${data[pixel + 2]},${data[pixel + 3]}`;
  const count = (x, y) => {
    const value = key(((top + y) * width + x) * 4);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  };
  for (let x = 0; x < width; x++) { count(x, 0); count(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { count(0, y); count(width - 1, y); }
  const background = [...counts].sort((left, right) => right[1] - left[1])[0][0];
  const seen = new Uint8Array(width * height), queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const local = y * width + x, pixel = ((top + y) * width + x) * 4;
    if (seen[local] || key(pixel) !== background) return;
    seen[local] = 1;
    queue.push(local);
  };
  for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y); }
  for (let index = 0; index < queue.length; index++) {
    const local = queue[index], x = local % width, y = Math.floor(local / width);
    data[((top + y) * width + x) * 4 + 3] = 0;
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
}

export async function normalizeGen4PokemonSprite(source, target) {
  const { data: sourceData, info } = await sharp(source).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== info.height * 2) throw new Error(`Expected a two-frame horizontal Generation IV sprite, found ${info.width}x${info.height}.`);
  const frameSize = info.height;
  const vertical = Buffer.alloc(frameSize * frameSize * 2 * 4);
  for (let frame = 0; frame < 2; frame++) for (let y = 0; y < frameSize; y++) {
    const sourceStart = (y * info.width + frame * frameSize) * 4;
    const targetStart = ((frame * frameSize + y) * frameSize) * 4;
    sourceData.copy(vertical, targetStart, sourceStart, sourceStart + frameSize * 4);
  }
  clearBorderBackground(vertical, frameSize, frameSize, 0);
  clearBorderBackground(vertical, frameSize, frameSize, frameSize);
  await sharp(vertical, { raw: { width: frameSize, height: frameSize * 2, channels: 4 } }).png().toFile(target);
}

export async function normalizeGen4ItemSprite(source, target) {
  const { data, info } = await sharp(source).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  clearBorderBackground(data, info.width, info.height, 0);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(target);
}

export async function decodeGen4IndexedItemSprite(graphicsSource, paletteSource, target) {
  const [graphics, palette] = await Promise.all([fs.readFile(graphicsSource), fs.readFile(paletteSource)]);
  if (graphics.subarray(0, 4).toString('ascii') !== 'RGCN' || graphics.subarray(0x10, 0x14).toString('ascii') !== 'RAHC') {
    throw new Error(`Expected Nintendo DS NCGR item graphics in ${graphicsSource}.`);
  }
  if (palette.subarray(0, 4).toString('ascii') !== 'RLCN' || palette.subarray(0x10, 0x14).toString('ascii') !== 'TTLP') {
    throw new Error(`Expected Nintendo DS NCLR item palette in ${paletteSource}.`);
  }
  const bitDepth = graphics.readUInt32LE(0x1c), dataSize = graphics.readUInt32LE(0x28);
  if (bitDepth !== 3 || dataSize !== 512 || graphics.length < 0x30 + dataSize || palette.length < 0x28 + 32) {
    throw new Error(`Expected 32x32 four-bit Nintendo DS item graphics in ${graphicsSource}.`);
  }
  const colors = Array.from({ length: 16 }, (_, index) => {
    const value = palette.readUInt16LE(0x28 + index * 2);
    const expand = channel => Math.floor(channel * 255 / 31);
    return [expand(value & 0x1f), expand((value >> 5) & 0x1f), expand((value >> 10) & 0x1f), index === 0 ? 0 : 255];
  });
  const rgba = Buffer.alloc(32 * 32 * 4);
  for (let tile = 0; tile < 16; tile++) for (let tileY = 0; tileY < 8; tileY++) for (let pairX = 0; pairX < 4; pairX++) {
    const packed = graphics[0x30 + tile * 32 + tileY * 4 + pairX];
    for (let half = 0; half < 2; half++) {
      const color = colors[(packed >> (half * 4)) & 0x0f];
      const x = (tile % 4) * 8 + pairX * 2 + half, y = Math.floor(tile / 4) * 8 + tileY;
      for (let channel = 0; channel < 4; channel++) rgba[(y * 32 + x) * 4 + channel] = color[channel];
    }
  }
  await sharp(rgba, { raw: { width: 32, height: 32, channels: 4 } }).png().toFile(target);
}

export const createGen4FallbackSprite = () => questionMarkSpritePng(sharp);
