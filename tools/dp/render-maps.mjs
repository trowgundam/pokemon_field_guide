import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bake, convert, installBrowserFiles, markerCoordinates, renderCacheKey, sharp } from '../gen4/rendering.mjs';
import { renderGroupsForMatrix } from '../gen4/render-layout.mjs';
import { readDpMatrix } from './source.mjs';

const padded = value => String(value).padStart(4, '0');
const webPath = (root, file) => path.relative(root, file).replaceAll('\\', '/');

function narcFile(directory, id) {
  const prefix = `narc_${padded(id)}`;
  const file = fs.readdirSync(directory).find(candidate => candidate.startsWith(`${prefix}.`));
  if (!file) throw new Error(`Missing ${prefix} in ${directory}.`);
  return path.join(directory, file);
}

function readLandData(source, mapId) {
  const data = fs.readFileSync(path.join(source, `files/fielddata/land_data/land_data_release/narc_${padded(mapId)}.bin`));
  const terrainSize = data.readUInt32LE(0), propsSize = data.readUInt32LE(4), modelSize = data.readUInt32LE(8), modelStart = 16 + terrainSize + propsSize;
  if (terrainSize !== 2048 || data.subarray(modelStart, modelStart + 4).toString('ascii') !== 'BMD0') throw new Error(`Unexpected Diamond/Pearl land-data layout for map ${mapId}.`);
  const props = [];
  for (let offset = 16 + terrainSize; offset + 48 <= 16 + terrainSize + propsSize; offset += 48) {
    const fx32 = position => data.readInt32LE(position) / 4096;
    props.push({ model: data.readUInt32LE(offset), position: [fx32(offset + 4), fx32(offset + 8), fx32(offset + 12)], scale: [fx32(offset + 28), fx32(offset + 32), fx32(offset + 36)] });
  }
  return { model: data.subarray(modelStart, modelStart + modelSize), props };
}

function areaDataFor(work, fallbackArea) {
  return headerNumber => {
    const header = work.headers.get([...work.headers.keys()].find(id => work.headers.get(id).number === headerNumber) ?? fallbackArea);
    if (!header) throw new Error(`Could not resolve Diamond/Pearl area data for map header ${headerNumber}.`);
    const data = fs.readFileSync(path.join(work.source, `files/fielddata/areadata/area_data/narc_${padded(header.areaDataId)}.bin`));
    return { propTextureSet: data.readUInt16LE(0), terrainTextureSet: data.readUInt16LE(2) };
  };
}

function matrixCells(work, matrixId, fallbackArea, decorativeMainCells) {
  const matrix = readDpMatrix(work.source, matrixId), lookupAreaData = areaDataFor(work, fallbackArea), cells = [];
  const headerIdByNumber = new Map([...work.headers].map(([id, header]) => [header.number, id]));
  const decorationByCell = new Map(decorativeMainCells.map(decoration => [`${decoration.cellX},${decoration.cellZ}`, decoration.id]));
  const nearestHeaderNumber = (x, z, fallbackNumber) => {
    const candidates = [];
    for (let row = 0; row < matrix.height; row++) for (let column = 0; column < matrix.width; column++) {
      const headerNumber = matrix.headers[row * matrix.width + column];
      if (headerNumber) candidates.push({ headerNumber, distance: Math.abs(column - x) + Math.abs(row - z) });
    }
    return candidates.sort((left, right) => left.distance - right.distance)[0]?.headerNumber ?? fallbackNumber;
  };
  for (let z = 0; z < matrix.height; z++) for (let x = 0; x < matrix.width; x++) {
    const index = z * matrix.width + x, map = matrix.maps[index]; if (map === 0xffff) continue;
    const fallbackNumber = work.headers.get(fallbackArea).number;
    const declaredHeaderNumber = matrix.headers[index];
    const headerNumber = declaredHeaderNumber || (matrixId === 0 ? null : fallbackNumber);
    const decoration = matrixId === 0 && !declaredHeaderNumber ? decorationByCell.get(`${x},${z}`) : null;
    const header = headerNumber ? headerIdByNumber.get(headerNumber) ?? null : decoration ?? null;
    const textureHeaderNumber = headerNumber ?? nearestHeaderNumber(x, z, fallbackNumber);
    cells.push({ x, z, map, header, ...lookupAreaData(textureHeaderNumber), ...readLandData(work.source, map) });
  }
  return { id: matrixId, width: matrix.width, height: matrix.height, cells };
}

