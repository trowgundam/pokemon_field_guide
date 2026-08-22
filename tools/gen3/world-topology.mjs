import { renderConnectedWorld } from './map-rendering.mjs';

const cardinalDirections = new Set(['up', 'down', 'left', 'right']);
const diveDirections = new Set(['dive', 'emerge']);

function expandComponent(work, eligible, rootId) {
  if (!eligible.has(rootId)) throw new Error(`World root ${rootId} is not eligible for placement.`);
  const component = new Set([rootId]), pending = [rootId];
  while (pending.length) {
    const map = work.sourceMaps.get(pending.shift());
    if (!map) throw new Error(`World root component references missing source map.`);
    for (const connection of map.connections ?? []) {
      if (!cardinalDirections.has(connection.direction)
        || !eligible.has(connection.map) || component.has(connection.map)) continue;
      component.add(connection.map);
      pending.push(connection.map);
    }
  }
  return [...component];
}

function markerForConnection(work, source, target, connection) {
  const sourceLayout = work.layoutsById.get(source.layout);
  const targetLayout = work.layoutsById.get(target.layout);
  if (!sourceLayout || !targetLayout) throw new Error(`Connection ${source.id} -> ${target.id} lacks a source layout.`);
  if (diveDirections.has(connection.direction)) return {
    x: Math.floor(sourceLayout.width / 2), y: Math.floor(sourceLayout.height / 2)
  };

  const horizontal = connection.direction === 'up' || connection.direction === 'down';
  const sourceLength = horizontal ? sourceLayout.width : sourceLayout.height;
  const targetLength = horizontal ? targetLayout.width : targetLayout.height;
  const start = Math.max(0, connection.offset), end = Math.min(sourceLength, connection.offset + targetLength);
  if (start >= end) throw new Error(`Connection ${source.id} -> ${target.id} has no overlapping edge.`);
  const midpoint = Math.floor((start + end - 1) / 2);
  return connection.direction === 'up' ? { x: midpoint, y: 0 }
    : connection.direction === 'down' ? { x: midpoint, y: sourceLayout.height - 1 }
      : connection.direction === 'left' ? { x: 0, y: midpoint }
        : { x: sourceLayout.width - 1, y: midpoint };
}

function addEntrance(area, entrance) {
  if (area.entrances.some(existing => existing.targetId === entrance.targetId
    && existing.x === entrance.x && existing.y === entrance.y)) return;
  area.entrances.push(entrance);
}

function scriptedDiveWarps(work, excluded) {
  const warps = [];
  for (const area of work.areas.values()) {
    for (const match of area.scripts.matchAll(/\bsetdivewarp\s+(MAP_[A-Z0-9_]+),\s*(?:255,\s*)?(\d+),\s*(\d+)/g)) {
      if (!excluded.test(area.id) && !excluded.test(match[1]) && work.areas.has(match[1])) {
        warps.push({ sourceId: area.id, targetId: match[1], x: Number(match[2]), y: Number(match[3]) });
      }
    }
  }
  return warps;
}

function materializeInteriorTopology(work, worlds, excluded) {
  const placed = new Set(worlds.flatMap(world => world.maps.map(map => map.id)));
  for (const source of work.sourceMaps.values()) {
    if (excluded.test(source.id)) continue;
    for (const connection of source.connections ?? []) {
      if ((!cardinalDirections.has(connection.direction) && !diveDirections.has(connection.direction))
        || excluded.test(connection.map) || !work.areas.has(connection.map)
        || placed.has(source.id) && placed.has(connection.map)) continue;
      const target = work.sourceMaps.get(connection.map);
      const marker = markerForConnection(work, source, target, connection);
      const area = work.areas.get(source.id);
      const targetArea = work.areas.get(connection.map);
      addEntrance(area, {
        id: `${source.id}:connection:${connection.direction}:${connection.map}`,
        targetId: connection.map,
        name: targetArea.name,
        ...marker
      });
      if (diveDirections.has(connection.direction) && !placed.has(source.id)) area.includeInNavigation = true;
    }
  }

  const diveWarps = scriptedDiveWarps(work, excluded);
  for (const warp of diveWarps) {
    const reverse = diveWarps.find(candidate => candidate.sourceId === warp.targetId && candidate.targetId === warp.sourceId);
    if (!reverse || placed.has(warp.sourceId) && placed.has(warp.targetId)) continue;
    const area = work.areas.get(warp.sourceId);
    addEntrance(area, {
      id: `${warp.sourceId}:dive:${warp.targetId}`,
      targetId: warp.targetId,
      name: work.areas.get(warp.targetId).name,
      x: reverse.x,
      y: reverse.y
    });
    if (!placed.has(warp.sourceId)) area.includeInNavigation = true;
  }
}

export async function realizeGen3Topology(work, rendered, plans, excluded) {
  const claimed = new Set(), eligibleAreas = new Set(), worlds = [];
  for (const plan of plans) {
    if (!plan.roots.length) throw new Error(`${plan.id} must declare at least one world root.`);
    const eligible = new Set(plan.eligibleMapIds), components = [];
    for (const id of eligible) eligibleAreas.add(id);
    for (const [index, root] of plan.roots.entries()) {
      if (index > 0 && !root.reason?.trim()) throw new Error(`${plan.id} additional root ${root.id} lacks a reason.`);
      const component = expandComponent(work, eligible, root.id);
      if (component.some(id => claimed.has(id))) throw new Error(`${plan.id} root ${root.id} overlaps another declared world component.`);
      for (const id of component) claimed.add(id);
      components.push(component);
    }
    const mapIds = components.flat();
    worlds.push(await renderConnectedWorld(rendered, {
      id: plan.id, name: plan.name, mapIds, rootId: plan.roots[0].id
    }));
  }
  for (const id of eligibleAreas) if (!claimed.has(id) && !excluded.test(id) && work.areas.has(id)) {
    work.areas.get(id).includeInNavigation = true;
  }
  materializeInteriorTopology(work, worlds, excluded);
  return worlds;
}
