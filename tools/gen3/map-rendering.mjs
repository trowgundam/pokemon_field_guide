import fs from 'node:fs';
import path from 'node:path';

const snakeCase = value => value.replace(/^gTileset_/, '').replace(/([a-z])([A-Z0-9])/g, '$1_$2').toLowerCase();

const readPalette = file => fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .filter(line => /^\d+ \d+ \d+$/.test(line))
  .map(line => line.split(' ').map(Number));

const tilesetFolder = (source, name, kind) => {
  const folder = snakeCase(name);
  const candidate = path.join(source, 'data/tilesets', kind, folder);
  if (!fs.existsSync(candidate)) throw new Error(`${kind} tileset ${name} has no source folder.`);
  return candidate;
};

export async function renderGen3Maps({ source, assets, sharp, extraLayoutIds = [], includedMapIds = null }) {
  const layouts = JSON.parse(fs.readFileSync(path.join(source, 'data/layouts/layouts.json'))).layouts;
  const mapFiles = fs.readdirSync(path.join(source, 'data/maps'))
    .map(directory => path.join(source, 'data/maps', directory, 'map.json')).filter(fs.existsSync);
  const maps = mapFiles.map(file => JSON.parse(fs.readFileSync(file)));
  const mapsById = new Map(maps.map(map => [map.id, map]));
  const layoutsById = new Map(layouts.map(layout => [layout.id, layout]));
  const included = includedMapIds ? new Set(includedMapIds) : null;
  const usedLayoutIds = new Set([
    ...maps.filter(map => !included || included.has(map.id)).map(map => map.layout),
    ...extraLayoutIds
  ]);
  const tilesetCache = new Map(), mapAssets = new Map();

  async function tileset(name, kind) {
    const key = `${kind}:${name}`;
    if (tilesetCache.has(key)) return tilesetCache.get(key);
    const folder = tilesetFolder(source, name, kind);
    const { data, info } = await sharp(path.join(folder, 'tiles.png')).raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(info.width * info.height);
    for (let index = 0; index < pixels.length; index++) pixels[index] = Math.round((255 - data[index * info.channels]) / 17);
    const palettes = Array.from({ length: 16 }, (_, index) =>
      readPalette(path.join(folder, 'palettes', `${String(index).padStart(2, '0')}.pal`)));
    const value = {
      pixels,
      width: info.width,
      palettes,
      metatiles: fs.readFileSync(path.join(folder, 'metatiles.bin'))
    };
    tilesetCache.set(key, value);
    return value;
  }

  function drawTile(target, targetWidth, dx, dy, tile, sourceTiles, colors, transparent) {
    const tileId = tile & 0x3ff;
    const sx = (tileId % 16) * 8, sy = Math.floor(tileId / 16) * 8;
    const hflip = tile & 0x400, vflip = tile & 0x800, paletteIndex = (tile >>> 12) & 15;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const px = hflip ? 7 - x : x, py = vflip ? 7 - y : y;
      const colorIndex = sourceTiles.pixels[(sy + py) * sourceTiles.width + sx + px];
      if (transparent && colorIndex === 0) continue;
      const color = colors[paletteIndex]?.[colorIndex] ?? [255, 0, 255];
      const targetIndex = ((dy + y) * targetWidth + dx + x) * 4;
      target[targetIndex] = color[0]; target[targetIndex + 1] = color[1];
      target[targetIndex + 2] = color[2]; target[targetIndex + 3] = 255;
    }
  }

  for (const layout of layouts) {
    if (!usedLayoutIds.has(layout.id)) continue;
    const primary = await tileset(layout.primary_tileset, 'primary');
    const secondary = await tileset(layout.secondary_tileset, 'secondary');
    const colors = primary.palettes.map((palette, index) => index < 6 ? palette : secondary.palettes[index]);
    const blocks = fs.readFileSync(path.join(source, layout.blockdata_filepath));
    const width = layout.width * 16, height = layout.height * 16, image = Buffer.alloc(width * height * 4);
    for (let blockY = 0; blockY < layout.height; blockY++) for (let blockX = 0; blockX < layout.width; blockX++) {
      const blockId = blocks.readUInt16LE((blockY * layout.width + blockX) * 2) & 0x3ff;
      const secondaryBlock = blockId >= 512, blockTileset = secondaryBlock ? secondary : primary;
      const metatile = secondaryBlock ? blockId - 512 : blockId, offset = metatile * 16;
      for (let layer = 0; layer < 2; layer++) for (let quadrant = 0; quadrant < 4; quadrant++) {
        const tile = blockTileset.metatiles.readUInt16LE(offset + (layer * 4 + quadrant) * 2);
        const secondaryTile = (tile & 0x3ff) >= 512;
        const tileTileset = secondaryTile ? secondary : primary;
        const adjusted = (tile & 0xfc00) | (secondaryTile ? (tile & 0x3ff) - 512 : tile & 0x3ff);
        drawTile(image, width, blockX * 16 + (quadrant % 2) * 8,
          blockY * 16 + Math.floor(quadrant / 2) * 8, adjusted, tileTileset, colors, layer === 1);
      }
    }
    mapAssets.set(layout.id, await assets.map(`${layout.id}.png`, target =>
      sharp(image, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9, palette: true }).toFile(target)));
  }

  return { source, assets, sharp, layouts, layoutsById, maps, mapsById, mapAssets };
}

