import fs from 'node:fs';
import path from 'node:path';

import { displayName, fileSlug } from '../gen4/display-names.mjs';
import { addDailyLandPool, addFeebasFishing } from '../gen4/special-encounters.mjs';
import { buildPlatinumSource } from '../platinum/source.mjs';
import { addDpScriptedItems } from './scripted-items.mjs';

const excluded = /(?:^MAP_(?:EVERYWHERE|NOTHING|UNDERGROUND)|UNUSED|UNKNOWN|UNION_ROOM|CONTEST.*STAGE|GLOBAL_TRADE|BATTLE_TOWER|WI-?FI|WIFI|COMMUNICATION|DEBUG)/;
const landChances = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1];
const waterChances = [60, 30, 5, 4, 1];
const padded = value => String(value).padStart(4, '0');

const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const archiveNumber = value => Number(value?.match(/narc_(\d+)_bin/)?.[1]);

function constants(file, prefix) {
  return new Map([...read(file).matchAll(new RegExp(`^#define\\s+(${prefix}[A-Z0-9_]+)\\s+(\\d+)`, 'gm'))]
    .map(match => [match[1], Number(match[2])]));
}

function mapHeaders(source) {
  const byNumber = new Map([...constants(path.join(source, 'include/constants/maps.h'), 'MAP_')].map(([id, number]) => [number, id]));
  const rows = [];
  for (const match of read(path.join(source, 'arm9/src/map_header.c')).matchAll(/^\s*\{([^\n]+)\},\s*\/\/\s*(MAP_[A-Z0-9_]+)/gm)) {
    const fields = match[1].split(',').map(value => value.trim());
    const number = rows.length, id = byNumber.get(number) ?? match[2];
    const encounter = match[1].match(/ENCDATA\(([^,]+),\s*([^\)]+)\)/);
    const eventArchive = match[1].match(/NARC_zone_event_release_narc_\d+_bin/)?.[0];
    const section = match[1].match(/\bMAPSEC_[A-Z0-9_]+\b/)?.[0];
    rows.push({ id, number, areaDataId: archiveNumber(fields[0]), matrixId: archiveNumber(fields[2]), scriptId: archiveNumber(fields[3]),
      eventId: archiveNumber(eventArchive), section, diamondEncounterId: archiveNumber(encounter?.[1]), pearlEncounterId: archiveNumber(encounter?.[2]) });
  }
  return { rows, byNumber };
}

export function readDpMatrix(source, matrixId) {
  const data = fs.readFileSync(path.join(source, `files/fielddata/mapmatrix/map_matrix/narc_${padded(matrixId)}.bin`));
  const width = data[0], height = data[1], hasHeaders = data[2] !== 0, hasAltitudes = data[3] !== 0, nameLength = data[4];
  let offset = 5 + nameLength;
  const count = width * height, headers = [];
  if (hasHeaders) { for (let index = 0; index < count; index++, offset += 2) headers.push(data.readUInt16LE(offset)); }
  if (hasAltitudes) offset += count;
  const maps = [];
  for (let index = 0; index < count; index++, offset += 2) maps.push(data.readUInt16LE(offset));
  if (offset > data.length) throw new Error(`Invalid Diamond/Pearl matrix ${matrixId}.`);
  return { width, height, headers, maps };
}

