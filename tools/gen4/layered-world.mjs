import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { traceAlphaMaskRegions } from './alpha-outline.mjs';

const pitch = 59.051513671875 * Math.PI / 180;
const overviewNativeScale = 1 / 8;

export const sinnohRockRoofDecorations = Object.freeze([
  { id: 'sinnoh-rock-roof-route-211', cellX: 12, cellZ: 16 },
  { id: 'sinnoh-rock-roof-route-207-208', cellX: 11, cellZ: 22 }
]);

const guideContent = area => area.includeInNavigation === true
  || area.encounters.length + area.items.length + area.resources.length + area.specialPokemon.length > 0;

function leadsToGuideContent(startId, areas, outdoorIds) {
  const queue = [startId], visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id) || outdoorIds.has(id)) continue;
    visited.add(id);
    const area = areas.get(id);
    if (!area) continue;
    if (guideContent(area)) return true;
    queue.push(...area.entrances.map(entrance => entrance.targetId));
  }
  return false;
}

const markerCoordinates = (area, areas, outdoorIds) => {
  const values = [
    ...area.items.filter(item => item.x >= 0 && item.y >= 0),
    ...area.resources,
    ...area.transports,
    ...area.entrances.filter(entrance => entrance.showMarker !== false && !outdoorIds.has(entrance.targetId)
      && leadsToGuideContent(entrance.targetId, areas, outdoorIds))
  ];
  return [...new Map(values.map(value => [`${value.x},${value.y}`, { x: value.x, y: value.y }])).values()];
};

const areaMarkerCoordinates = area => [...new Map([
  ...area.items.filter(item => item.x >= 0 && item.y >= 0),
  ...area.resources,
  ...area.transports,
  ...area.entrances.filter(entrance => entrance.showMarker !== false && entrance.targetId)
].map(value => [`${value.x},${value.y}`, { x: value.x, y: value.y }])).values()];

function hideUnprojectableEntrance(area, coordinate) {
  const entrances = area.entrances.filter(entrance => entrance.showMarker !== false
    && entrance.targetId && entrance.x === coordinate.x && entrance.y === coordinate.y);
  const otherMarker = [...area.items.filter(item => item.x >= 0 && item.y >= 0), ...area.resources, ...area.transports]
    .some(marker => marker.x === coordinate.x && marker.y === coordinate.y);
  if (entrances.length === 0 || otherMarker) return false;
  for (const entrance of entrances) entrance.showMarker = false;
  return true;
}

export function orderWorldPlacements(placements, layerOrderOverrides = []) {
  const ordered = [...placements].sort((left, right) => left.minCellZ - right.minCellZ || left.minCellX - right.minCellX);
  for (const { background, foreground } of layerOrderOverrides) {
    if (background === foreground) throw new Error(`World layer ${background} cannot be both background and foreground.`);
    const backgroundIndex = ordered.findIndex(placement => placement.header === background);
    const foregroundIndex = ordered.findIndex(placement => placement.header === foreground);
    if (backgroundIndex < 0 || foregroundIndex < 0) {
      throw new Error(`World layer override requires ${background} and ${foreground} in the connected world.`);
    }
    const [foregroundPlacement] = ordered.splice(foregroundIndex, 1);
    const updatedBackgroundIndex = ordered.findIndex(placement => placement.header === background);
    ordered.splice(updatedBackgroundIndex + 1, 0, foregroundPlacement);
  }
  return ordered;
}

async function loadLayerAlpha(placement, matrix, renderRoot) {
  const source = path.join(renderRoot, 'tiles', `${placement.id}.png`);
  const { data, info } = await sharp(source).ensureAlpha().extractChannel('alpha').raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    x: Math.round(placement.x - matrix.minX),
    y: Math.round(placement.y - matrix.minY)
  };
}

export function maskCoveredAlpha(layer, foregroundLayers, alphaThreshold = 16) {
  const visible = Buffer.from(layer.data);
  for (const foreground of foregroundLayers) {
    const left = Math.max(layer.x, foreground.x), top = Math.max(layer.y, foreground.y);
    const right = Math.min(layer.x + layer.width, foreground.x + foreground.width);
    const bottom = Math.min(layer.y + layer.height, foreground.y + foreground.height);
    if (left >= right || top >= bottom) continue;
    for (let y = top; y < bottom; y++) {
      const layerRow = (y - layer.y) * layer.width;
      const foregroundRow = (y - foreground.y) * foreground.width;
      for (let x = left; x < right; x++) {
        if (foreground.data[foregroundRow + x - foreground.x] >= alphaThreshold) {
          visible[layerRow + x - layer.x] = 0;
        }
      }
    }
  }
  return visible;
}

