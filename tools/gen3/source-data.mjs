import fs from 'node:fs';
import path from 'node:path';

import { displayName } from './display-names.mjs';

const itemBallFile = source => [
  'data/item_ball_scripts.inc',
  'data/scripts/item_ball_scripts.inc'
].map(relative => path.join(source, relative)).find(fs.existsSync);

const versionForLabel = (label, versions) =>
  versions.find(version => new RegExp(`(?:^|_)${version.id}(?:_|$)`, 'i').test(label))?.id ?? 'Both';

const encounterType = (map, method) => {
  if (map.map_type === 'MAP_TYPE_UNDERWATER' && method === 'Surf') return 'Underwater';
  return {
    'Grass / cave': 'Random', Surf: 'Surfing', 'Rock Smash': 'RockSmash',
    'Old Rod': 'OldRod', 'Good Rod': 'GoodRod', 'Super Rod': 'SuperRod'
  }[method] ?? (() => { throw new Error(`Gen 3 encounter method '${method}' is not classified.`); })();
};

const mergeVersionRows = (rows, versions) => {
  if (versions.length !== 2) return rows;
  const [first, second] = versions.map(version => version.id), secondRows = rows.filter(row => row.version === second);
  const used = new Set(), merged = rows.filter(row => row.version === 'Both');
  for (const row of rows.filter(candidate => candidate.version === first)) {
    const comparable = JSON.stringify({ ...row, version: undefined });
    const match = secondRows.findIndex((candidate, index) => !used.has(index)
      && JSON.stringify({ ...candidate, version: undefined }) === comparable);
    if (match >= 0) { used.add(match); merged.push({ ...row, version: 'Both' }); }
    else merged.push(row);
  }
  secondRows.forEach((row, index) => { if (!used.has(index)) merged.push(row); });
  return merged;
};

const regionFor = (map, id) => map.map_type === 'MAP_TYPE_UNDERWATER' ? 'Underwater'
  : id.includes('BATTLE_FRONTIER') ? 'Battle Frontier' : 'Hoenn';

const initialBerryTrees = source => {
  const text = fs.readFileSync(path.join(source, 'data/scripts/new_game.inc'), 'utf8');
  return new Map([...text.matchAll(/setberrytree\s+([^,]+),\s*ITEM_TO_BERRY\((ITEM_[A-Z0-9_]+)\)/g)]
    .map(match => [match[1].trim(), displayName(match[2])]));
};

