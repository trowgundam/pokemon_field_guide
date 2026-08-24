import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bake, convert, installBrowserFiles, markerCoordinates, renderCacheKey, sharp } from '../gen4/rendering.mjs';
import { renderGroupsForMatrix } from '../gen4/render-layout.mjs';

const gen4Root = fileURLToPath(new URL('../gen4/', import.meta.url));
const padded = value => String(value).padStart(3, '0');
const webPath = (root, file) => path.relative(root, file).replaceAll('\\', '/');

export function readPlatinumLandData(source, mapId) {
  const file = path.join(source, `res/field/maps/data/map_data_${padded(mapId)}.bin`);
  const data = fs.readFileSync(file);
  const terrainSize = data.readUInt32LE(0), propsSize = data.readUInt32LE(4), modelSize = data.readUInt32LE(8);
  const modelStart = 16 + terrainSize + propsSize;
  if (terrainSize !== 2048 || data.subarray(modelStart, modelStart + 4).toString('ascii') !== 'BMD0')
    throw new Error(`Unexpected Platinum land-data layout for map ${mapId}.`);
  const props = [];
  for (let offset = 16 + terrainSize; offset + 48 <= 16 + terrainSize + propsSize; offset += 48) {
    const fx32 = position => data.readInt32LE(position) / 4096;
    props.push({ model: data.readUInt32LE(offset), position: [fx32(offset + 4), fx32(offset + 8), fx32(offset + 12)], scale: [fx32(offset + 28), fx32(offset + 32), fx32(offset + 36)] });
  }
  return { model: data.subarray(modelStart, modelStart + modelSize), props };
}

