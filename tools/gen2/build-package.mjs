import fs from 'node:fs';
import path from 'node:path';

import { registerQuestionMarkSprites } from '../package-finalization/assets.mjs';
import { displayNameFromConstant, speciesId } from './display-names.mjs';
import { blockPaths } from './map-layouts.mjs';
import { renderMaps } from './map-rendering.mjs';

const grassChances = [30, 30, 20, 10, 5, 4, 1];
const waterChances = [60, 30, 10];
const times = ['Morning', 'Day', 'Night'];
const victoryRoadBranches = new Set(['MAP_ROUTE_22', 'MAP_ROUTE_23', 'MAP_ROUTE_26', 'MAP_ROUTE_28']);
const fruitTreeItemNames = new Map([
  ['BERRY', 'Berry'], ['PSNCUREBERRY', 'PSNCureBerry'], ['BITTER_BERRY', 'Bitter Berry'],
  ['PRZCUREBERRY', 'PRZCureBerry'], ['MYSTERYBERRY', 'MysteryBerry'], ['ICE_BERRY', 'Ice Berry'],
  ['MINT_BERRY', 'Mint Berry'], ['BURNT_BERRY', 'Burnt Berry'], ['RED_APRICORN', 'Red Apricorn'],
  ['BLU_APRICORN', 'Blue Apricorn'], ['BLK_APRICORN', 'Black Apricorn'], ['WHT_APRICORN', 'White Apricorn'],
  ['PNK_APRICORN', 'Pink Apricorn'], ['GRN_APRICORN', 'Green Apricorn'], ['YLW_APRICORN', 'Yellow Apricorn']
]);
const mapId = id => `MAP_${id}`;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function preprocess(text, symbol) {
  const output = [];
  const stack = [];
  let active = true;
  for (const line of text.split(/\r?\n/)) {
    const ifMatch = line.match(/^\s*IF\s+DEF\((_?[A-Z0-9_]+)\)/);
    if (ifMatch) {
      const matches = ifMatch[1] === symbol;
      stack.push({ parent: active, matched: matches });
      active = active && matches;
      continue;
    }
    const elifMatch = line.match(/^\s*ELIF\s+DEF\((_?[A-Z0-9_]+)\)/);
    if (elifMatch && stack.length) {
      const frame = stack.at(-1);
      const matches = !frame.matched && elifMatch[1] === symbol;
      frame.matched ||= matches;
      active = frame.parent && matches;
      continue;
    }
    if (/^\s*ELSE\b/.test(line) && stack.length) {
      const frame = stack.at(-1);
      active = frame.parent && !frame.matched;
      frame.matched = true;
      continue;
    }
    if (/^\s*ENDC\b/.test(line) && stack.length) {
      active = stack.pop().parent;
      continue;
    }
    if (active) output.push(line);
  }
  return output.join('\n');
}

function mergeVersions(rows, versions) {
  if (versions.length === 1) return rows;
  const [first, second] = versions;
  const secondRows = rows.filter(row => row.version === second.id);
  const used = new Set(), merged = rows.filter(row => row.version === 'Both');
  for (const row of rows.filter(candidate => candidate.version === first.id)) {
    const json = JSON.stringify({ ...row, version: undefined });
    const index = secondRows.findIndex((candidate, candidateIndex) => !used.has(candidateIndex)
      && JSON.stringify({ ...candidate, version: undefined }) === json);
    if (index >= 0) {
      used.add(index);
      merged.push({ ...row, version: 'Both' });
    } else merged.push(row);
  }
  secondRows.forEach((row, index) => { if (!used.has(index)) merged.push(row); });
  return merged;
}