export function readGen3Source({ source, versions }) {
  const layouts = JSON.parse(fs.readFileSync(path.join(source, 'data/layouts/layouts.json'))).layouts;
  const layoutsById = new Map(layouts.map(layout => [layout.id, layout]));
  const globalItemScripts = fs.readFileSync(itemBallFile(source), 'utf8');
  const berryTrees = initialBerryTrees(source), areas = new Map(), sourceMaps = new Map();
  const scriptItem = label => {
    const start = globalItemScripts.indexOf(`${label}::`);
    if (start < 0) return null;
    const next = globalItemScripts.indexOf('\n\n', start);
    return globalItemScripts.slice(start, next < 0 ? undefined : next)
      .match(/\b(?:itemball|finditem)\s+(ITEM_[A-Z0-9_]+)/)?.[1] ?? null;
  };

  for (const directory of fs.readdirSync(path.join(source, 'data/maps'))) {
    const mapFile = path.join(source, 'data/maps', directory, 'map.json');
    if (!fs.existsSync(mapFile)) continue;
    const map = JSON.parse(fs.readFileSync(mapFile));
    sourceMaps.set(map.id, map);
    const layout = layoutsById.get(map.layout);
    const scriptsFile = path.join(source, 'data/maps', directory, 'scripts.inc');
    const area = {
      id: map.id,
      name: displayName(map.id),
      region: regionFor(map, map.id),
      mapLayout: map.layout,
      mapWidth: (layout?.width ?? 0) * 16,
      mapHeight: (layout?.height ?? 0) * 16,
      encounters: [], items: [], resources: [], specialPokemon: [], entrances: [], transports: [],
      scripts: fs.existsSync(scriptsFile) ? fs.readFileSync(scriptsFile, 'utf8') : ''
    };
    area.entrances = (map.warp_events ?? []).map((warp, index) => ({
      id: `${map.id}:warp:${index}`,
      targetId: warp.dest_map === 'MAP_DYNAMIC' ? '' : warp.dest_map,
      name: warp.dest_map === 'MAP_DYNAMIC' ? 'Passage' : displayName(warp.dest_map),
      x: warp.x, y: warp.y
    })).filter(entrance => entrance.x >= 0 && entrance.y >= 0
      && entrance.x < (layout?.width ?? 0) && entrance.y < (layout?.height ?? 0));
    for (const event of map.object_events ?? []) {
      if (event.graphics_id === 'OBJ_EVENT_GFX_ITEM_BALL') {
        const item = scriptItem(event.script);
        if (item) area.items.push({
          id: `${map.id}:visible:${event.x}:${event.y}`,
          name: displayName(item), kind: 'Visible', version: 'Both', icon: 'question_mark.png',
          x: event.x, y: event.y, quantity: 1
        });
      }
      if (event.graphics_id === 'OBJ_EVENT_GFX_BERRY_TREE') {
        const treeId = String(event.trainer_sight_or_berry_tree_id);
        const berry = berryTrees.get(treeId);
        area.resources.push({
          name: berry ?? 'Berry tree', kind: berry ? 'Renewable berry tree · initially seeded' : 'Renewable berry tree plot',
          x: event.x, y: event.y,
          comment: berry ? `Initially planted with ${berry}. The plot can be replanted.` : 'This plot starts empty and can be planted.'
        });
      }
    }
    for (const event of map.bg_events ?? []) if (event.type === 'hidden_item') area.items.push({
      id: `${map.id}:hidden:${event.x}:${event.y}`,
      name: displayName(event.item), kind: 'Hidden', version: 'Both', icon: 'question_mark.png',
      x: event.x, y: event.y, quantity: event.quantity ?? 1
    });
    areas.set(map.id, area);
  }

  const wild = JSON.parse(fs.readFileSync(path.join(source, 'src/data/wild_encounters.json')));
  const group = wild.wild_encounter_groups.find(candidate => candidate.label === 'gWildMonHeaders');
  const rates = Object.fromEntries(group.fields.map(field => [field.type, field.encounter_rates]));
  const fishingGroups = group.fields.find(field => field.type === 'fishing_mons')?.groups ?? {};
  const methods = { land_mons: 'Grass / cave', water_mons: 'Surf', rock_smash_mons: 'Rock Smash' };
  for (const encounterSet of group.encounters ?? []) {
    const area = areas.get(encounterSet.map);
    if (!area) throw new Error(`Wild encounter table targets missing map ${encounterSet.map}.`);
    const sourceMap = sourceMaps.get(encounterSet.map), version = versionForLabel(encounterSet.base_label ?? '', versions);
    for (const [key, block] of Object.entries(encounterSet)) {
      if (!key.endsWith('_mons') || !block?.mons) continue;
      block.mons.forEach((mon, index) => {
        let method = methods[key];
        if (key === 'fishing_mons') {
          const groupName = Object.entries(fishingGroups).find(([, slots]) => slots.includes(index))?.[0];
          method = displayName(groupName ?? 'Fishing');
        }
        const condition = encounterSet.map === 'MAP_ALTERING_CAVE'
          ? `Altering Cave state: ${displayName(block.mons[0].species)}` : null;
        area.encounters.push({
          species: displayName(mon.species), speciesId: mon.species,
          minLevel: mon.min_level, maxLevel: mon.max_level, chance: rates[key][index],
          method, condition, type: encounterType(sourceMap, method), version
        });
      });
    }
  }
  for (const area of areas.values()) area.encounters = mergeVersionRows(area.encounters, versions);
  return { source, versions, areas, sourceMaps, layouts, layoutsById };
}

export function addFeebasEncounters(work) {
  const area = work.areas.get('MAP_ROUTE119');
  if (!area) throw new Error('Route 119 is required for Feebas extraction.');
  const fishing = area.encounters.filter(encounter => ['OldRod', 'GoodRod', 'SuperRod'].includes(encounter.type));
  for (const encounter of fishing) area.encounters.push({
    ...encounter,
    chance: encounter.chance / 2,
    condition: 'Six save-dependent Feebas tiles'
  });
  for (const group of new Map(fishing.map(encounter => [`${encounter.type}|${encounter.method}|${encounter.version}`, encounter])).values())
    area.encounters.push({
      species: 'Feebas', speciesId: 'SPECIES_FEEBAS', minLevel: 20, maxLevel: 25, chance: 50,
      method: group.method, condition: 'Six save-dependent Feebas tiles', type: group.type, version: group.version
    });
}

