import fs from 'node:fs';
import path from 'node:path';

const definitionMap = text => new Map([...text.matchAll(
  /const u32\s+(gItemIcon(?:Palette)?_[A-Za-z0-9_]+)\[\]\s*=\s*\w+\("([^"]+)"/g
)].map(match => [match[1], match[2]]));

const itemIconTable = text => new Map([...text.matchAll(
  /\[(ITEM_[A-Z0-9_]+)\]\s*=\s*\{\s*(gItemIcon_[A-Za-z0-9_]+),\s*(gItemIconPalette_[A-Za-z0-9_]+)\s*\}/g
)].map(match => [match[1], { graphic: match[2], palette: match[3] }]));

function tmHmAliases(source) {
  const text = fs.readFileSync(path.join(source, 'include/constants/tms_hms.h'), 'utf8'), aliases = new Map();
  for (const [kind, count] of [['TM', 50], ['HM', 8]]) {
    const start = text.indexOf(`#define FOREACH_${kind}(F)`);
    const end = text.indexOf('\n\n', start);
    const names = [...text.slice(start, end).matchAll(/F\(([A-Z0-9_]+)\)/g)].map(match => match[1]);
    if (names.length !== count) throw new Error(`Emerald ${kind} alias audit found ${names.length}; expected ${count}.`);
    names.forEach((name, index) => aliases.set(`ITEM_${kind}_${name}`, `ITEM_${kind}${String(index + 1).padStart(2, '0')}`));
  }
  return aliases;
}

function pngPalette(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) throw new Error('Item icon is not a PNG file.');
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'PLTE') {
      const palette = [];
      for (let index = 0; index < length; index += 3) {
        palette.push([buffer[offset + 8 + index], buffer[offset + 9 + index], buffer[offset + 10 + index]]);
      }
      return palette;
    }
    offset += length + 12;
  }
  throw new Error('Item icon PNG has no indexed palette.');
}

function jascPalette(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines[0] !== 'JASC-PAL' || lines[1] !== '0100') throw new Error(`${file} is not a JASC palette.`);
  const count = Number(lines[2]), colors = lines.slice(3).map(line => line.trim().split(/\s+/).map(Number));
  if (colors.length !== count || colors.some(color => color.length !== 3 || color.some(channel => !Number.isInteger(channel))))
    throw new Error(`${file} contains an invalid JASC palette.`);
  return colors;
}

async function renderItemSprite(graphicFile, paletteFile, target, sharp) {
  const sourcePalette = pngPalette(fs.readFileSync(graphicFile));
  const targetPalette = jascPalette(paletteFile);
  if (targetPalette.length < sourcePalette.length) throw new Error(`${paletteFile} is shorter than the item graphic palette.`);
  const paletteIndex = new Map(sourcePalette.map((color, index) => [color.join(','), index]));
  const { data, info } = await sharp(graphicFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    const index = paletteIndex.get(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
    if (index === undefined) throw new Error(`${graphicFile} contains a color outside its PNG palette.`);
    [data[offset], data[offset + 1], data[offset + 2]] = targetPalette[index];
  }
  await sharp(data, { raw: info }).png().toFile(target);
}

export async function registerEmeraldItemSprites(work, areas, assets, sharp) {
  const graphicsText = fs.readFileSync(path.join(work.source, 'src/data/graphics/items.h'), 'utf8');
  const tableText = fs.readFileSync(path.join(work.source, 'src/data/item_icon_table.h'), 'utf8');
  const definitions = definitionMap(graphicsText), table = itemIconTable(tableText);
  const aliases = tmHmAliases(work.source), registered = new Map();
  for (const item of areas.flatMap(area => area.items)) {
    if (!item.sourceItemId) throw new Error(`Emerald item '${item.id}' lacks its source item ID.`);
    const association = table.get(aliases.get(item.sourceItemId) ?? item.sourceItemId);
    if (!association) throw new Error(`Emerald item icon table lacks ${item.sourceItemId}.`);
    const graphic = definitions.get(association.graphic), palette = definitions.get(association.palette);
    if (!graphic || !palette) throw new Error(`Emerald item icon definitions are incomplete for ${item.sourceItemId}.`);
    const fileName = `${item.sourceItemId.replace('ITEM_', '').toLowerCase()}.png`;
    if (!registered.has(fileName)) registered.set(fileName, await assets.itemSprite(fileName, target =>
      renderItemSprite(path.join(work.source, graphic), path.join(work.source, palette), target, sharp)));
    item.icon = registered.get(fileName);
  }
}
