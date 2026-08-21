import fs from 'node:fs';
import path from 'node:path';

import { blockPaths } from './map-layouts.mjs';

const paletteNames = new Map([
  ['GRAY', 0], ['RED', 1], ['GREEN', 2], ['WATER', 3],
  ['YELLOW', 4], ['BROWN', 5], ['ROOF', 6], ['TEXT', 7]
]);
const rgb = values => values.map(value => Math.round(value * 255 / 31));

function parseRgbPalettes(text) {
  const colors = text.split(/\r?\n/).filter(line => /^\s*RGB\s+/.test(line)).flatMap(line => {
    const values = [...line.matchAll(/\d+/g)].map(match => +match[0]);
    const parsed = [];
    for (let index = 0; index + 2 < values.length; index += 3) parsed.push(rgb(values.slice(index, index + 3)));
    return parsed;
  });
  const palettes = [];
  for (let index = 0; index + 3 < colors.length; index += 4) palettes.push(colors.slice(index, index + 4));
  return palettes;
}

function tilesetPaletteMap(read, tileset) {
  const name = tileset.toLowerCase();
  const alias = { dark_cave: 'cave' }[name] ?? name;
  return [...read(`gfx/tilesets/${alias}_palette_map.asm`).matchAll(/^\s*tilepal\s+\d+,\s*(.*)$/gm)]
    .flatMap(match => match[1].split(',').map(value => value.trim()))
    .map(value => paletteNames.get(value));
}

function environmentPaletteIndices(environment, timePalette) {
  const time = timePalette === 'PALETTE_NITE' ? 'night' : timePalette === 'PALETTE_DARK' ? 'dark' : 'day';
  const rows = {
    outdoor: { day: [8, 9, 10, 40, 12, 13, 14, 15], night: [16, 17, 18, 41, 20, 21, 22, 23], dark: [24, 25, 26, 27, 28, 29, 30, 31] },
    indoor: { day: [32, 33, 34, 35, 36, 37, 38, 7], night: [16, 17, 18, 19, 20, 21, 22, 7], dark: [24, 25, 26, 27, 28, 29, 30, 7] },
    dungeon: { day: [8, 9, 10, 11, 12, 13, 14, 15], night: [16, 17, 18, 19, 20, 21, 22, 23], dark: [24, 25, 26, 27, 28, 29, 30, 31] }
  };
  const family = ['TOWN', 'ROUTE'].includes(environment) ? 'outdoor' : ['INDOOR', 'GATE'].includes(environment) ? 'indoor' : 'dungeon';
  return rows[family][time];
}

export async function renderMaps(read, maps, assets, sharp, tilesetGraphics = new Map()) {
  const palettes = parseRgbPalettes(read('gfx/tilesets/bg_tiles.pal'));
  const roofPalettes = parseRgbPalettes(read('gfx/tilesets/roofs.pal'));
  const roofText = read('data/maps/roofs.asm');
  const roofNames = [...roofText.slice(0, roofText.indexOf('MapGroupRoofs:')).matchAll(/^\s*const\s+ROOF_([A-Z0-9_]+)/gm)]
    .map(match => match[1].toLowerCase());
  const roofGroups = [...roofText.slice(roofText.indexOf('MapGroupRoofs:'), roofText.indexOf('Roofs:')).matchAll(/^\s*db\s+(?:ROOF_([A-Z0-9_]+)|-1)/gm)]
    .map(match => match[1]?.toLowerCase() ?? null);
  const layouts = blockPaths(read), paletteCache = new Map(), roofCache = new Map();
  for (const area of maps.values()) {
    const tileName = ({ DARK_CAVE: 'cave' }[area.tileset] ?? area.tileset.toLowerCase());
    const graphicName = tilesetGraphics.get(area.tileset) ?? tileName;
    const tilePath = path.join(read.root, `gfx/tilesets/${graphicName}.png`);
    const metaPath = path.join(read.root, `data/tilesets/${tileName}_metatiles.bin`);
    const layoutPath = path.join(read.root, layouts.get(area.label) ?? `maps/${area.label}.blk`);
    if (![tilePath, metaPath, layoutPath].every(fs.existsSync)) throw new Error(`${area.id} lacks render input for ${tileName}.`);
    const { data: pixels, info } = await sharp(tilePath).greyscale().raw().toBuffer({ resolveWithObject: true });
    const metatiles = fs.readFileSync(metaPath), layout = fs.readFileSync(layoutPath);
    const paletteMap = paletteCache.get(area.tileset) ?? tilesetPaletteMap(read, area.tileset);
    paletteCache.set(area.tileset, paletteMap);
    const paletteIndices = environmentPaletteIndices(area.environment, area.timePalette);
    const roofName = roofGroups[area.group] ?? null;
    let roof = null;
    if (roofName) {
      roof = roofCache.get(roofName);
      if (!roof) {
        const roofPath = path.join(read.root, `gfx/tilesets/roofs/${roofName}.png`);
        const result = await sharp(roofPath).greyscale().raw().toBuffer({ resolveWithObject: true });
        roof = { pixels: result.data, info: result.info };
        roofCache.set(roofName, roof);
      }
      if (!roofNames.includes(roofName)) throw new Error(`${area.id} uses unknown roof '${roofName}'.`);
    }
    const groupRoofPalette = roofPalettes[area.group];
    const width = area.width * 32, height = area.height * 32, canvas = Buffer.alloc(width * height * 4);
    for (let blockY = 0; blockY < area.height; blockY++) for (let blockX = 0; blockX < area.width; blockX++) {
      const block = layout[blockY * area.width + blockX] ?? 0;
      for (let tileY = 0; tileY < 4; tileY++) for (let tileX = 0; tileX < 4; tileX++) {
        const tile = metatiles[block * 16 + tileY * 4 + tileX] ?? 0;
        const paletteKind = paletteMap[tile] ?? 0;
        const palette = palettes[paletteIndices[paletteKind]].map(color => [...color]);
        if (groupRoofPalette && paletteKind === paletteNames.get('ROOF')) {
          const offset = area.timePalette === 'PALETTE_NITE' ? 2 : 0;
          palette[1] = groupRoofPalette[offset];
          palette[2] = groupRoofPalette[offset + 1];
        }
        const roofTile = roof && tile >= 0x0a && tile < 0x13 ? tile - 0x0a : null;
        const source = roofTile === null ? { pixels, info } : roof;
        const sourceTile = tile < 0x80 ? tile : 0x60 + (tile & 0x7f);
        const sourceX = roofTile === null ? (sourceTile % 16) * 8 : (roofTile % 3) * 8;
        const sourceY = roofTile === null ? Math.floor(sourceTile / 16) * 8 : Math.floor(roofTile / 3) * 8;
        for (let pixelY = 0; pixelY < 8; pixelY++) for (let pixelX = 0; pixelX < 8; pixelX++) {
          const sourceShade = source.pixels[(sourceY + pixelY) * source.info.width + sourceX + pixelX] ?? 255;
          const shade = Math.max(0, Math.min(3, Math.round((255 - sourceShade) / 85)));
          const color = palette[shade], x = blockX * 32 + tileX * 8 + pixelX, y = blockY * 32 + tileY * 8 + pixelY, target = (y * width + x) * 4;
          canvas[target] = color[0]; canvas[target + 1] = color[1]; canvas[target + 2] = color[2]; canvas[target + 3] = 255;
        }
      }
    }
    area.mapImage = await assets.map(`${area.key}.png`, target => sharp(canvas, { raw: { width, height, channels: 4 } }).png().toFile(target));
    area.mapWidth = width; area.mapHeight = height;
  }
}