export function addMassOutbreaks(work, file = 'src/tv.c') {
  const text = fs.readFileSync(path.join(work.source, file), 'utf8');
  const start = Math.max(text.indexOf('gPokeOutbreakSpeciesList'), text.indexOf('sPokeOutbreakSpeciesList'));
  const end = text.indexOf('\n};', start);
  const chunk = text.slice(start, end);
  const blocks = chunk.split(/\n\s*\},?\s*\{/);
  for (const block of blocks) {
    const species = block.match(/\.species\s*=\s*(SPECIES_[A-Z0-9_]+)/)?.[1];
    const level = Number(block.match(/\.level\s*=\s*(\d+)/)?.[1]);
    const routeNumber = block.match(/\.location\s*=\s*(?:MAP_NUM\(MAP_ROUTE|MAPSEC_ROUTE_?)(\d+)\)?/)?.[1];
    const route = routeNumber ? `ROUTE${routeNumber}` : null;
    if (!species || !level || !route) continue;
    const area = work.areas.get(`MAP_${route}`);
    if (!area) throw new Error(`Mass outbreak targets missing map MAP_${route}.`);
    const ordinary = area.encounters.filter(encounter => encounter.type === 'Random' && encounter.condition === null);
    for (const encounter of ordinary) area.encounters.push({
      ...encounter, chance: encounter.chance / 2, condition: `Mass outbreak: ${displayName(species)}`
    });
    for (const version of work.versions.map(entry => entry.id)) area.encounters.push({
      species: displayName(species), speciesId: species, minLevel: level, maxLevel: level, chance: 50,
      method: 'Grass / cave', condition: `Mass outbreak: ${displayName(species)}`, type: 'Random', version
    });
  }
}

const requireArea = (work, id) => {
  const area = work.areas.get(id);
  if (!area) throw new Error(`Hoenn resource audit requires ${id}.`);
  return area;
};

const addResource = (work, mapId, resource, removeEventNames = []) => {
  const area = requireArea(work, mapId);
  area.items = area.items.filter(item => item.kind !== 'Event' || !removeEventNames.includes(item.name));
  area.resources.push(resource);
};

export function addHoennRenewableResources(work) {
  const daily = (mapId, x, y, comment, remove = []) => addResource(work, mapId, {
    name: 'Berry gift', kind: 'Daily berry gift', x, y, comment
  }, remove);
  daily('MAP_ROUTE114', 27, 42, 'Gives one random berry each day.');
  daily('MAP_LILYCOVE_CITY', 50, 7, 'Gives one random berry each day.');
  daily('MAP_ROUTE104_PRETTY_PETAL_FLOWER_SHOP', 11, 6, 'Gives one random berry each day.');
  daily('MAP_SOOTOPOLIS_CITY', 9, 43, 'Kiri gives two berries each day.', ['Figy Berry', 'Iapapa Berry']);
  daily('MAP_ROUTE111', 23, 8, 'Gives one Razz Berry each day.', ['Razz Berry']);
  daily('MAP_ROUTE120', 14, 92, 'Gives one berry each day; the answer and Trainer ID determine the berry.');
  daily('MAP_ROUTE123_BERRY_MASTERS_HOUSE', 4, 4, 'The Berry Master gives two random berries each day.');
  daily('MAP_ROUTE123_BERRY_MASTERS_HOUSE', 7, 4, 'The Berry Master’s wife gives one berry each day; special phrases have one-time rewards.');

  for (const [mapId, name, x, y] of [
    ['MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', 'Shoal Shell', 41, 20],
    ['MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', 'Shoal Shell', 41, 10],
    ['MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', 'Shoal Shell', 6, 9],
    ['MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', 'Shoal Shell', 16, 13],
    ['MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', 'Shoal Salt', 31, 8],
    ['MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', 'Shoal Salt', 14, 26],
    ['MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM', 'Shoal Salt', 11, 11],
    ['MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM', 'Shoal Salt', 18, 2]
  ]) addResource(work, mapId, {
    name, kind: 'Tide-reset pickup', x, y,
    comment: 'Returns after the tide cycle resets the Shoal Cave pickups.'
  }, [name]);

  for (const [lowId, highId, x, y] of [
    ['MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', 'MAP_SHOAL_CAVE_HIGH_TIDE_ENTRANCE_ROOM', 20, 30],
    ['MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', 'MAP_SHOAL_CAVE_HIGH_TIDE_INNER_ROOM', 19, 5]
  ]) {
    const low = requireArea(work, lowId), high = requireArea(work, highId);
    high.includeInNavigation = true;
    low.entrances.push({ id: `${lowId}:tide-state`, targetId: highId, name: high.name, x, y });
    high.entrances.push({ id: `${highId}:tide-state`, targetId: lowId, name: low.name, x, y });
  }
}