function areaDataFor(source, headers) {
  const sourceText = fs.readFileSync(path.join(source, 'include/data/map_headers.h'), 'utf8');
  const blocks = new Map([...sourceText.matchAll(/\[(MAP_HEADER_[A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g)].map(match => [match[1], match[2]]));
  return header => {
    const body = blocks.get(header ?? '') ?? blocks.get(headers[0]);
    const area = Number(body?.match(/\.areaDataArchiveID\s*=\s*area_data_(\d+)/)?.[1]);
    if (!Number.isInteger(area)) throw new Error(`Could not resolve Platinum area data for ${header}.`);
    const data = JSON.parse(fs.readFileSync(path.join(source, `res/field/area_data/area_data_${padded(area)}.json`)));
    return { terrainTextureSet: Number(data.mapTextureSet.match(/(\d+)$/)[1]), propTextureSet: Number(data.mapPropSet.match(/(\d+)$/)[1]) };
  };
}

function matrixCells(source, matrixId, fallbackHeader, lookupAreaData, decorativeMainCells) {
  const matrix = JSON.parse(fs.readFileSync(path.join(source, `res/field/matrices/map_matrix_${padded(matrixId)}.json`)));
  const decorationByCell = new Map(decorativeMainCells.map(decoration => [`${decoration.cellX},${decoration.cellZ}`, decoration.id]));
  const nearestHeader = (x, z) => {
    const candidates = [];
    for (let row = 0; row < matrix.headers?.length; row++) for (let column = 0; column < matrix.headers[row].length; column++) {
      const header = matrix.headers[row][column];
      if (header && header !== 'MAP_HEADER_EVERYWHERE') candidates.push({ header, distance: Math.abs(column - x) + Math.abs(row - z) });
    }
    return candidates.sort((left, right) => left.distance - right.distance)[0]?.header ?? fallbackHeader;
  };
  const cells = [];
  for (let z = 0; z < matrix.maps.length; z++) for (let x = 0; x < matrix.maps[z].length; x++) {
    if (matrix.maps[z][x] === 'MAP_NONE') continue;
    const map = Number(matrix.maps[z][x].match(/(\d+)$/)[1]);
    const declaredHeader = matrix.headers?.[z]?.[x];
    const decoration = matrixId === 0 && declaredHeader === 'MAP_HEADER_EVERYWHERE' ? decorationByCell.get(`${x},${z}`) : null;
    const header = declaredHeader && declaredHeader !== 'MAP_HEADER_EVERYWHERE' ? declaredHeader : decoration ?? (matrixId === 0 ? null : fallbackHeader);
    const textureHeader = decoration ? nearestHeader(x, z) : header ?? nearestHeader(x, z);
    cells.push({ x, z, map, header, altitude: matrix.altitudes?.[z]?.[x] ?? 0, ...lookupAreaData(textureHeader), ...readPlatinumLandData(source, map) });
  }
  return { id: matrixId, width: matrix.maps[0].length, height: matrix.maps.length, cells };
}

export async function renderPlatinumMaps({
  work, areaIds, apicula, output, decorativeMainCells = [], chrome = process.env.GEN4_CHROME ?? '/usr/bin/google-chrome-stable'
}) {
  const retained = areaIds.map(id => work.areas.get(id)).filter(Boolean);
  const cacheKey = renderCacheKey({ game: 'platinum', source: work.source, areas: retained,
    rendererFiles: [fileURLToPath(import.meta.url), path.join(gen4Root, 'rendering.mjs'), path.join(gen4Root, 'bake-maps.mjs'), path.join(gen4Root, 'render-layout.mjs')],
    configuration: { decorativeMainCells } });
  const cachedFile = path.join(output, 'render-result.json');
  if (fs.existsSync(cachedFile)) {
    const cached = JSON.parse(fs.readFileSync(cachedFile));
    if (cached.cacheKey === cacheKey) {
      const matrices = new Map(cached.matrices.map(matrix => {
        const id = matrix.id ?? Number(matrix.file.match(/(\d+)/)?.[1]);
        return [id, { ...matrix, id, file: path.join(output, matrix.file) }];
      }));
      return { root: output, overview: path.join(output, cached.overview), matrices, main: matrices.get(0), pitch: cached.pitch };
    }
  }
  fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
  const byMatrix = Map.groupBy(retained, area => area.mapMatrixId);
  const lookupAreaData = areaDataFor(work.source, retained.map(area => area.id));
  const matrices = [...byMatrix].map(([id, areas]) => matrixCells(work.source, id, areas[0].id, lookupAreaData, decorativeMainCells));
  for (const matrix of matrices) for (const cell of matrix.cells) cell.anchorCoordinates = new Map();
  const renderedCells = matrices.flatMap(matrix => renderGroupsForMatrix(matrix).flatMap(group => group.cells));
  const uniqueCells = new Map();
  for (const cell of renderedCells) {
    const key = `${cell.map}:${cell.terrainTextureSet}:${cell.propTextureSet}`;
    if (!uniqueCells.has(key)) uniqueCells.set(key, { ...cell, key });
  }
  for (const area of retained) for (const coordinate of markerCoordinates(area)) {
    const matrix = matrices.find(candidate => candidate.id === area.mapMatrixId);
    const cell = matrix?.cells.find(candidate => candidate.x === Math.floor(coordinate.x / 32) && candidate.z === Math.floor(coordinate.y / 32));
    if (cell) cell.anchorCoordinates.set(`${coordinate.x},${coordinate.y}`, { x: coordinate.x % 32, z: coordinate.y % 32 });
  }
  const inputs = path.join(output, '.inputs'), assets = path.join(output, '.render-assets');
  const cells = [...uniqueCells.values()];
  for (const [index, cell] of cells.entries()) { cell.id = `cell-${index}`; fs.mkdirSync(inputs, { recursive: true }); fs.writeFileSync(path.join(inputs, `${cell.id}.nsbmd`), cell.model); }
  const terrainUris = new Map();
  for (const [textureSet, group] of Map.groupBy(cells, cell => cell.terrainTextureSet)) {
    const groupInputs = group.map(cell => path.join(inputs, `${cell.id}.nsbmd`));
    const converted = convert(apicula, groupInputs, path.join(work.source, `res/field/maps/texture_sets/map_texture_set_${padded(textureSet)}.nsbtx`), path.join(assets, `terrain-${textureSet}`));
    group.forEach((cell, index) => terrainUris.set(cell.key, webPath(output, converted[index])));
  }
  const propOrder = fs.readFileSync(path.join(work.source, 'res/field/props/models/map_prop_models.order'), 'utf8').split(/\r?\n/).filter(Boolean);
  const propPairs = new Map();
  for (const cell of cells) for (const prop of cell.props) propPairs.set(`${cell.propTextureSet}:${prop.model}`, { textureSet: cell.propTextureSet, model: prop.model });
  const propUris = new Map();
  for (const [textureSet, group] of Map.groupBy([...propPairs.values()], pair => pair.textureSet)) {
    const groupInputs = group.map(pair => path.join(work.source, 'res/field/props/models', propOrder[pair.model]));
    const converted = convert(apicula, groupInputs, path.join(work.source, `res/field/props/texture_sets/prop_texture_set_${padded(textureSet)}.nsbtx`), path.join(assets, `props-${textureSet}`));
    group.forEach((pair, index) => propUris.set(`${textureSet}:${pair.model}`, webPath(output, converted[index])));
  }
  const renderGroups = matrices.flatMap(matrix => renderGroupsForMatrix(matrix).map(group => ({
    ...group,
    cells: group.cells.map(cell => {
      const sourceCell = uniqueCells.get(`${cell.map}:${cell.terrainTextureSet}:${cell.propTextureSet}`);
      return { x: cell.x, z: cell.z, terrain: terrainUris.get(sourceCell.key),
        props: cell.props.map(prop => ({ uri: propUris.get(`${cell.propTextureSet}:${prop.model}`), position: prop.position, scale: prop.scale })),
        anchorCoordinates: [...cell.anchorCoordinates].map(([id, coordinate]) => ({ id, ...coordinate })) };
    })
  })));
  fs.writeFileSync(path.join(output, 'render.json'), JSON.stringify({ groups: renderGroups })); installBrowserFiles(output);
  const baked = await bake(output, chrome), bakedById = new Map(baked.tiles.map(tile => [tile.id, tile]));
  const pitch = baked.pitch * Math.PI / 180, matrixResults = new Map();
  for (const matrix of matrices) {
    const placements = renderGroupsForMatrix(matrix).map(group => {
      const tile = bakedById.get(group.id);
      const centerX = (group.minCellX + group.maxCellX) * 256 + 256;
      const centerZ = (group.minCellZ + group.maxCellZ) * 256 + 256;
      return { id: group.id, header: group.header, minCellX: group.minCellX, minCellZ: group.minCellZ,
        cells: group.cells.map(cell => ({ map: cell.map, header: cell.header, cellX: cell.x, cellZ: cell.z })), tile,
        x: centerX + tile.bounds.x - tile.canvasWidth / 2,
        y: centerZ * Math.sin(pitch) + tile.bounds.y - tile.canvasHeight / 2 };
    });
    const minX = Math.floor(Math.min(...placements.map(tile => tile.x))), minY = Math.floor(Math.min(...placements.map(tile => tile.y)));
    const maxX = Math.ceil(Math.max(...placements.map(tile => tile.x + tile.tile.width))), maxY = Math.ceil(Math.max(...placements.map(tile => tile.y + tile.tile.height)));
    const file = path.join(output, `matrix-${padded(matrix.id)}.png`);
    await sharp({ create: { width: maxX - minX, height: maxY - minY, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }, limitInputPixels: false })
      .composite(placements.sort((left, right) => left.minCellZ - right.minCellZ || left.minCellX - right.minCellX)
        .map(group => ({ input: path.join(output, 'tiles', `${group.id}.png`), left: Math.round(group.x - minX), top: Math.round(group.y - minY) }))).png().toFile(file);
    matrixResults.set(matrix.id, { id: matrix.id, file, width: maxX - minX, height: maxY - minY, minX, minY, placements });
  }
  const main = matrixResults.get(0); if (!main) throw new Error('Platinum render omitted main matrix 0.');
  const overview = path.join(output, 'sinnoh-overview.png');
  await sharp(main.file, { limitInputPixels: false }).resize({ width: Math.max(1, Math.round(main.width / 8)) }).png({ compressionLevel: 9 }).toFile(overview);
  const serialMatrices = [...matrixResults.values()].map(matrix => ({ ...matrix, file: path.basename(matrix.file), placements: matrix.placements }));
  fs.writeFileSync(cachedFile, JSON.stringify({ cacheKey, overview: path.basename(overview), pitch, matrices: serialMatrices }));
  return { root: output, overview, matrices: matrixResults, main, pitch };
}