export async function renderConnectedWorld(rendered, { id, name, mapIds, rootId }) {
  const selected = new Set(mapIds), positions = new Map(), components = [];
  const roots = [rootId, ...selected].filter((value, index, values) => value && values.indexOf(value) === index);
  for (const componentRoot of roots) {
    if (!selected.has(componentRoot) || positions.has(componentRoot)) continue;
    const component = new Map([[componentRoot, { x: 0, y: 0 }]]), queue = [componentRoot];
    while (queue.length) {
      const mapId = queue.shift(), map = rendered.mapsById.get(mapId), current = component.get(mapId);
      const layout = rendered.layoutsById.get(map.layout);
      for (const connection of map.connections ?? []) {
        if (!selected.has(connection.map) || component.has(connection.map)) continue;
        const targetMap = rendered.mapsById.get(connection.map);
        const targetLayout = rendered.layoutsById.get(targetMap.layout), next = { ...current };
        if (connection.direction === 'up') { next.x += connection.offset; next.y -= targetLayout.height; }
        else if (connection.direction === 'down') { next.x += connection.offset; next.y += layout.height; }
        else if (connection.direction === 'left') { next.x -= targetLayout.width; next.y += connection.offset; }
        else if (connection.direction === 'right') { next.x += layout.width; next.y += connection.offset; }
        else continue;
        component.set(connection.map, next); queue.push(connection.map);
      }
    }
    components.push(component);
    for (const [mapId, position] of component) positions.set(mapId, position);
  }

  let componentX = 0;
  for (const component of components) {
    const entries = [...component].map(([mapId, position]) => ({ mapId, ...position,
      layout: rendered.layoutsById.get(rendered.mapsById.get(mapId).layout) }));
    const minX = Math.min(...entries.map(entry => entry.x)), minY = Math.min(...entries.map(entry => entry.y));
    const maxX = Math.max(...entries.map(entry => entry.x + entry.layout.width));
    for (const entry of entries) positions.set(entry.mapId, { x: entry.x - minX + componentX, y: entry.y - minY });
    componentX += maxX - minX + 12;
  }

  const entries = [...positions].map(([mapId, position]) => {
    const map = rendered.mapsById.get(mapId), layout = rendered.layoutsById.get(map.layout);
    return { mapId, map, layout, ...position };
  });
  const width = Math.max(...entries.map(entry => entry.x + entry.layout.width)) * 16;
  const height = Math.max(...entries.map(entry => entry.y + entry.layout.height)) * 16;
  const image = await rendered.assets.map(`WORLD_${id.toUpperCase().replaceAll('-', '_')}.png`, target =>
    rendered.sharp({ create: { width, height, channels: 4, background: { r: 120, g: 184, b: 211, alpha: 1 } } })
      .composite(entries.map(entry => ({ input: rendered.mapAssets.get(entry.layout.id).localPath,
        left: entry.x * 16, top: entry.y * 16 })))
      .png({ compressionLevel: 9, palette: true }).toFile(target));
  return {
    id, name, image, width, height,
    maps: entries.map(entry => ({ id: entry.mapId, x: entry.x * 16, y: entry.y * 16,
      width: entry.layout.width * 16, height: entry.layout.height * 16 }))
  };
}