function visibleRegions(layer, foregroundLayers) {
  return traceAlphaMaskRegions(maskCoveredAlpha(layer, foregroundLayers), layer.width, layer.height, {
    offsetX: layer.x,
    offsetY: layer.y
  }).map(points => ({ points }));
}

function projectedPoint(matrix, coordinate) {
  const placement = matrix.placements.find(group => group.cells.some(cell =>
    cell.cellX === Math.floor(coordinate.x / 32) && cell.cellZ === Math.floor(coordinate.y / 32)));
  if (!placement) return null;
  const anchor = placement.tile.anchors[`${coordinate.x},${coordinate.y}`];
  return anchor ? { x: placement.x - matrix.minX + anchor.x, y: placement.y - matrix.minY + anchor.y } : null;
}

function applyWorldLayout(matrix, pitch, layout) {
  const placements = matrix.placements.map(placement => {
    const offset = layout[placement.header] ?? {};
    const cellX = offset.cellX ?? 0, cellZ = offset.cellZ ?? 0;
    const layoutOffsetX = cellX * 512, layoutOffsetY = cellZ * 512 * Math.sin(pitch);
    return {
      ...placement,
      minCellX: placement.minCellX + cellX,
      minCellZ: placement.minCellZ + cellZ,
      x: placement.x + layoutOffsetX,
      y: placement.y + layoutOffsetY,
      layoutOffsetX,
      layoutOffsetY
    };
  });
  const minX = Math.floor(Math.min(...placements.map(placement => placement.x)));
  const minY = Math.floor(Math.min(...placements.map(placement => placement.y)));
  const maxX = Math.ceil(Math.max(...placements.map(placement => placement.x + placement.tile.width)));
  const maxY = Math.ceil(Math.max(...placements.map(placement => placement.y + placement.tile.height)));
  return { ...matrix, placements, minX, minY, width: maxX - minX, height: maxY - minY };
}