function parseMaps(read) {
  const constants = [];
  let group = 0, groupName = '';
  for (const line of read('constants/map_constants.asm').split(/\r?\n/)) {
    const groupMatch = line.match(/^\s*newgroup\s+([A-Z0-9_]+)/);
    if (groupMatch) { group += 1; groupName = groupMatch[1]; continue; }
    const match = line.match(/^\s*map_const\s+([A-Z0-9_]+),\s*(\d+),\s*(\d+)/);
    if (match) constants.push({ key: match[1], width: +match[2], height: +match[3], group, groupName });
  }
  const definitions = [...read('data/maps/maps.asm').matchAll(/^\s*map\s+(\w+),\s*TILESET_([A-Z0-9_]+),\s*([A-Z0-9_]+),\s*(LANDMARK_[A-Z0-9_]+),[^\n]*?,\s*(PALETTE_[A-Z0-9_]+),\s*(FISHGROUP_[A-Z0-9_]+)/gm)]
    .map(match => ({ label: match[1], tileset: match[2], environment: match[3], landmark: match[4], timePalette: match[5], fishGroup: match[6] }));
  if (constants.length !== definitions.length)
    throw new Error(`Map definition audit failed: ${constants.length} constants and ${definitions.length} definitions.`);

  const kantoConstants = read('constants/landmark_constants.asm').split('DEF KANTO_LANDMARK')[1];
  const kantoLandmarks = new Set([...kantoConstants.matchAll(/const\s+(LANDMARK_[A-Z0-9_]+)/g)].map(match => match[1]));
  const maps = new Map();
  constants.forEach((constant, index) => {
    const definition = definitions[index];
    const id = mapId(constant.key);
    let region = kantoLandmarks.has(definition.landmark) ? 'Kanto' : 'Johto';
    if (['LANDMARK_ROUTE_26', 'LANDMARK_ROUTE_27', 'LANDMARK_TOHJO_FALLS', 'LANDMARK_ROUTE_28', 'LANDMARK_SILVER_CAVE'].includes(definition.landmark)) region = 'Kanto';
    maps.set(id, {
      id, ...constant, ...definition, region, excluded: constant.key.endsWith('_BETA'), name: displayNameFromConstant(id),
      connections: [], encounters: [], items: [], resources: [], specialPokemon: [], entrances: []
    });
  });

  for (const chunk of read('data/maps/attributes.asm').split(/(?=^\s*map_attributes\s+)/m)) {
    const header = chunk.match(/^\s*map_attributes\s+\w+,\s*([A-Z0-9_]+)/m);
    if (!header) continue;
    const area = maps.get(mapId(header[1]));
    if (!area) continue;
    area.connections = [...chunk.matchAll(/^\s*connection\s+(north|south|west|east),\s*\w+,\s*([A-Z0-9_]+),\s*(-?\d+)/gm)]
      .map(match => ({ direction: match[1], target: mapId(match[2]), offset: +match[3] }));
  }
  return maps;
}

function parseWildTable(text, kind, version, conditionPrefix = '') {
  const rows = [];
  const tableRegex = kind === 'grass' ? /def_grass_wildmons\s+([A-Z0-9_]+)([\s\S]*?)end_grass_wildmons/g
    : /def_water_wildmons\s+([A-Z0-9_]+)([\s\S]*?)end_water_wildmons/g;
  for (const match of text.matchAll(tableRegex)) {
    const slots = [...match[2].matchAll(/^\s*db\s+(\d+),\s*([A-Z0-9_]+)\s*(?:;.*)?$/gm)]
      .map(slot => ({ level: +slot[1], species: slot[2] }));
    const expected = kind === 'grass' ? 21 : 3;
    if (slots.length !== expected) throw new Error(`${match[1]} ${kind} table has ${slots.length} slots; expected ${expected}.`);
    if (kind === 'grass') for (let time = 0; time < 3; time++) for (let slot = 0; slot < 7; slot++) {
      const mon = slots[time * 7 + slot], condition = [conditionPrefix, times[time]].filter(Boolean).join(' · ');
      rows.push({ map: mapId(match[1]), species: displayNameFromConstant(mon.species), speciesId: speciesId(mon.species), minLevel: mon.level, maxLevel: mon.level,
        chance: grassChances[slot], method: 'Grass / cave', condition, type: 'Random', version });
    } else for (let slot = 0; slot < 3; slot++) {
      const mon = slots[slot];
      rows.push({ map: mapId(match[1]), species: displayNameFromConstant(mon.species), speciesId: speciesId(mon.species), minLevel: mon.level, maxLevel: mon.level,
        chance: waterChances[slot], method: 'Surf', condition: conditionPrefix || null, type: 'Surfing', version });
    }
  }
  return rows;
}