function readEvents(source, eventId) {
  const file = path.join(source, `files/fielddata/eventdata/zone_event_release/narc_${padded(eventId)}.bin`);
  const data = fs.readFileSync(file); let offset = 0;
  const count = () => { const value = data.readUInt32LE(offset); offset += 4; return value; };
  const backgrounds = Array.from({ length: count() }, () => { const event = { script: data.readUInt16LE(offset), x: data.readUInt32LE(offset + 4), y: data.readUInt32LE(offset + 8) }; offset += 20; return event; });
  const objects = Array.from({ length: count() }, () => { const event = { graphics: data.readUInt16LE(offset + 2), script: data.readUInt16LE(offset + 10), x: data.readUInt16LE(offset + 24), y: data.readUInt16LE(offset + 26) }; offset += 32; return event; });
  const warps = Array.from({ length: count() }, () => { const event = { x: data.readUInt16LE(offset), y: data.readUInt16LE(offset + 2), target: data.readUInt16LE(offset + 4) }; offset += 12; return event; });
  const coordinateCount = count(); offset += coordinateCount * 16;
  if (offset !== data.length) throw new Error(`Unexpected Diamond/Pearl event layout ${eventId}: consumed ${offset} of ${data.length}.`);
  return { backgrounds, objects, warps };
}

function itemCatalog(source) {
  const itemRows = json(path.join(source, 'files/itemtool/itemdata/item_data.json')).item_data;
  const table = read(path.join(source, 'arm9/src/itemtool.c')).match(/sItemIndexMappings\[\]\[4\]\s*=\s*\{([\s\S]*?)\n\};/)?.[1];
  const itemIds = constants(path.join(source, 'include/constants/items.h'), 'ITEM_');
  const icons = [...table.matchAll(/\{\s*(\d+),\s*(\d+),\s*(\d+),/g)]
    .map(match => ({ graphics: Number(match[2]), palette: Number(match[3]) }));
  const fallbackIcon = icons[0] ?? { graphics: 699, palette: 700 };
  const moves = [...read(path.join(source, 'arm9/src/itemtool.c')).match(/static const u16 sTMHMMoves\[\]\s*=\s*\{([\s\S]*?)\n\};/)?.[1].matchAll(/MOVE_[A-Z0-9_]+/g) ?? []].map(match => match[0]);
  return new Map(itemRows.map(row => {
    const machine = row.name.match(/^ITEM_(?:TM|HM)(\d+)$/);
    const moveIndex = machine ? (row.name.includes('_HM') ? 92 + Number(machine[1]) - 1 : Number(machine[1]) - 1) : -1;
    const name = machine && moves[moveIndex] ? `${displayName(row.name)} - ${displayName(moves[moveIndex])}` : displayName(row.name);
    const icon = icons[itemIds.get(row.name)] ?? fallbackIcon;
    return [row.name, { id: row.name, name, icon: icon.graphics, iconPalette: icon.palette }];
  }));
}

function platinumItemReference(platinumSource) {
  const work = buildPlatinumSource(platinumSource), byCoordinate = new Map();
  for (const area of work.areas.values()) for (const item of area.items) {
    const key = `${item.kind}:${item.x}:${item.y}`;
    if (!byCoordinate.has(key)) byCoordinate.set(key, []);
    byCoordinate.get(key).push({ areaId: area.id, item });
  }
  return byCoordinate;
}

function itemAt(reference, areaId, kind, x, y) {
  const candidates = reference.get(`${kind}:${x}:${y}`) ?? [];
  if (candidates.length === 1) return candidates[0].item;
  const tokens = new Set(areaId.replace(/^MAP_/, '').replaceAll('MOUNT_', 'MT_').replaceAll('EXTERIOR', 'OUTSIDE').split('_'));
  const scored = candidates.map(candidate => ({ ...candidate, score: candidate.areaId.replace(/^MAP_HEADER_/, '').split('_').filter(token => tokens.has(token)).length }));
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].item : null;
}