async function writeWorldOverview(matrix, ordered, renderRoot, target) {
  const native = `${target}.native.png`;
  try {
    await sharp({
      create: { width: matrix.width, height: matrix.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      limitInputPixels: false
    }).composite(ordered.map(placement => ({
      input: path.join(renderRoot, 'tiles', `${placement.id}.png`),
      left: Math.round(placement.x - matrix.minX),
      top: Math.round(placement.y - matrix.minY)
    }))).png().toFile(native);
    await sharp(native, { limitInputPixels: false }).resize({ width: Math.max(1, Math.round(matrix.width / 8)) })
      .png({ compressionLevel: 9 }).toFile(target);
  } finally {
    await fs.rm(native, { force: true });
  }
}

export async function buildLayeredWorldFromRender({
  work, rendered, assets, worldId, worldName, layout = {}, detachedAreaIds = [], layerOrderOverrides = [], decorativeLayerIds = []
}) {
  const detachedIdSet = new Set(detachedAreaIds);
  const decorativeIdSet = new Set(decorativeLayerIds);
  const detachedPlacements = new Map(detachedAreaIds.map(areaId => {
    const placements = rendered.main.placements.filter(placement => placement.header === areaId);
    if (placements.length !== 1) throw new Error(`Detached area ${areaId} requires exactly one rendered placement; found ${placements.length}.`);
    return [areaId, placements[0]];
  }));
  const connectedMain = {
    ...rendered.main,
    placements: rendered.main.placements.filter(placement => !detachedIdSet.has(placement.header))
  };
  const main = applyWorldLayout(connectedMain, rendered.pitch, layout);
  for (const decorationId of decorativeIdSet) {
    const count = main.placements.filter(placement => placement.header === decorationId).length;
    if (count !== 1) throw new Error(`World decoration ${decorationId} requires exactly one rendered placement; found ${count}.`);
  }
  const ordered = orderWorldPlacements(main.placements, layerOrderOverrides);
  const overviewImage = await assets.map('WORLD_SINNOH_OVERVIEW.png', target => writeWorldOverview(main, ordered, rendered.root, target));
  const imageByGroup = new Map(), layers = [];
  const alphaLayers = await Promise.all(ordered.map(placement => loadLayerAlpha(placement, main, rendered.root)));
  for (const [order, placement] of ordered.entries()) {
    let image = imageByGroup.get(placement.id);
    if (!image) {
      const fileName = `${placement.id}.png`;
      image = await assets.worldLayer(fileName, target => fs.copyFile(path.join(rendered.root, 'tiles', `${placement.id}.png`), target));
      imageByGroup.set(placement.id, image);
    }
    layers.push({ id: decorativeIdSet.has(placement.header) ? placement.header : placement.id,
      image, x: Math.round(placement.x - main.minX), y: Math.round(placement.y - main.minY),
      width: placement.tile.width, height: placement.tile.height, order, minScale: overviewNativeScale });
  }
  const worldCells = ordered.flatMap(placement => placement.cells.map(cell => ({
    ...cell,
    layoutOffsetX: placement.layoutOffsetX,
    layoutOffsetY: placement.layoutOffsetY
  })));
  const outdoorIds = new Set(worldCells.map(cell => cell.header).filter(header => header && !decorativeIdSet.has(header)));
  const areas = [];
  for (const areaId of outdoorIds) {
    const area = work.areas.get(areaId);
    if (!area) throw new Error(`Connected world references missing source area ${areaId}.`);
    const placements = ordered.filter(placement => placement.header === areaId);
    if (placements.length !== 1) throw new Error(`Connected world area ${areaId} requires exactly one rendered placement; found ${placements.length}.`);
    const placementIndex = ordered.indexOf(placements[0]);
    const regions = visibleRegions(alphaLayers[placementIndex], alphaLayers.slice(placementIndex + 1));
    if (!regions.length) throw new Error(`Connected world area ${areaId} has no visible pixels.`);
    const anchors = markerCoordinates(area, work.areas, outdoorIds).map(coordinate => {
      const projected = projectedPoint(main, coordinate);
      if (!projected) throw new Error(`Could not project ${areaId} marker at (${coordinate.x}, ${coordinate.y}).`);
      return { tileX: coordinate.x, tileY: coordinate.y, x: Math.round(projected.x), y: Math.round(projected.y) };
    });
    areas.push({ id: areaId, regions, anchors });
    area.mapImage = overviewImage;
  }
  return {
    world: { id: worldId, name: worldName, rendering: { overviewImage, width: main.width, height: main.height, layers }, areas },
    outdoorIds,
    detachedPlacements,
    overviewImage
  };
}

export async function attachRenderedAreaMaps({ areas, outdoorIds, detachedPlacements, rendered, assets }) {
  const imageByMatrix = new Map();
  for (const area of areas) {
    if (outdoorIds.has(area.id)) continue;
    const detached = detachedPlacements.get(area.id);
    if (detached) {
      area.mapImage = await assets.map(`${area.id}.png`, target =>
        fs.copyFile(path.join(rendered.root, 'tiles', `${detached.id}.png`), target));
      area.mapWidth = detached.tile.width;
      area.mapHeight = detached.tile.height;
      area.mapAnchors = areaMarkerCoordinates(area).map(coordinate => {
        const anchor = detached.tile.anchors[`${coordinate.x},${coordinate.y}`];
        if (!anchor && hideUnprojectableEntrance(area, coordinate)) return null;
        if (!anchor) throw new Error(`Could not project detached ${area.id} marker at (${coordinate.x}, ${coordinate.y}).`);
        return { tileX: coordinate.x, tileY: coordinate.y, x: Math.round(anchor.x), y: Math.round(anchor.y) };
      }).filter(Boolean);
      continue;
    }
    const matrix = rendered.matrices.get(area.mapMatrixId);
    if (!matrix) throw new Error(`No rendered matrix ${area.mapMatrixId} exists for ${area.id}.`);
    let image = imageByMatrix.get(area.mapMatrixId);
    if (!image) {
      image = await assets.map(`matrix-${String(area.mapMatrixId).padStart(3, '0')}.png`, target => fs.copyFile(matrix.file, target));
      imageByMatrix.set(area.mapMatrixId, image);
    }
    area.mapImage = image;
    area.mapWidth = matrix.width;
    area.mapHeight = matrix.height;
    area.mapAnchors = areaMarkerCoordinates(area).map(coordinate => {
      const projected = projectedPoint(matrix, coordinate);
      const inside = projected && projected.x >= 0 && projected.y >= 0
        && projected.x < matrix.width && projected.y < matrix.height;
      if (!inside && hideUnprojectableEntrance(area, coordinate)) return null;
      if (!inside) throw new Error(`Could not project ${area.id} area marker at (${coordinate.x}, ${coordinate.y}).`);
      return { tileX: coordinate.x, tileY: coordinate.y, x: Math.round(projected.x), y: Math.round(projected.y) };
    }).filter(Boolean);
  }
}