function cumulativeChance(expression) {
  const match = expression.match(/(\d+)\s*percent(?:\s*\+\s*1)?/);
  if (!match) throw new Error(`Cannot parse fishing threshold '${expression.trim()}'.`);
  return +match[1] + (/\+\s*1/.test(expression) ? 1 / 256 * 100 : 0);
}

function parseFishing(read, maps) {
  const text = read('data/wild/fish.asm');
  const layouts = blockPaths(read);
  const fishableCache = new Map();
  const hasFishableWater = area => {
    let tileName = area.tileset.toLowerCase();
    if (!fs.existsSync(path.join(read.root, `data/tilesets/${tileName}_collision.asm`)) && area.tileset === 'DARK_CAVE') tileName = 'cave';
    let fishableBlocks = fishableCache.get(tileName);
    if (!fishableBlocks) {
      const collisionPath = `data/tilesets/${tileName}_collision.asm`;
      const rows = [...read(collisionPath).matchAll(/^\s*tilecoll\s+([^;]+)/gm)].map(match => match[1]);
      fishableBlocks = new Set(rows.flatMap((row, index) => /\b(?:WATER|WHIRLPOOL|WATERFALL|CURRENT_(?:UP|DOWN|LEFT|RIGHT))\b/.test(row) ? [index] : []));
      fishableCache.set(tileName, fishableBlocks);
    }
    const layoutPath = path.join(read.root, layouts.get(area.label) ?? `maps/${area.label}.blk`);
    return fs.existsSync(layoutPath) && fs.readFileSync(layoutPath).some(block => fishableBlocks.has(block));
  };
  const constants = [...read('constants/map_data_constants.asm').matchAll(/^\s*const\s+(FISHGROUP_[A-Z0-9_]+)/gm)]
    .map(match => match[1]).filter(name => name !== 'FISHGROUP_NONE');
  const definitions = [...text.matchAll(/^\s*fishgroup\s+[^,]+,\s*\.([A-Za-z0-9_]+),\s*\.([A-Za-z0-9_]+),\s*\.([A-Za-z0-9_]+)/gm)]
    .map(match => match.slice(1));
  if (constants.length !== definitions.length) throw new Error('Fishing group definition audit failed.');
  const groupLabels = new Map(constants.map((name, index) => [name, definitions[index]]));
  const timeRows = [...text.slice(text.indexOf('TimeFishGroups:')).matchAll(/^\s*db\s+([A-Z0-9_]+),\s*(\d+),\s*([A-Z0-9_]+),\s*(\d+)/gm)]
    .map(match => ({ day: { species: match[1], level: +match[2] }, night: { species: match[3], level: +match[4] } }));
  const labelPositions = [...text.matchAll(/^\.([A-Za-z0-9_]+):/gm)];
  const labelRows = new Map();
  for (let index = 0; index < labelPositions.length; index++) {
    const label = labelPositions[index][1], start = labelPositions[index].index + labelPositions[index][0].length;
    const end = labelPositions[index + 1]?.index ?? text.indexOf('TimeFishGroups:');
    if (start >= end) continue;
    const rows = [];
    let previous = 0;
    for (const match of text.slice(start, end).matchAll(/^\s*db\s+([^,]+(?:\+\s*1)?),\s*(?:time_group\s+(\d+)|([A-Z0-9_]+),\s*(\d+))/gm)) {
      const threshold = cumulativeChance(match[1]);
      rows.push({ chance: threshold - previous, timeGroup: match[2] === undefined ? null : +match[2], species: match[3], level: match[4] ? +match[4] : null });
      previous = threshold;
    }
    if (rows.length) labelRows.set(label, rows);
  }
  const rods = [
    { index: 0, method: 'Old Rod', type: 'OldRod' },
    { index: 1, method: 'Good Rod', type: 'GoodRod' },
    { index: 2, method: 'Super Rod', type: 'SuperRod' }
  ];
  const addGroup = (area, groupName, prefix = '') => {
    const labels = groupLabels.get(groupName);
    if (!labels) return;
    for (const rod of rods) {
      const sourceRows = labelRows.get(labels[rod.index]) ?? [];
      const hasTime = sourceRows.some(row => row.timeGroup !== null);
      const variants = hasTime ? [{ key: 'day', label: 'Morning / Day' }, { key: 'night', label: 'Night' }] : [{ key: null, label: '' }];
      for (const variant of variants) for (const row of sourceRows) {
        const mon = row.timeGroup === null ? row : timeRows[row.timeGroup][variant.key];
        area.encounters.push({ species: displayNameFromConstant(mon.species), speciesId: speciesId(mon.species), minLevel: mon.level, maxLevel: mon.level,
          chance: row.chance, method: rod.method, condition: [prefix, variant.label].filter(Boolean).join(' · ') || null, type: rod.type, version: 'Both' });
      }
    }
  };
  for (const area of maps.values()) {
    if (area.excluded || !hasFishableWater(area)) continue;
    addGroup(area, area.fishGroup);
    if (area.fishGroup === 'FISHGROUP_QWILFISH') addGroup(area, 'FISHGROUP_QWILFISH_SWARM', 'Swarm');
    if (area.fishGroup === 'FISHGROUP_REMORAID') addGroup(area, 'FISHGROUP_REMORAID_SWARM', 'Swarm');
  }
}

