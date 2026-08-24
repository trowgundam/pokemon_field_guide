import fs from 'node:fs';
import path from 'node:path';

import { displayName, fileSlug } from '../gen4/display-names.mjs';
import { addDailyLandPool, addFeebasFishing } from '../gen4/special-encounters.mjs';
import { addPlatinumScriptedItems } from './scripted-items.mjs';

const excluded = /(?:^MAP_HEADER_(?:EVERYWHERE|NOTHING|UNDERGROUND)|UNUSED|UNKNOWN|UNION_ROOM|CONTEST_HALL_STAGE|GTS|GLOBAL_TERMINAL|BATTLE_(?:ARCADE|CASTLE|FACTORY|HALL|TOWER)(?:_|$)|WI-?FI|WIFI|MULTI_BATTLE|COMMUNICATION|DEBUG)/;
const landChances = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1];
const waterChances = [60, 30, 5, 4, 1];

const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));

function blocks(text) {
  return new Map([...text.matchAll(/\[(MAP_HEADER_[A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g)]
    .map(match => [match[1], match[2]]));
}

const field = (body, name) => body.match(new RegExp(`\\.${name}\\s*=\\s*([A-Z_a-z0-9]+)`))?.[1];

function itemCatalog(source) {
  const items = new Map();
  for (const file of fs.readdirSync(path.join(source, 'res/items/data')).filter(file => file.endsWith('.json'))) {
    const id = `ITEM_${path.basename(file, '.json').toUpperCase()}`;
    const data = json(path.join(source, 'res/items/data', file));
    const move = data.teachesMove ? displayName(data.teachesMove) : null;
    items.set(id, {
      id,
      name: move ? `${data.name} - ${move}` : data.name,
      icon: data.icon.sprite.replace(/_NCGR$/, '').toLowerCase()
    });
  }
  return items;
}

function visibleItemScripts(source) {
  const text = read(path.join(source, 'res/field/scripts/scripts_visible_items.s'));
  const labels = [...text.matchAll(/^\s*ScriptEntry\s+([A-Za-z0-9_]+)/gm)].map(match => match[1]);
  const items = new Map();
  labels.forEach((label, index) => {
    const start = text.indexOf(`${label}:`), end = text.indexOf('\n\n', start);
    const item = text.slice(start, end < 0 ? undefined : end).match(/SetVar\s+VAR_0x8008,\s*(ITEM_[A-Z0-9_]+)/)?.[1];
    if (item) items.set(7000 + index, item);
  });
  return items;
}

function hiddenItemScripts(source) {
  const text = read(path.join(source, 'include/data/field/hidden_items.h'));
  return [...text.matchAll(/HIDDEN_ITEM_ENTRY\((ITEM_[A-Z0-9_]+),\s*(\d+),[^,]+,\s*(FLAG_[A-Z0-9_]+)\)/g)]
    .map((match, index) => ({ script: 8000 + index, item: match[1], quantity: Number(match[2]), flag: match[3] }));
}

function encounters(source, archive, speciesName) {
  if (!archive || archive === 'ENCOUNTERS_NONE') return [];
  const file = path.join(source, 'res/field/encounters', `${archive}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing encounter source ${archive}.json.`);
  const data = json(file), rows = [];
  const add = (slot, chance, method, type, condition = null) => {
    if (!slot || slot.species === 'SPECIES_NONE' || chance <= 0) return;
    rows.push({ species: speciesName(slot.species), speciesId: slot.species, minLevel: slot.level_min ?? slot.level, maxLevel: slot.level_max ?? slot.level,
      chance, method, condition, type, version: 'Both' });
  };
  data.land_encounters?.forEach((slot, index) => add(slot, landChances[index], 'Grass / cave', 'Random'));
  for (const [key, method, type] of [
    ['surf_encounters', 'Surf', 'Surfing'], ['old_rod_encounters', 'Old Rod', 'OldRod'],
    ['good_rod_encounters', 'Good Rod', 'GoodRod'], ['super_rod_encounters', 'Super Rod', 'SuperRod']
  ]) data[key]?.forEach((slot, index) => add(slot, waterChances[index], method, type));
  const variants = [
    ['swarms', [0, 1], 'Mass outbreak'], ['day', [2, 3], 'Day'], ['night', [2, 3], 'Night'],
    ['radar', [4, 5, 10, 11], 'Poké Radar'], ['ruby', [8, 9], 'Ruby inserted'],
    ['sapphire', [8, 9], 'Sapphire inserted'], ['emerald', [8, 9], 'Emerald inserted'],
    ['firered', [8, 9], 'FireRed inserted'], ['leafgreen', [8, 9], 'LeafGreen inserted']
  ];
  for (const [key, indexes, condition] of variants) {
    const replacements = data[key];
    if (!replacements?.some(species => species !== 'SPECIES_NONE')) continue;
    const table = data.land_encounters.map((slot, index) => indexes.includes(index)
      ? { ...slot, species: replacements[indexes.indexOf(index)] } : slot);
    table.forEach((slot, index) => add(slot, landChances[index], 'Grass / cave', 'Random', condition));
  }
  return rows;
}

function addScriptPokemon(area, source, scriptArchive) {
  const file = path.join(source, 'res/field/scripts', `${scriptArchive}.s`);
  if (!fs.existsSync(file)) return;
  const text = read(file), seen = new Set();
  for (const match of text.matchAll(/\b(?:StartLegendaryBattle|StartWildBattle|StartGiratinaOriginBattle|StartFatefulEncounter)\s+(SPECIES_[A-Z0-9_]+),\s*(\d+)/g)) {
    const key = `${match[1]}:${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    area.specialPokemon.push({ id: `${area.id}:static:${match[1]}:Both`, species: displayName(match[1]), speciesId: match[1], level: Number(match[2]), kind: 'Static', version: 'Both' });
  }
  for (const match of text.matchAll(/\bGivePokemon\s+(SPECIES_[A-Z0-9_]+),\s*(\d+)/g)) {
    const key = `${match[1]}:${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    area.specialPokemon.push({ id: `${area.id}:gift:${match[1]}:Both`, species: displayName(match[1]), speciesId: match[1], level: Number(match[2]), kind: 'Gift', version: 'Both' });
  }
  for (const match of text.matchAll(/\bGiveEgg\s+(SPECIES_[A-Z0-9_]+)/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    area.specialPokemon.push({ id: `${area.id}:egg:${match[1]}:Both`, species: displayName(match[1]), speciesId: match[1], level: 1, kind: 'Gift Egg', version: 'Both' });
  }
}

function addManualPokemon(areas) {
  const add = (id, species, level, kind = 'Static', version = 'Both', requestedSpecies = null, note = null) => {
    const area = areas.get(id);
    if (!area) throw new Error(`Gen 4 acquisition targets missing ${id}.`);
    area.specialPokemon.push({ id: `${id}:${kind.toLowerCase().replaceAll(' ', '-')}:${species}:${version}`, species: displayName(species), speciesId: species, level, kind, version, requestedSpecies, note });
  };
  for (const species of ['SPECIES_TURTWIG', 'SPECIES_CHIMCHAR', 'SPECIES_PIPLUP']) add('MAP_HEADER_ROUTE_201', species, 5, 'Starter');
  add('MAP_HEADER_MINING_MUSEUM', 'SPECIES_CRANIDOS', 20, 'Fossil revival');
  add('MAP_HEADER_MINING_MUSEUM', 'SPECIES_SHIELDON', 20, 'Fossil revival');
  add('MAP_HEADER_FULLMOON_ISLAND_FOREST', 'SPECIES_CRESSELIA', 50, 'Roaming');
  add('MAP_HEADER_VERITY_CAVERN', 'SPECIES_MESPRIT', 50, 'Roaming');
  for (const species of ['SPECIES_ARTICUNO', 'SPECIES_ZAPDOS', 'SPECIES_MOLTRES'])
    add('MAP_HEADER_ETERNA_CITY_SOUTH_HOUSE', species, 60, 'Roaming');
  const spiritomb = areas.get('MAP_HEADER_ROUTE_209')?.specialPokemon.find(entry => entry.speciesId === 'SPECIES_SPIRITOMB');
  if (!spiritomb) throw new Error('Could not locate the scripted Platinum Spiritomb encounter.');
  spiritomb.note = 'Requires 32 conversations with other players in the Underground.';
  add('MAP_HEADER_SANDGEM_TOWN', 'SPECIES_MANAPHY', 1, 'Event Egg');
  for (const [id, species, requested] of [
    ['MAP_HEADER_OREBURGH_CITY_NORTHWEST_HOUSE_1F', 'SPECIES_ABRA', 'Machop'],
    ['MAP_HEADER_ETERNA_CITY_CONDOMINIUMS_1F', 'SPECIES_CHATOT', 'Buizel'],
    ['MAP_HEADER_SNOWPOINT_CITY_WEST_HOUSE', 'SPECIES_HAUNTER', 'Medicham'],
    ['MAP_HEADER_ROUTE_226', 'SPECIES_MAGIKARP', 'Finneon']
  ]) add(id, species, 0, 'Trade', 'Both', requested);
}

function addManualItems(areas, items) {
  const area = areas.get('MAP_HEADER_TURNBACK_CAVE_GIRATINA_ROOM');
  const item = items.get('ITEM_GRISEOUS_ORB');
  if (!area || !item) throw new Error('Could not place the scripted Turnback Cave Griseous Orb.');
  area.items.push({ id: `${area.id}:visible:11:13`, name: item.name, kind: 'Visible', version: 'Both', iconId: item.icon, x: 11, y: 13, quantity: 1 });
}

function addHoneyTreeEncounters(source, areas, speciesName) {
  const treeSource = read(path.join(source, 'src/overlay005/honey_tree.c'));
  const mapBlock = treeSource.match(/sHoneyTreeMapHeaderIDs\[NUM_HONEY_TREES\]\s*=\s*\{([\s\S]*?)\};/)?.[1];
  if (!mapBlock) throw new Error('Could not extract Platinum Honey Tree locations.');
  const mapIds = [...mapBlock.matchAll(/MAP_HEADER_[A-Z0-9_]+/g)].map(match => match[0]);
  const tables = json(path.join(source, 'res/field/encounters/encounters_honey_tree.json'));
  const weights = [40, 20, 20, 10, 5, 5];
  for (const mapId of mapIds) {
    const area = areas.get(mapId);
    if (!area) throw new Error(`Honey Tree location ${mapId} has no guide area.`);
    for (const [key, condition] of [['common', 'Honey Tree · common group'], ['uncommon', 'Honey Tree · uncommon group'], ['rare', 'Honey Tree · Munchlax tree group']]) {
      const bySpecies = new Map();
      tables[key].forEach((speciesId, index) => bySpecies.set(speciesId, (bySpecies.get(speciesId) ?? 0) + weights[index]));
      area.encounters.push(...[...bySpecies].map(([speciesId, chance]) => ({
        species: speciesName(speciesId), speciesId, minLevel: 5, maxLevel: 15, chance,
        method: 'Honey Tree', condition, type: 'Random', version: 'Both'
      })));
    }
  }
}

function evolutionClosure(source, obtainable) {
  const links = [];
  for (const directory of fs.readdirSync(path.join(source, 'res/pokemon'))) {
    const file = path.join(source, 'res/pokemon', directory, 'data.json');
    if (!fs.existsSync(file)) continue;
    const data = json(file), before = `SPECIES_${directory.toUpperCase()}`;
    for (const evolution of data.evolutions ?? []) {
      const method = evolution[0], after = evolution.at(-1);
      if (!String(method).includes('TRADE')) links.push([before, after]);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [before, after] of links) if (obtainable.has(before) !== obtainable.has(after)) {
      obtainable.add(before); obtainable.add(after); changed = true;
    }
  }
}

export function buildPlatinumSource(source) {
  source = path.resolve(source);
  const headerBlocks = blocks(read(path.join(source, 'include/data/map_headers.h')));
  const items = itemCatalog(source), visible = visibleItemScripts(source), hidden = new Map(hiddenItemScripts(source).map(item => [item.script, item]));
  const species = read(path.join(source, 'generated/species.txt')).trim().split(/\r?\n/).slice(1, 494);
  const speciesName = id => {
    const folder = fileSlug(id);
    const file = path.join(source, 'res/pokemon', folder, 'data.json');
    return fs.existsSync(file) ? json(file).pokedex_data.en.name.replace(/\b\w+/g, word => `${word[0]}${word.slice(1).toLowerCase()}`) : displayName(id);
  };
  const areas = new Map(), headers = new Map();
  for (const [id, body] of headerBlocks) {
    if (excluded.test(id)) continue;
    const matrixArchive = field(body, 'mapMatrixID'), eventArchive = field(body, 'eventsArchiveID');
    if (!matrixArchive || !eventArchive) continue;
    const matrixId = Number(matrixArchive.match(/(\d+)$/)?.[1]), matrixFile = path.join(source, `res/field/matrices/map_matrix_${String(matrixId).padStart(3, '0')}.json`);
    const eventFile = path.join(source, 'res/field/events', `${eventArchive}.json`);
    if (!fs.existsSync(matrixFile) || !fs.existsSync(eventFile)) continue;
    const matrix = json(matrixFile), events = json(eventFile), scriptArchive = field(body, 'scriptsArchiveID');
    const area = {
      id, name: displayName(id), region: id.includes('BATTLE') || /FIGHT_AREA|SURVIVAL_AREA|RESORT_AREA|ROUTE_22[5-9]|ROUTE_230|STARK_MOUNTAIN/.test(id) ? 'Battle Zone' : 'Sinnoh',
      mapMatrixId: matrixId, mapWidth: matrix.maps[0].length * 32 * 16, mapHeight: matrix.maps.length * 32 * 16,
      encounters: encounters(source, field(body, 'wildEncountersArchiveID'), speciesName), items: [], resources: [], specialPokemon: [], entrances: [], transports: []
    };
    for (const [index, warp] of (events.warp_events ?? []).entries()) area.entrances.push({
      id: `${id}:warp:${index}`, targetId: warp.dest_header_id, name: displayName(warp.dest_header_id), x: warp.x, y: warp.z, version: 'Both'
    });
    for (const event of events.object_events ?? []) {
      if (event.graphics_id !== 'OBJ_EVENT_GFX_POKEBALL') continue;
      const itemId = visible.get(Number(event.script)) ?? event.id?.replace('LOCALID_', 'ITEM_').replace(/^ITEM_ITEM_/, 'ITEM_');
      const item = items.get(itemId);
      if (!item) continue;
      area.items.push({ id: `${id}:visible:${event.x}:${event.z}`, name: item.name, kind: 'Visible', version: 'Both', iconId: item.icon, x: event.x, y: event.z, quantity: 1 });
    }
    for (const event of events.bg_events ?? []) {
      const itemEntry = hidden.get(Number(event.script)), item = itemEntry && items.get(itemEntry.item);
      if (!item) continue;
      area.items.push({ id: `${id}:hidden:${event.x}:${event.z}`, name: item.name, kind: 'Hidden', version: 'Both', iconId: item.icon, x: event.x, y: event.z, quantity: itemEntry.quantity });
    }
    addScriptPokemon(area, source, scriptArchive);
    areas.set(id, area);
    headers.set(id, { id, body, matrix, events, matrixId, scriptArchive });
  }
  addManualPokemon(areas);
  addManualItems(areas, items);
  addPlatinumScriptedItems(source, areas, headers, items);
  addHoneyTreeEncounters(source, areas, speciesName);
  const trophy = json(path.join(source, 'res/field/encounters/encounters_trophy_garden.json'));
  addDailyLandPool(areas.get('MAP_HEADER_TROPHY_GARDEN'), ['Both'], trophy.daily_encounters, speciesName,
    'Trophy Garden', 'Trophy Garden daily pool · National Pokédex');
  const marsh = json(path.join(source, 'res/field/encounters/encounters_great_marsh_lookout.json'));
  for (const id of Array.from({ length: 6 }, (_, index) => `MAP_HEADER_GREAT_MARSH_${index + 1}`)) {
    addDailyLandPool(areas.get(id), ['Both'], marsh.before_national_dex, speciesName,
      'Great Marsh daily Pokémon', 'Great Marsh daily pool · Before National Pokédex');
    addDailyLandPool(areas.get(id), ['Both'], marsh.after_national_dex, speciesName,
      'Great Marsh daily Pokémon', 'Great Marsh daily pool · National Pokédex');
  }
  addFeebasFishing(areas.get('MAP_HEADER_MT_CORONET_B1F'), ['Both'], speciesName);
  const regional = json(path.join(source, 'res/pokemon/sinnoh_pokedex.json')).slice(1);
  const regionalNumbers = new Map(regional.map((id, index) => [id, index + 1]));
  const obtainable = new Set([...areas.values()].flatMap(area => [...area.encounters.map(row => row.speciesId), ...area.specialPokemon.map(row => row.speciesId)]));
  evolutionClosure(source, obtainable);
  if (obtainable.has('SPECIES_MANAPHY')) obtainable.add('SPECIES_PHIONE');
  const eventRequiredSpecies = new Set(['SPECIES_MANAPHY', 'SPECIES_PHIONE', 'SPECIES_DARKRAI', 'SPECIES_SHAYMIN', 'SPECIES_ARCEUS']);
  const transferRequiredSpecies = new Set(['SPECIES_REGIROCK', 'SPECIES_REGICE', 'SPECIES_REGISTEEL', 'SPECIES_REGIGIGAS']);
  const pokedex = species.map((speciesId, index) => ({
    number: index + 1, regionalNumber: regionalNumbers.get(speciesId) ?? null, name: speciesName(speciesId), speciesId,
    availability: { Platinum: eventRequiredSpecies.has(speciesId) ? 'Event distribution' : transferRequiredSpecies.has(speciesId) ? 'Trade / transfer required' : obtainable.has(speciesId) ? 'Obtainable' : 'Trade / transfer required' }
  }));
  return { source, areas, headers, items, species, pokedex, speciesName };
}

export const platinumExcludedMap = id => excluded.test(id);