function encounterTable(source, archiveId, speciesByNumber, version) {
  if (!Number.isInteger(archiveId)) return [];
  const data = fs.readFileSync(path.join(source, `files/fielddata/encountdata/${version === 'Diamond' ? 'd_enc_data' : 'p_enc_data'}/narc_${padded(archiveId)}.bin`));
  if (data.length !== 424) throw new Error(`Unexpected ${version} encounter layout ${archiveId}.`);
  const rows = [], species = number => speciesByNumber.get(number) ?? `SPECIES_${number}`;
  const add = (speciesNumber, minLevel, maxLevel, chance, method, type, condition = null) => {
    if (!speciesNumber || !chance) return;
    const speciesId = species(speciesNumber);
    rows.push({ species: displayName(speciesId), speciesId, minLevel, maxLevel, chance, method, condition, type, version });
  };
  const land = Array.from({ length: 12 }, (_, index) => ({ level: data.readUInt32LE(4 + index * 8), species: data.readUInt32LE(8 + index * 8) }));
  land.forEach((slot, index) => add(slot.species, slot.level, slot.level, landChances[index], 'Grass / cave', 'Random'));
  const variants = [
    [100, [0, 1], 'Mass outbreak'], [108, [2, 3], 'Day'], [116, [2, 3], 'Night'], [124, [4, 5, 10, 11], 'Poké Radar'],
    [164, [8, 9], 'Ruby inserted'], [172, [8, 9], 'Sapphire inserted'], [180, [8, 9], 'Emerald inserted'],
    [188, [8, 9], 'FireRed inserted'], [196, [8, 9], 'LeafGreen inserted']
  ];
  for (const [offset, indexes, condition] of variants) {
    const replacements = indexes.map((_, index) => data.readUInt32LE(offset + index * 4));
    if (!replacements.some(Boolean)) continue;
    land.map((slot, index) => indexes.includes(index) ? { ...slot, species: replacements[indexes.indexOf(index)] } : slot)
      .forEach((slot, index) => add(slot.species, slot.level, slot.level, landChances[index], 'Grass / cave', 'Random', condition));
  }
  for (const [offset, method, type] of [[204, 'Surf', 'Surfing'], [292, 'Old Rod', 'OldRod'], [336, 'Good Rod', 'GoodRod'], [380, 'Super Rod', 'SuperRod']]) {
    if (!data.readUInt32LE(offset)) continue;
    for (let index = 0; index < 5; index++) {
      const slot = offset + 4 + index * 8;
      add(data.readUInt32LE(slot + 4), data[slot + 1], data[slot], waterChances[index], method, type);
    }
  }
  return rows;
}