function parseTreeEncounters(read, maps, versions) {
  const mapText = read('data/wild/treemon_maps.asm');
  for (const version of versions) {
    const text = preprocess(read('data/wild/treemons.asm'), version.symbol);
    const table = name => {
      const sourceName = name === 'NONE' ? 'CITY' : name;
      const start = text.indexOf(`TreeMonSet_${sourceName[0]}${sourceName.slice(1).toLowerCase()}:`);
      if (start < 0) return [];
      const next = text.indexOf('\nTreeMonSet_', start + 1);
      const chunk = text.slice(start, next < 0 ? undefined : next);
      return chunk.split(/^\s*db\s+-1\s*$/m).map(section => [...section.matchAll(/^\s*db\s+(\d+),\s*([A-Z0-9_]+),\s*(\d+)/gm)]
        .map(match => ({ chance: +match[1], species: match[2], level: +match[3] }))).filter(rows => rows.length);
    };
    for (const match of mapText.slice(mapText.indexOf('TreeMonMaps:'), mapText.indexOf('RockMonMaps:')).matchAll(/treemon_map\s+([A-Z0-9_]+),\s*TREEMON_SET_([A-Z0-9_]+)/g)) {
      if (match[2] === 'NONE') continue;
      const area = maps.get(mapId(match[1])), tables = table(match[2]);
      if (!area) continue;
      tables.slice(0, 2).forEach((rows, tableIndex) => rows.forEach(mon => area.encounters.push({
        species: displayNameFromConstant(mon.species), speciesId: speciesId(mon.species), minLevel: mon.level, maxLevel: mon.level, chance: mon.chance,
        method: 'Headbutt', condition: tableIndex === 0 ? 'Common trees' : 'Rare trees', type: 'Headbutt', version: version.id
      })));
    }
    const rockRows = table('ROCK')[0] ?? [];
    for (const match of mapText.slice(mapText.indexOf('RockMonMaps:')).matchAll(/treemon_map\s+([A-Z0-9_]+),\s*TREEMON_SET_ROCK/g)) {
      const area = maps.get(mapId(match[1]));
      if (!area) continue;
      for (const mon of rockRows) area.encounters.push({ species: displayNameFromConstant(mon.species), speciesId: speciesId(mon.species), minLevel: mon.level, maxLevel: mon.level,
        chance: mon.chance, method: 'Rock Smash', condition: null, type: 'RockSmash', version: version.id });
    }
  }
}

