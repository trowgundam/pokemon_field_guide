import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');

export async function renderFrlgMaps(root, assets, areaAliases = {}) {
const layouts = JSON.parse(fs.readFileSync(path.join(root, 'data/layouts/layouts.json'))).layouts;
const mapFiles = fs.readdirSync(path.join(root, 'data/maps')).map(d => path.join(root, 'data/maps', d, 'map.json')).filter(fs.existsSync);
const maps = mapFiles.map(f => JSON.parse(fs.readFileSync(f)));
const layoutsById = new Map(layouts.map(layout => [layout.id, layout]));
const mapsById = new Map(maps.map(map => [map.id, map]));
const graphics = fs.readFileSync(path.join(root, 'src/data/tilesets/graphics.h'), 'utf8') + fs.readFileSync(path.join(root, 'src/graphics.c'), 'utf8');
const tilePaths = new Map([...graphics.matchAll(/gTilesetTiles_([A-Za-z0-9_]+)\[\].*?"([^"]+\/tiles)\.4bpp/g)].map(m => [`gTileset_${m[1]}`, m[2]]));
const headerSource = fs.readFileSync(path.join(root, 'src/data/tilesets/headers.h'), 'utf8');
const aliases = new Map([...headerSource.matchAll(/const struct Tileset (gTileset_[A-Za-z0-9_]+)\s*=\s*\{([\s\S]*?)\};/g)].map(m => [m[1], `gTileset_${m[2].match(/\.tiles\s*=\s*gTilesetTiles_([A-Za-z0-9_]+)/)?.[1]}`]));
const cache = new Map();

function palette(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(x => /^\d+ \d+ \d+$/.test(x)).map(x => x.split(' ').map(Number));
}
async function tileset(name) {
  if (cache.has(name)) return cache.get(name);
  const relative = tilePaths.get(name) ?? tilePaths.get(aliases.get(name));
  if (!relative) throw new Error(`No graphics path for ${name}`);
  const graphicsBase = path.join(root, path.dirname(relative));
  const folder = name.replace(/^gTileset_/, '').replace(/([a-z])([A-Z0-9])/g, '$1_$2').toLowerCase();
  const ownBase = [path.join(root,'data/tilesets/primary',folder),path.join(root,'data/tilesets/secondary',folder)].find(fs.existsSync) ?? graphicsBase;
  const { data, info } = await sharp(path.join(root, `${relative}.png`)).raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(info.width * info.height);
  // gbagfx's indexed source PNG uses white for index 0 and black for index 15.
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.round((255 - data[i * info.channels]) / 17);
  const palettes = Array.from({ length: 16 }, (_, i) => palette(path.join(graphicsBase, 'palettes', `${String(i).padStart(2, '0')}.pal`)));
  const value = { pixels, width: info.width, palettes, metatiles: fs.readFileSync(path.join(ownBase, 'metatiles.bin')) };
  cache.set(name, value); return value;
}
function drawTile(target, targetWidth, dx, dy, tile, tiles, colors, transparent) {
  const sx = (tile & 0x3ff) % 16 * 8, sy = Math.floor((tile & 0x3ff) / 16) * 8;
  const hflip = tile & 0x400, vflip = tile & 0x800, pal = (tile >>> 12) & 15;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const px = hflip ? 7 - x : x, py = vflip ? 7 - y : y;
    const index = tiles.pixels[(sy + py) * tiles.width + sx + px];
    if (transparent && index === 0) continue;
    const color = colors[pal][index] ?? [255, 0, 255];
    const at = ((dy + y) * targetWidth + dx + x) * 4;
    target[at] = color[0]; target[at + 1] = color[1]; target[at + 2] = color[2]; target[at + 3] = 255;
  }
}
let count = 0;
const rendered = [];
const mapAssets = new Map();
const layoutBlocks = layout => {
  const bytes = fs.readFileSync(path.join(root, layout.blockdata_filepath));
  return Array.from({ length: layout.height }, (_, y) => Array.from({ length: layout.width }, (_, x) => bytes.readUInt16LE((y * layout.width + x) * 2)));
};
const cropOffset = (areaLayout, placementLayout) => {
  const areaBlocks = layoutBlocks(areaLayout), placementBlocks = layoutBlocks(placementLayout), matches = [];
  for (let y = 0; y <= areaLayout.height - placementLayout.height; y++) for (let x = 0; x <= areaLayout.width - placementLayout.width; x++) {
    let equal = true;
    for (let row = 0; equal && row < placementLayout.height; row++) for (let column = 0; column < placementLayout.width; column++)
      if (areaBlocks[y + row][x + column] !== placementBlocks[row][column]) { equal = false; break; }
    if (equal) matches.push({ x, y });
  }
  if (matches.length !== 1)
    throw new Error(`${placementLayout.id} must occur exactly once inside ${areaLayout.id}; found ${matches.length} matches.`);
  return matches[0];
};
for (const layout of layouts) {
  const layoutMaps = maps.filter(m => m.layout === layout.id);
  const outdoorMaps = layoutMaps.filter(m => ['MAP_TYPE_TOWN','MAP_TYPE_ROUTE','MAP_TYPE_OCEAN_ROUTE'].includes(m.map_type));
  if (!layoutMaps.length) continue;
  const primary = await tileset(layout.primary_tileset), secondary = await tileset(layout.secondary_tileset);
  // FRLG reserves palettes 0–6 for the primary tileset and 7–12 for the secondary.
  const colors = primary.palettes.map((p, i) => i < 7 ? p : secondary.palettes[i]);
  const blocks = fs.readFileSync(path.join(root, layout.blockdata_filepath));
  const width = layout.width * 16, height = layout.height * 16, image = Buffer.alloc(width * height * 4);
  for (let by = 0; by < layout.height; by++) for (let bx = 0; bx < layout.width; bx++) {
    const blockId = blocks.readUInt16LE((by * layout.width + bx) * 2) & 0x3ff;
    const secondaryBlock = blockId >= 640, set = secondaryBlock ? secondary : primary;
    const metatile = secondaryBlock ? blockId - 640 : blockId;
    const offset = metatile * 16;
    for (let layer = 0; layer < 2; layer++) for (let q = 0; q < 4; q++) {
      const tile = set.metatiles.readUInt16LE(offset + (layer * 4 + q) * 2);
      const actualSet = (tile & 0x3ff) >= 640 ? secondary : primary;
      const adjusted = (tile & 0xfc00) | (((tile & 0x3ff) >= 640) ? (tile & 0x3ff) - 640 : tile & 0x3ff);
      drawTile(image, width, bx * 16 + (q % 2) * 8, by * 16 + Math.floor(q / 2) * 8, adjusted, actualSet, colors, layer === 1);
    }
  }
  mapAssets.set(layout.id, await assets.map(`${layout.id}.png`, target => sharp(image, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9, palette: true }).toFile(target)));
  for (const map of outdoorMaps) {
    const areaId = areaAliases[map.id] ?? map.id;
    let markerOffset;
    if (areaId !== map.id) {
      const areaMap = mapsById.get(areaId);
      if (!areaMap) throw new Error(`${map.id} aliases missing area ${areaId}.`);
      markerOffset = cropOffset(layoutsById.get(areaMap.layout), layout);
    }
    rendered.push({ id: map.id, areaId, layout: layout.id, width: layout.width, height: layout.height, connections: map.connections ?? [], markerOffset });
  }
  count++;
}