function addSpecialPokemon(areas) {
  const add = (id, species, level, kind = 'Static', version = 'Both', requestedSpecies = null, note = null) => {
    const area = areas.get(id); if (!area) throw new Error(`Diamond/Pearl acquisition target missing ${id}.`);
    area.specialPokemon.push({ id: `${id}:${kind.toLowerCase().replaceAll(' ', '-')}:${species}:${version}`, species: displayName(species), speciesId: species, level, kind, version, requestedSpecies, note });
  };
  for (const species of ['SPECIES_TURTWIG', 'SPECIES_CHIMCHAR', 'SPECIES_PIPLUP']) add('MAP_ROUTE_201', species, 5, 'Starter');
  add('MAP_OREBURGH_MINING_MUSEUM', 'SPECIES_CRANIDOS', 20, 'Fossil revival', 'Diamond');
  add('MAP_OREBURGH_MINING_MUSEUM', 'SPECIES_SHIELDON', 20, 'Fossil revival', 'Pearl');
  for (const [id, species, level, kind, version] of [
    ['MAP_VALLEY_WINDWORKS_EXTERIOR', 'SPECIES_DRIFLOON', 22], ['MAP_ROUTE_209', 'SPECIES_SPIRITOMB', 25],
    ['MAP_OLD_CHATEAU_2F_ROOM_5', 'SPECIES_ROTOM', 15], ['MAP_VERITY_CAVERN', 'SPECIES_MESPRIT', 50, 'Roaming'],
    ['MAP_VALOR_CAVERN', 'SPECIES_AZELF', 50], ['MAP_ACUITY_CAVERN', 'SPECIES_UXIE', 50],
    ['MAP_MOUNT_CORONET_SPEAR_PILLAR', 'SPECIES_DIALGA', 47, 'Static', 'Diamond'], ['MAP_MOUNT_CORONET_SPEAR_PILLAR', 'SPECIES_PALKIA', 47, 'Static', 'Pearl'],
    ['MAP_STARK_MOUNTAIN_INTERIOR_3', 'SPECIES_HEATRAN', 70], ['MAP_SNOWPOINT_TEMPLE_B5F', 'SPECIES_REGIGIGAS', 70],
    ['MAP_TURNBACK_CAVE_GIRATINA_ROOM', 'SPECIES_GIRATINA', 70], ['MAP_FULLMOON_ISLAND_INTERIOR', 'SPECIES_CRESSELIA', 50, 'Roaming'],
    ['MAP_NEWMOON_ISLAND_INTERIOR', 'SPECIES_DARKRAI', 40, 'Event'], ['MAP_FLOWER_PARADISE', 'SPECIES_SHAYMIN', 30, 'Event'],
    ['MAP_HALL_OF_ORIGIN', 'SPECIES_ARCEUS', 80, 'Event'], ['MAP_IRON_ISLAND_HOUSE', 'SPECIES_RIOLU', 1, 'Gift Egg'],
    ['MAP_HEARTHOME_SOUTHEAST_HOUSE_1F', 'SPECIES_HAPPINY', 1, 'Gift Egg'], ['MAP_HEARTHOME_BEBE_HOUSE', 'SPECIES_EEVEE', 5, 'Gift'],
    ['MAP_SANDGEM', 'SPECIES_MANAPHY', 1, 'Event Egg']
  ]) add(id, species, level, kind, version);
  const spiritomb = areas.get('MAP_ROUTE_209').specialPokemon.find(entry => entry.speciesId === 'SPECIES_SPIRITOMB');
  spiritomb.note = 'Requires 32 conversations with other players in the Underground.';
  for (const [id, species, requested] of [
    ['MAP_OREBURGH_NORTHWEST_HOUSE_1F', 'SPECIES_ABRA', 'Machop'], ['MAP_ETERNA_CONDOMINIUMS_1F', 'SPECIES_CHATOT', 'Buizel'],
    ['MAP_SNOWPOINT_NORTHWEST_HOUSE', 'SPECIES_HAUNTER', 'Medicham'], ['MAP_ROUTE_226_HOUSE', 'SPECIES_MAGIKARP', 'Finneon']
  ]) add(id, species, 0, 'Trade', 'Both', requested);
}

function addHoneyTrees(areas, source, speciesByNumber) {
  const ids = ['MAP_ROUTE_205_SOUTH','MAP_ROUTE_205_NORTH','MAP_ROUTE_206','MAP_ROUTE_207','MAP_ROUTE_208','MAP_ROUTE_209','MAP_ROUTE_210_SOUTH','MAP_ROUTE_210_NORTH','MAP_ROUTE_211_EAST','MAP_ROUTE_212_NORTH','MAP_ROUTE_212_SOUTH','MAP_ROUTE_213','MAP_ROUTE_214','MAP_ROUTE_215','MAP_ROUTE_218','MAP_ROUTE_221','MAP_ROUTE_222','MAP_VALLEY_WINDWORKS_EXTERIOR','MAP_ETERNA_FOREST_EXTERIOR','MAP_FUEGO_IRONWORKS_EXTERIOR','MAP_FLOAROMA_MEADOW'];
  const weights = [40, 20, 20, 10, 5, 5];
  for (const id of ids) for (const version of ['Diamond', 'Pearl']) {
    const area = areas.get(id); if (!area) throw new Error(`Diamond/Pearl Honey Tree area missing ${id}.`);
    for (const [tableIndex, condition] of [[0, 'Honey Tree · common group'], [1, 'Honey Tree · uncommon group'], [2, 'Honey Tree · Munchlax tree group']]) {
      const archive = 2 + (version === 'Pearl' ? 3 : 0) + tableIndex;
      const data = fs.readFileSync(path.join(source, `files/arc/encdata_ex/narc_${padded(archive)}.bin`));
      const sourceTable = Array.from({ length: 6 }, (_, index) => speciesByNumber.get(data.readUInt32LE(index * 4)));
      const aggregate = new Map(); sourceTable.forEach((speciesId, index) => aggregate.set(speciesId, (aggregate.get(speciesId) ?? 0) + weights[index]));
      area.encounters.push(...[...aggregate].map(([speciesId, chance]) => ({ species: displayName(speciesId), speciesId, minLevel: 5, maxLevel: 15, chance, method: 'Honey Tree', condition, type: 'Random', version })));
    }
  }
}