function parseBugContest(read, maps) {
  const area = maps.get('MAP_NATIONAL_PARK_BUG_CONTEST');
  if (!area) throw new Error('The Bug-Catching Contest map is missing.');
  const rows = [...read('data/wild/bug_contest_mons.asm').matchAll(/^\s*db\s+(\d+),\s*([A-Z0-9_]+),\s*(\d+),\s*(\d+)/gm)];
  if (rows.reduce((sum, row) => sum + +row[1], 0) !== 100) throw new Error('Bug-Catching Contest encounter chances do not total 100.');
  for (const row of rows) area.encounters.push({ species: displayNameFromConstant(row[2]), speciesId: speciesId(row[2]), minLevel: +row[3], maxLevel: +row[4],
    chance: +row[1], method: 'Bug-Catching Contest', condition: 'Bug-Catching Contest', type: 'Random', version: 'Both' });
}

function scriptBody(text, label, limit = 600) {
  const match = text.match(new RegExp(`^${escapeRegex(label)}:([\\s\\S]{0,${limit}})`, 'm'));
  return match?.[1] ?? '';
}

function fruitTreeItems(read) {
  const constants = [...read('constants/script_constants.asm').matchAll(/^\s*const\s+(FRUITTREE_[A-Z0-9_]+)/gm)]
    .map(match => match[1]);
  const items = [...read('data/items/fruit_trees.asm').matchAll(/^\s*db\s+([A-Z0-9_]+)\s*;/gm)]
    .map(match => match[1]);
  if (constants.length !== items.length || constants.length === 0)
    throw new Error(`Fruit tree audit failed: ${constants.length} constants and ${items.length} item rows.`);
  return new Map(constants.map((constant, index) => [constant, items[index]]));
}