export async function renderDpMaps({
  work, areaIds, apicula, output, decorativeMainCells = [], chrome = process.env.GEN4_CHROME ?? '/usr/bin/google-chrome-stable'
}) {
  const retained = areaIds.map(id => work.areas.get(id)).filter(Boolean);
  const cacheKey = renderCacheKey({ game: 'dp', source: work.source, areas: retained,
    rendererFiles: [fileURLToPath(import.meta.url), fileURLToPath(new URL('../gen4/rendering.mjs', import.meta.url)),
      fileURLToPath(new URL('../gen4/bake-maps.mjs', import.meta.url)), fileURLToPath(new URL('../gen4/render-layout.mjs', import.meta.url))],
    configuration: { decorativeMainCells } });
  const cachedFile = path.join(output, 'render-result.json');
  if (fs.existsSync(cachedFile)) {
    const cached = JSON.parse(fs.readFileSync(cachedFile));
    if (cached.cacheKey === cacheKey) {
      const matrices = new Map(cached.matrices.map(matrix => [matrix.id, { ...matrix, file: path.join(output, matrix.file) }]));
      return { root: output, overview: path.join(output, cached.overview), matrices, main: matrices.get(0), pitch: cached.pitch };
    }
  }
  fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
  const byMatrix = Map.groupBy(retained, area => area.mapMatrixId);
  const matrices = [...byMatrix].map(([id, areas]) => matrixCells(work, id, areas[0].id, decorativeMainCells));
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
  const inputs = path.join(output, '.inputs'), assets = path.join(output, '.render-assets'), cells = [...uniqueCells.values()];
  fs.mkdirSync(inputs, { recursive: true });
  cells.forEach((cell, index) => { cell.id = `cell-${index}`; fs.writeFileSync(path.join(inputs, `${cell.id}.nsbmd`), cell.model); });
  const terrainDirectory = path.join(work.source, 'files/fielddata/areadata/area_map_tex/map_tex_set'), terrainUris = new Map();
  for (const [textureSet, group] of Map.groupBy(cells, cell => cell.terrainTextureSet)) {
    const groupInputs = group.map(cell => path.join(inputs, `${cell.id}.nsbmd`));
    const converted = convert(apicula, groupInputs, narcFile(terrainDirectory, textureSet), path.join(assets, `terrain-${textureSet}`));
    group.forEach((cell, index) => terrainUris.set(cell.key, webPath(output, converted[index])));
  }
  const propModelDirectory = path.join(work.source, 'files/fielddata/build_model/build_model');
  const propTextureDirectory = path.join(work.source, 'files/fielddata/areadata/area_build_model/areabm_texset');
  const propPairs = new Map();
  for (const cell of cells) for (const prop of cell.props) propPairs.set(`${cell.propTextureSet}:${prop.model}`, { textureSet: cell.propTextureSet, model: prop.model });
  const propUris = new Map();
  for (const [textureSet, group] of Map.groupBy([...propPairs.values()], pair => pair.textureSet)) {
    const groupInputs = group.map(pair => narcFile(propModelDirectory, pair.model));
    const converted = convert(apicula, groupInputs, narcFile(propTextureDirectory, textureSet), path.join(assets, `props-${textureSet}`));
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
  const baked = await bake(output, chrome), bakedById = new Map(baked.tiles.map(tile => [tile.id, tile])), pitch = baked.pitch * Math.PI / 180, matrixResults = new Map();
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
  const main = matrixResults.get(0); if (!main) throw new Error('Diamond/Pearl render omitted main matrix 0.');
  const overview = path.join(output, 'sinnoh-overview.png');
  await sharp(main.file, { limitInputPixels: false }).resize({ width: Math.max(1, Math.round(main.width / 8)) }).png({ compressionLevel: 9 }).toFile(overview);
  const serialMatrices = [...matrixResults.values()].map(matrix => ({ ...matrix, file: path.basename(matrix.file), placements: matrix.placements }));
  fs.writeFileSync(cachedFile, JSON.stringify({ cacheKey, overview: path.basename(overview), pitch, matrices: serialMatrices }));
  return { root: output, overview, matrices: matrixResults, main, pitch };
}