function evolutionClosure(source, obtainable) {
  const links = json(path.join(source, 'files/poketool/personal/evo.json')).evos.flatMap(entry => entry.evos
    .filter(evolution => !evolution.method.includes('TRADE')).map(evolution => [`SPECIES_${entry.species}`, `SPECIES_${evolution.target}`]));
  let changed = true;
  while (changed) { changed = false; for (const [before, after] of links) if (obtainable.has(before) !== obtainable.has(after)) { obtainable.add(before); obtainable.add(after); changed = true; } }
}

export function buildDpSource(source, platinumSource) {
  source = path.resolve(source); platinumSource = path.resolve(platinumSource);
  const { rows, byNumber } = mapHeaders(source), speciesConstants = constants(path.join(source, 'include/constants/species.h'), 'SPECIES_');
  const speciesByNumber = new Map([...speciesConstants].map(([id, number]) => [number, id]));
  const catalog = itemCatalog(source), itemNumbers = constants(path.join(source, 'include/constants/items.h'), 'ITEM_');
  const catalogByName = new Map([...catalog.values()].map(item => [item.name, item]));
  const itemReference = platinumItemReference(platinumSource), areas = new Map(), headers = new Map();
  for (const header of rows) {
    if (excluded.test(header.id) || !Number.isInteger(header.matrixId) || !Number.isInteger(header.eventId)) continue;
    const matrix = readDpMatrix(source, header.matrixId), events = readEvents(source, header.eventId);
    const area = { id: header.id, name: displayName(header.id), region: /FIGHT_AREA|SURVIVAL_AREA|RESORT_AREA|ROUTE_22[5-9]|ROUTE_230|STARK_MOUNTAIN/.test(header.id) ? 'Battle Zone' : 'Sinnoh',
      mapMatrixId: header.matrixId, mapWidth: matrix.width * 32 * 16, mapHeight: matrix.height * 32 * 16,
      encounters: [...encounterTable(source, header.diamondEncounterId, speciesByNumber, 'Diamond'), ...encounterTable(source, header.pearlEncounterId, speciesByNumber, 'Pearl')],
      items: [], resources: [], specialPokemon: [], entrances: [], transports: [] };
    events.warps.forEach((warp, index) => { const targetId = byNumber.get(warp.target) ?? ''; area.entrances.push({ id: `${area.id}:warp:${index}`, targetId, name: targetId ? displayName(targetId) : 'Exit', x: warp.x, y: warp.y, version: 'Both' }); });
    for (const event of events.objects.filter(event => event.graphics === 87)) {
      const reference = itemAt(itemReference, area.id, 'Visible', event.x, event.y), item = reference && catalogByName.get(reference.name); if (!item) continue;
      area.items.push({ id: `${area.id}:visible:${event.x}:${event.y}`, name: item.name, kind: 'Visible', version: 'Both',
        iconId: item.icon, iconPaletteId: item.iconPalette, x: event.x, y: event.y, quantity: 1 });
    }
    for (const event of events.backgrounds) {
      const reference = itemAt(itemReference, area.id, 'Hidden', event.x, event.y), item = reference && catalogByName.get(reference.name); if (!item) continue;
      area.items.push({ id: `${area.id}:hidden:${event.x}:${event.y}`, name: item.name, kind: 'Hidden', version: 'Both',
        iconId: item.icon, iconPaletteId: item.iconPalette, x: event.x, y: event.y, quantity: reference.quantity });
    }
    areas.set(area.id, area); headers.set(area.id, { ...header, matrix, events });
  }
  addSpecialPokemon(areas); addHoneyTrees(areas, source, speciesByNumber);
  addDpScriptedItems(source, areas, headers, catalog, itemNumbers);
  const readSpeciesPool = archive => {
    const data = fs.readFileSync(path.join(source, `files/arc/encdata_ex/narc_${padded(archive)}.bin`));
    return Array.from({ length: data.length / 4 }, (_, index) => speciesByNumber.get(data.readUInt32LE(index * 4)));
  };
  addDailyLandPool(areas.get('MAP_TROPHY_GARDEN'), ['Diamond', 'Pearl'], readSpeciesPool(8), displayName,
    'Trophy Garden', 'Trophy Garden daily pool · National Pokédex');
  const marshBefore = readSpeciesPool(10), marshAfter = readSpeciesPool(9);
  for (const id of Array.from({ length: 6 }, (_, index) => `MAP_GREAT_MARSH_AREA_${index + 1}`)) {
    for (const version of ['Diamond', 'Pearl']) {
      addDailyLandPool(areas.get(id), [version], marshBefore, displayName,
        'Great Marsh daily Pokémon', 'Great Marsh daily pool · Before National Pokédex');
      addDailyLandPool(areas.get(id), [version], marshAfter, displayName,
        'Great Marsh daily Pokémon', 'Great Marsh daily pool · National Pokédex');
    }
  }
  addFeebasFishing(areas.get('MAP_MOUNT_CORONET_B1F'), ['Diamond', 'Pearl'], displayName);
  const regionalNumbers = new Map([...read(path.join(source, 'include/constants/sinnoh_dex.h')).matchAll(/^#define\s+SINNOH_DEX_([A-Z0-9_]+)\s+(\d+)/gm)]
    .filter(match => Number(match[2]) > 0).map(match => [`SPECIES_${match[1]}`, Number(match[2])]));
  const obtainable = new Map(['Diamond', 'Pearl'].map(version => [version, new Set([...areas.values()].flatMap(area => [
    ...area.encounters.filter(row => row.version === 'Both' || row.version === version).map(row => row.speciesId),
    ...area.specialPokemon.filter(row => row.version === 'Both' || row.version === version).map(row => row.speciesId)
  ]))]));
  for (const values of obtainable.values()) { evolutionClosure(source, values); if (values.has('SPECIES_MANAPHY')) values.add('SPECIES_PHIONE'); }
  const eventRequiredSpecies = new Set(['SPECIES_MANAPHY','SPECIES_PHIONE','SPECIES_DARKRAI','SPECIES_SHAYMIN','SPECIES_ARCEUS']);
  const transferRequiredSpecies = new Set(['SPECIES_REGIGIGAS']);
  const pokedex = [...speciesByNumber].filter(([number]) => number >= 1 && number <= 493).sort(([a], [b]) => a - b).map(([number, speciesId]) => ({ number, regionalNumber: regionalNumbers.get(speciesId) ?? null,
    name: displayName(speciesId), speciesId, availability: Object.fromEntries(['Diamond','Pearl'].map(version => [version, eventRequiredSpecies.has(speciesId) ? 'Event distribution' : transferRequiredSpecies.has(speciesId) ? 'Trade / transfer required' : obtainable.get(version).has(speciesId) ? 'Obtainable' : 'Trade / transfer required'])) }));
  return { source, platinumSource, areas, headers, items: catalog, species: pokedex.map(entry => entry.speciesId), pokedex, speciesName: displayName };
}

export const dpExcludedMap = id => excluded.test(id);