function parseMapContent(read, maps, versions) {
  const treeItems = fruitTreeItems(read), seenTrees = new Set();
  for (const area of maps.values()) {
    if (area.excluded) continue;
    const relative = `maps/${area.label}.asm`;
    if (!fs.existsSync(path.join(read.root, relative))) continue;
    const raw = read(relative);
    const versionTexts = versions.map(version => ({ version, text: preprocess(raw, version.symbol) }));
    const commonText = versionTexts[0].text;
    let warpIndex = 0;
    for (const match of commonText.matchAll(/^\s*warp_event\s+(-?\d+),\s*(-?\d+),\s*([A-Z0-9_]+),\s*-?\d+(?:\s*;\s*(.*))?$/gm)) {
      if (/\b(inaccessible|unused|debug|prototype|beta)\b/i.test(match[4] ?? '')) continue;
      if (victoryRoadBranches.has(area.id) && ['VICTORY_ROAD', 'VICTORY_ROAD_GATE'].includes(match[3])) continue;
      area.entrances.push({ id: `${area.id}:warp:${warpIndex++}`, x: +match[1], y: +match[2], targetId: mapId(match[3]), name: displayNameFromConstant(match[3]) });
    }
    for (const match of commonText.matchAll(/^\s*object_event\s+(\d+),\s*(\d+),[^\n]*OBJECTTYPE_ITEMBALL,\s*0,\s*([A-Za-z0-9_]+),/gm)) {
      const item = scriptBody(commonText, match[3]).match(/^\s*itemball\s+([A-Z0-9_]+)(?:,\s*(\d+))?/m);
      if (item) area.items.push({ id: `${area.id}:visible:${match[1]}:${match[2]}:${item[1]}`, name: displayNameFromConstant(item[1]), kind: 'Visible', icon: 'question_mark.png', x: +match[1], y: +match[2], quantity: +(item[2] ?? 1) });
    }
    for (const match of commonText.matchAll(/^\s*bg_event\s+(\d+),\s*(\d+),\s*BGEVENT_ITEM,\s*([A-Za-z0-9_]+)/gm)) {
      const item = scriptBody(commonText, match[3]).match(/^\s*hiddenitem\s+([A-Z0-9_]+)/m);
      if (item) area.items.push({ id: `${area.id}:hidden:${match[1]}:${match[2]}:${item[1]}`, name: displayNameFromConstant(item[1]), kind: 'Hidden', icon: 'question_mark.png', x: +match[1], y: +match[2], quantity: 1 });
    }
    for (const match of commonText.matchAll(/^\s*object_event\s+(\d+),\s*(\d+),\s*SPRITE_FRUIT_TREE,[^\n]*OBJECTTYPE_SCRIPT,\s*0,\s*([A-Za-z0-9_]+),/gm)) {
      const tree = scriptBody(commonText, match[3]).match(/^\s*fruittree\s+(FRUITTREE_[A-Z0-9_]+)/m)?.[1];
      if (!tree || !treeItems.has(tree)) throw new Error(`${area.id}: fruit tree ${match[3]} does not resolve to a known item.`);
      if (seenTrees.has(tree)) throw new Error(`${area.id}: duplicate fruit tree constant ${tree}.`);
      seenTrees.add(tree);
      const item = treeItems.get(tree);
      const name = fruitTreeItemNames.get(item);
      if (!name) throw new Error(`${area.id}: fruit tree item ${item} has no in-game display name.`);
      area.resources.push({ name, kind: 'Daily fruit tree', x: +match[1], y: +match[2] });
    }
    const eventSeen = new Set();
    for (const match of commonText.matchAll(/^\s*(?:verbosegiveitem|giveitem)\s+([A-Z][A-Z0-9_]*)(?:,\s*(\d+))?/gm)) {
      if (match[1] === 'ITEM_FROM_MEM') continue;
      const key = `${match[1]}:${match.index}`;
      if (eventSeen.has(key)) continue;
      eventSeen.add(key);
      area.items.push({ id: `${area.id}:event:${match[1]}:${match.index}`, name: displayNameFromConstant(match[1]), kind: 'Event', icon: 'question_mark.png', x: -1, y: -1, quantity: +(match[2] ?? 1) });
    }
    const specials = [];
    for (const { version, text } of versionTexts) {
      for (const match of text.matchAll(/^\s*(givepoke|giveegg)\s+([A-Z0-9_]+),\s*([A-Z0-9_]+)/gm)) {
        const localLabel = [...text.slice(0, match.index).matchAll(/^\s*(\.[A-Za-z0-9_]+):\s*$/gm)].at(-1)?.[1].toLowerCase() ?? '';
        const requiredVersion = localLabel.startsWith('.gold_') ? 'Gold' : localLabel.startsWith('.silver_') ? 'Silver' : null;
        if (requiredVersion && requiredVersion !== version.id) continue;
        const level = /^\d+$/.test(match[3]) ? +match[3] : match[1] === 'giveegg' ? 5 : 0;
        specials.push({ species: match[2], level, kind: match[1] === 'giveegg' ? 'Egg' : 'Gift', version: version.id, index: match.index });
      }
      for (const match of text.matchAll(/^\s*loadwildmon\s+([A-Z0-9_]+),\s*(\d+)([\s\S]{0,100}?^\s*startbattle\b)/gm))
        specials.push({ species: match[1], level: +match[2], kind: 'Static', version: version.id, index: match.index });
    }
    for (const special of mergeVersions(specials, versions)) {
      area.specialPokemon.push({ id: `${area.id}:${special.kind}:${special.species}:${special.version}:${special.index}`, species: displayNameFromConstant(special.species), speciesId: speciesId(special.species),
        level: special.level, kind: special.kind, version: special.version, requestedSpecies: null });
    }
  }
  if (seenTrees.size !== treeItems.size)
    throw new Error(`Fruit tree audit failed: resolved ${seenTrees.size} of ${treeItems.size} trees.`);
}