const byId = new Map(rendered.map(m => [m.id, m]));
function connectedPositions(rootId, allowed) {
  const positions = new Map([[rootId, { x: 0, y: 0 }]]), queue = [rootId];
  while (queue.length) {
    const id = queue.shift(), map = byId.get(id), current = positions.get(id);
    if (!map) continue;
    for (const c of map.connections) {
      const target = byId.get(c.map); if (!target || !allowed.has(target.id) || positions.has(target.id)) continue;
      const next = { ...current };
      if (c.direction === 'up') { next.x += c.offset; next.y -= target.height; }
      if (c.direction === 'down') { next.x += c.offset; next.y += map.height; }
      if (c.direction === 'left') { next.x -= target.width; next.y += c.offset; }
      if (c.direction === 'right') { next.x += map.width; next.y += c.offset; }
      positions.set(target.id, next); queue.push(target.id);
    }
  }
  return positions;
}
async function makeWorld(name, positions) {
  const entries = [...positions].map(([id, p]) => ({ ...byId.get(id), ...p }));
  const minX = Math.min(...entries.map(e => e.x)), minY = Math.min(...entries.map(e => e.y));
  for (const e of entries) { e.x -= minX; e.y -= minY; }
  const width = Math.max(...entries.map(e => e.x + e.width)) * 16, height = Math.max(...entries.map(e => e.y + e.height)) * 16;
  const composite = entries.map(e => ({ input: mapAssets.get(e.layout).localPath, left: e.x * 16, top: e.y * 16 }));
  const image = await assets.map(`WORLD_${name.toUpperCase()}.png`, target => sharp({ create: { width, height, channels: 4, background: { r: 120, g: 184, b: 211, alpha: 1 } } }).composite(composite).png({ compressionLevel: 9, palette: true }).toFile(target));
  return { id: name, image, width, height, maps: entries.map(e => ({
    id: e.areaId, x: e.x * 16, y: e.y * 16, width: e.width * 16, height: e.height * 16,
    ...(e.markerOffset ? { markerOffsetX: e.markerOffset.x, markerOffsetY: e.markerOffset.y } : {})
  })) };
}
const kantoIds = new Set(rendered.filter(m => !/(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN)_ISLAND|MT_EMBER|KINDLE|CAPE_BRINK|BOND_BRIDGE|BERRY_FOREST|ICEFALL|LOST_CAVE|MEMORIAL|WATER_PATH|RUIN_VALLEY|PATTERN_BUSH|ALTERING_CAVE|OUTCAST|GREEN_PATH|TANOBY|TRAINER_TOWER|BIRTH_ISLAND|NAVEL_ROCK/.test(m.id)).map(m => m.id));
const kanto = connectedPositions('MAP_PALLET_TOWN', kantoIds);
// Each Sevii island is a separate connection component; arrange those components side-by-side.
const seviiIds = new Set(rendered.filter(m => !kantoIds.has(m.id)).map(m => m.id)), sevii = new Map(); let componentX = 0;
while ([...seviiIds].some(id => !sevii.has(id))) {
  const rootId = [...seviiIds].find(id => !sevii.has(id)); const component = connectedPositions(rootId, seviiIds);
  const minX = Math.min(...component.values().map(p => p.x)), maxX = Math.max(...[...component].map(([id,p]) => p.x + byId.get(id).width));
  for (const [id,p] of component) if (!sevii.has(id)) sevii.set(id, { x: p.x - minX + componentX, y: p.y });
  componentX += maxX - minX + 12;
}
const worlds = [await makeWorld('kanto', kanto), await makeWorld('sevii', sevii)];
console.log(`Rendered ${count} game layouts and ${worlds.length} connected world canvases.`);
return { worlds, mapAssets };
}