function parseTrades(read, maps) {
  const constants = [...read('constants/npc_trade_constants.asm').matchAll(/^\s*const\s+NPC_TRADE_([A-Z0-9_]+)/gm)].map(match => match[1]);
  const records = [...read('data/events/npc_trades.asm').matchAll(/^\s*npctrade\s+[^,]+,\s*([A-Z0-9_]+),\s*([A-Z0-9_]+)/gm)]
    .map(match => ({ requested: match[1], offered: match[2] }));
  const trades = new Map(constants.map((name, index) => [name, records[index]]));
  for (const area of maps.values()) {
    if (area.excluded) continue;
    const relative = `maps/${area.label}.asm`;
    if (!fs.existsSync(path.join(read.root, relative))) continue;
    for (const match of read(relative).matchAll(/^\s*trade\s+NPC_TRADE_([A-Z0-9_]+)/gm)) {
      const trade = trades.get(match[1]);
      if (!trade) throw new Error(`Unknown NPC trade ${match[1]}.`);
      area.specialPokemon.push({ id: `${area.id}:Trade:${trade.offered}`, species: displayNameFromConstant(trade.offered), speciesId: speciesId(trade.offered), level: 0,
        kind: 'Trade', version: 'Both', requestedSpecies: displayNameFromConstant(trade.requested) });
    }
  }
}

function parseSpecies(read) {
  return [...read('constants/pokemon_constants.asm').matchAll(/^\s*const\s+([A-Z][A-Z0-9_]+)\s*;/gm)].map(match => match[1]).slice(0, 251);
}

function buildPokedex(read, maps, species, versions) {
  const newOrder = [...read('data/pokemon/dex_order_new.asm').matchAll(/^\s*db\s+([A-Z0-9_]+)/gm)].map(match => match[1]);
  const newNumbers = new Map(newOrder.map((name, index) => [name, index + 1]));
  const obtainable = Object.fromEntries(versions.map(version => [version.id, new Set()]));
  for (const area of maps.values()) for (const version of versions) {
    for (const encounter of area.encounters) if (encounter.version === 'Both' || encounter.version === version.id) obtainable[version.id].add(encounter.speciesId);
    for (const special of area.specialPokemon) if (special.version === 'Both' || special.version === version.id) obtainable[version.id].add(special.speciesId);
  }
  const links = [];
  for (const chunk of read('data/pokemon/evos_attacks.asm').split(/(?=^[A-Za-z0-9]+EvosAttacks:)/m)) {
    const label = chunk.match(/^([A-Za-z0-9]+)EvosAttacks:/m)?.[1]?.toUpperCase();
    const from = species.find(name => name.replaceAll('_', '') === label);
    if (!from) continue;
    const evolutionBlock = chunk.slice(0, chunk.search(/^\s*db\s+0/m));
    for (const match of evolutionBlock.matchAll(/^\s*db\s+(EVOLVE_[A-Z]+),[^\n,]+(?:,[^\n,]+)?,\s*([A-Z0-9_]+)\s*$/gm))
      if (match[1] !== 'EVOLVE_TRADE') links.push([speciesId(from), speciesId(match[2])]);
  }
  const breedingLinks = [
    ['PIKACHU', 'PICHU'], ['CLEFAIRY', 'CLEFFA'], ['JIGGLYPUFF', 'IGGLYBUFF'],
    ['JYNX', 'SMOOCHUM'], ['ELECTABUZZ', 'ELEKID'], ['MAGMAR', 'MAGBY'], ['HITMONLEE', 'TYROGUE']
  ].map(([from, to]) => [speciesId(from), speciesId(to)]);
  for (const version of versions) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [from, to] of links) if (obtainable[version.id].has(from) && !obtainable[version.id].has(to)) { obtainable[version.id].add(to); changed = true; }
      for (const [from, to] of breedingLinks) if (obtainable[version.id].has(from) && !obtainable[version.id].has(to)) { obtainable[version.id].add(to); changed = true; }
    }
  }
  const event = new Set(['MEW', 'CELEBI']);
  return species.map((name, index) => ({ number: index + 1, regionalNumber: newNumbers.get(name) ?? null, name: displayNameFromConstant(name), speciesId: speciesId(name),
    availability: Object.fromEntries(versions.map(version => [version.id, event.has(name) ? 'Event distribution'
      : obtainable[version.id].has(speciesId(name)) ? 'Obtainable' : 'Trade / transfer required'])) }));
}

export async function prepareGen2Package({ source, sourceName, versions, assets, sharp, tilesetGraphics = new Map() }) {
  const root = path.resolve(source);
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
  read.root = root;
  if (!fs.existsSync(path.join(root, 'constants/map_constants.asm'))) throw new Error(`${root} is not a compatible ${sourceName} checkout.`);
  const maps = parseMaps(read);
  for (const version of versions) {
    for (const file of ['johto_grass.asm', 'kanto_grass.asm']) {
      const rows = parseWildTable(preprocess(read(`data/wild/${file}`), version.symbol), 'grass', version.id);
      for (const { map, ...row } of rows) maps.get(map)?.encounters.push(row);
    }
    for (const file of ['johto_water.asm', 'kanto_water.asm']) {
      const rows = parseWildTable(preprocess(read(`data/wild/${file}`), version.symbol), 'water', version.id);
      for (const { map, ...row } of rows) maps.get(map)?.encounters.push(row);
    }
    const swarmRows = parseWildTable(preprocess(read('data/wild/swarm_grass.asm'), version.symbol), 'grass', version.id, 'Swarm');
    for (const { map, ...row } of swarmRows) maps.get(map)?.encounters.push(row);
  }
  parseFishing(read, maps);
  parseTreeEncounters(read, maps, versions);
  parseBugContest(read, maps);
  for (const area of maps.values()) area.encounters = mergeVersions(area.encounters, versions);
  parseMapContent(read, maps, versions);
  maps.get('MAP_NATIONAL_PARK')?.entrances.push({
    id: 'MAP_NATIONAL_PARK:bug-contest', targetId: 'MAP_NATIONAL_PARK_BUG_CONTEST', name: 'National Park Bug Contest', x: 10, y: 47
  });
  parseTrades(read, maps);
  for (const area of maps.values()) if (area.excluded) {
    area.encounters = [];
    area.items = [];
    area.resources = [];
    area.specialPokemon = [];
    area.entrances = [];
  }
  await renderMaps(read, maps, assets, sharp, tilesetGraphics);
  const species = parseSpecies(read);
  return { sourceName, read, maps, species, versions, assets, sharp };
}

export async function finishGen2Package(work, { world, pokemonSprites, pokemonSpritesByVersion = {} }) {
  const { sourceName, read, maps, species, versions, assets, sharp } = work;
  const pokedex = buildPokedex(read, maps, species, versions);
  const pokemonFallback = await registerQuestionMarkSprites(assets, sharp);
  const areas = [...maps.values()].filter(area => !area.excluded);
  for (const area of areas) {
    delete area.key; delete area.width; delete area.height; delete area.group; delete area.groupName; delete area.label; delete area.tileset; delete area.excluded;
    delete area.environment; delete area.landmark; delete area.timePalette; delete area.fishGroup; delete area.connections;
  }
  return {
    source: sourceName,
    generated: new Date().toISOString().slice(0, 10),
    areas,
    worlds: [world],
    pokedex,
    pokemonSprites,
    pokemonSpritesByVersion,
    pokemonFallback
  };
}
