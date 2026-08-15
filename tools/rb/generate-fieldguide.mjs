import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const source = path.resolve(process.argv[2] ?? '/tmp/pokered-fieldguide');
const packageRoot = path.resolve(process.argv[3] ?? 'PokemonFieldGuide/wwwroot/games/rb');
const dataRoot = path.join(packageRoot, 'data');
const mapsOut = path.join(packageRoot, 'maps');
const pokemonOut = path.join(packageRoot, 'sprites/pokemon');
const itemsOut = path.join(packageRoot, 'sprites/items');
for (const dir of [dataRoot, mapsOut, pokemonOut, itemsOut]) fs.mkdirSync(dir, { recursive: true });

const read = relative => fs.readFileSync(path.join(source, relative), 'utf8');
const readMapScripts = label => [path.join(source, `scripts/${label}.asm`), path.join(source, `scripts/${label}_2.asm`)]
  .filter(fs.existsSync).map(file => fs.readFileSync(file, 'utf8')).join('\n');
const title = value => value === 'TM_COUNTER' ? 'TM18 (Counter)' : value.replace(/^MAP_/, '').replace(/^SPECIES_/, '').replace(/^ITEM_/, '')
  .toLowerCase().split('_').map(x => x ? x[0].toUpperCase() + x.slice(1) : x).join(' ')
  .replace(/Route (\d+)/g, 'Route $1').replace(/(\d)f\b/g, '$1F').replace(/B(\d)f\b/g, 'B$1F')
  .replace(/Pokemon/g, 'Pokémon').replace(/Pokecenter/g, 'Pokémon Center').replace(/Mart/g, 'Mart')
  .replace(/Mt Moon/g, 'Mt. Moon').replace(/Ss Anne/g, 'S.S. Anne').replace(/Mr Mime/g, 'Mr. Mime')
  .replace(/Farfetchd/g, 'Farfetch’d').replace(/Nidoran M/g, 'Nidoran♂').replace(/Nidoran F/g, 'Nidoran♀')
  .replace(/Oaks/g, "Oak's").replace(/Reds/g, "Red's").replace(/Blues/g, "Blue's")
  .replace(/Bills/g, "Bill's").replace(/Copycats/g, "Copycat's").replace(/Fujis/g, "Fuji's")
  .replace(/Psychics/g, "Psychic's").replace(/Wardens/g, "Warden's").replace(/Captains/g, "Captain's")
  .replace(/^Tm /, 'TM ').replace(/^Hm /, 'HM ').replace(/\bHp\b/g, 'HP').replace(/\bPp\b/g, 'PP')
  .replace(/Elixer/g, 'Elixir').replace(/Digletts/g, "Diglett's");
const slug = name => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const constants = new Map();
for (const match of read('constants/map_constants.asm').matchAll(/map_const\s+([A-Z0-9_]+),\s*(\d+),\s*(\d+)/g))
  constants.set(match[1], { width: +match[2], height: +match[3] });

const maps = new Map();
for (const file of fs.readdirSync(path.join(source, 'data/maps/headers')).filter(x => x.endsWith('.asm'))) {
  const text = read(`data/maps/headers/${file}`);
  const header = text.match(/map_header\s+(\w+),\s*([A-Z0-9_]+),\s*([A-Z0-9_]+)/);
  if (!header || !constants.has(header[2])) continue;
  const [label, key, tileset] = header.slice(1);
  const size = constants.get(key);
  const id = `MAP_${key}`;
  const connections = [...text.matchAll(/connection\s+(north|south|east|west),\s*\w+,\s*([A-Z0-9_]+),\s*(-?\d+)/g)]
    .map(m => ({ direction: m[1], target: `MAP_${m[2]}`, offset: +m[3] }));
  maps.set(id, { id, key, label, tileset, ...size, connections, name: title(id), region: 'Kanto', encounters: [], items: [], specialPokemon: [], entrances: [] });
}

const slotChances = [20, 20, 15, 10, 10, 10, 5, 5, 4, 1];
const mapByLabel = new Map([...maps.values()].map(x => [x.label, x]));
for (const file of fs.readdirSync(path.join(source, 'data/wild/maps')).filter(x => x.endsWith('.asm'))) {
  const chunks = read(`data/wild/maps/${file}`).split(/(?=^\w+WildMons:)/m);
  for (const chunk of chunks) {
    const wildLabel = chunk.match(/^(\w+)WildMons:/m)?.[1];
    const area = mapByLabel.get(wildLabel);
    if (!area) continue;
    const parsed = [];
    for (const version of ['Red', 'Blue']) {
      let method = null, slot = 0, conditionalVersion = null;
      for (const line of chunk.split(/\r?\n/)) {
        if (/IF DEF\(_RED\)/.test(line)) { conditionalVersion = 'Red'; continue; }
        if (/IF DEF\(_BLUE\)/.test(line)) { conditionalVersion = 'Blue'; continue; }
        if (/ENDC/.test(line)) { conditionalVersion = null; continue; }
        if (conditionalVersion && conditionalVersion !== version) continue;
        if (/def_grass_wildmons\s+[1-9]/.test(line)) { method = 'Grass / cave'; slot = 0; continue; }
        if (/def_water_wildmons\s+[1-9]/.test(line)) { method = 'Surf'; slot = 0; continue; }
        if (/end_(grass|water)_wildmons/.test(line)) { method = null; continue; }
        const mon = method && line.match(/^\s*db\s+(\d+),\s*([A-Z0-9_]+)/);
        if (mon) parsed.push({ species: title(mon[2]), speciesId: `SPECIES_${mon[2]}`, minLevel: +mon[1], maxLevel: +mon[1], chance: slotChances[slot++] ?? 0, method, version });
      }
    }
    const blueRows = parsed.filter(row => row.version === 'Blue'), matchedBlue = new Set();
    for (const row of parsed.filter(row => row.version === 'Red')) {
      const matchIndex = blueRows.findIndex((candidate, index) => !matchedBlue.has(index)
        && candidate.speciesId === row.speciesId && candidate.minLevel === row.minLevel && candidate.maxLevel === row.maxLevel
        && candidate.chance === row.chance && candidate.method === row.method);
      if (matchIndex >= 0) { row.version = 'Both'; matchedBlue.add(matchIndex); }
      area.encounters.push(row);
    }
    blueRows.forEach((row, index) => { if (!matchedBlue.has(index)) area.encounters.push(row); });
  }
}

const rodText = read('data/wild/super_rod.asm');
const rodGroups = new Map();
for (const chunk of rodText.split(/(?=^\.Group\d+:)/m)) {
  const group = chunk.match(/^\.Group(\d+):/m)?.[1]; if (!group) continue;
  rodGroups.set(group, [...chunk.matchAll(/^\s*db\s+(\d+),\s*([A-Z0-9_]+)\s*$/gm)].map(m => ({ level: +m[1], species: m[2] })));
}
for (const match of rodText.matchAll(/^\s*dbw\s+([A-Z0-9_]+),\s*\.Group(\d+)/gm)) {
  const area = maps.get(`MAP_${match[1]}`), mons = rodGroups.get(match[2]) ?? []; if (!area) continue;
  area.encounters.push({ species: 'Magikarp', speciesId: 'SPECIES_MAGIKARP', minLevel: 5, maxLevel: 5, chance: 100, method: 'Old Rod', version: 'Both' });
  for (const species of ['GOLDEEN', 'POLIWAG']) area.encounters.push({ species: title(species), speciesId: `SPECIES_${species}`, minLevel: 10, maxLevel: 10, chance: 50, method: 'Good Rod', version: 'Both' });
  for (const mon of mons) area.encounters.push({ species: title(mon.species), speciesId: `SPECIES_${mon.species}`, minLevel: mon.level, maxLevel: mon.level, chance: 100 / mons.length, method: 'Super Rod', version: 'Both' });
}

for (const area of maps.values()) {
  const objectPath = path.join(source, `data/maps/objects/${area.label}.asm`);
  if (fs.existsSync(objectPath)) {
    const text = fs.readFileSync(objectPath, 'utf8');
    let warpIndex = 0;
    for (const match of text.matchAll(/^\s*warp_event\s+(-?\d+),\s*(-?\d+),\s*([A-Z0-9_]+),\s*\d+(?:\s*;\s*(.*))?$/gm)) {
      // Source maps sometimes retain deliberately unreachable warps for engine/map-layout
      // purposes. They must not become guide navigation markers or contraction roots.
      if (/\binaccessible\b/i.test(match[4] ?? '')) continue;
      const targetId = match[3] === 'LAST_MAP' ? '' : `MAP_${match[3]}`;
      area.entrances.push({ id: `${area.id}:warp:${warpIndex++}`, x: +match[1], y: +match[2], targetId, name: targetId ? title(targetId) : 'Exit' });
    }
    for (const match of text.matchAll(/object_event\s+(\d+),\s*(\d+),\s*SPRITE_POKE_BALL,\s*STAY,\s*NONE,\s*TEXT_[A-Z0-9_]+,\s*([A-Z][A-Z0-9_]*)\s*$/gm)) {
      area.items.push({ id: `${area.id}:visible:${match[1]}:${match[2]}`, name: title(match[3]), kind: 'Visible', icon: 'question_mark.png', x: +match[1], y: +match[2], quantity: 1 });
    }
  }
  const script = readMapScripts(area.label);
  if (script) {
    for (const match of script.matchAll(/lb bc,\s*([A-Z][A-Z0-9_]*),\s*(\d+)[\s\S]{0,240}?call GiveItem/g)) area.items.push({
      id: `${area.id}:event:${match[1]}:${match.index}`, name: title(match[1]), kind: 'Event', icon: 'question_mark.png', x: -1, y: -1, quantity: +match[2]
    });
  }
}

for (const [mapId, item] of [['MAP_ROUTE_2_GATE','HM_FLASH'],['MAP_ROUTE_11_GATE_2F','ITEMFINDER'],['MAP_ROUTE_15_GATE_2F','EXP_ALL']]) {
  const area = maps.get(mapId); if (area) area.items.push({ id: `${mapId}:event:${item}`, name: title(item), kind: 'Event', icon: 'question_mark.png', x: -1, y: -1, quantity: 1 });
}

let hiddenArea = null;
for (const line of read('data/events/hidden_events.asm').split(/\r?\n/)) {
  const section = line.match(/^\s*hidden_events_for\s+([A-Z0-9_]+)/);
  if (section) { hiddenArea = maps.get(`MAP_${section[1]}`); continue; }
  const item = hiddenArea && line.match(/^\s*hidden_event\s+(\d+),\s*(\d+),\s*HiddenItems,\s*([A-Z0-9_]+)/);
  if (item) hiddenArea.items.push({ id: `${hiddenArea.id}:hidden:${item[1]}:${item[2]}`, name: title(item[3]), kind: 'Hidden', icon: 'question_mark.png', x: +item[1], y: +item[2], quantity: 1 });
}

const addSpecial = (map, species, level, kind = 'Static', version = 'Both', requestedSpecies = null) => maps.get(map)?.specialPokemon.push({
  id: `${map}:${kind}:${species}:${version}`, species: title(species), speciesId: `SPECIES_${species}`, level, kind, version, requestedSpecies
});
const dexSpeciesNames = new Set([...read('constants/pokedex_constants.asm').matchAll(/^\s*const\s+DEX_([A-Z0-9_]+)/gm)].map(match => match[1]));
const staticCounts = new Map();
for (const area of maps.values()) {
  const objectPath = path.join(source, `data/maps/objects/${area.label}.asm`);
  if (!fs.existsSync(objectPath)) continue;
  for (const match of fs.readFileSync(objectPath, 'utf8').matchAll(/^\s*object_event\s+(\d+),\s*(\d+),[^\n]*,\s*([A-Z][A-Z0-9_]*),\s*(\d+)\s*(?:;.*)?$/gm)) {
    if (!dexSpeciesNames.has(match[3])) continue;
    const countKey = `${area.id}:${match[3]}`, count = staticCounts.get(countKey) ?? 0;
    staticCounts.set(countKey, count + 1);
    // Preserve the released checklist ID for the first instance of each species;
    // coordinate IDs distinguish additional source-defined encounters.
    const id = count === 0 ? `${area.id}:Static:${match[3]}:Both` : `${area.id}:static:${match[1]}:${match[2]}:${match[3]}`;
    area.specialPokemon.push({ id, species: title(match[3]), speciesId: `SPECIES_${match[3]}`, level: +match[4], kind: 'Static', version: 'Both', requestedSpecies: null });
  }
}
for (const starter of ['BULBASAUR', 'CHARMANDER', 'SQUIRTLE']) addSpecial('MAP_OAKS_LAB', starter, 5, 'Gift');
for (const fighter of ['HITMONLEE', 'HITMONCHAN']) addSpecial('MAP_FIGHTING_DOJO', fighter, 30, 'Gift');
addSpecial('MAP_SILPH_CO_7F', 'LAPRAS', 15, 'Gift');
addSpecial('MAP_CELADON_MANSION_ROOF_HOUSE', 'EEVEE', 25, 'Gift');
addSpecial('MAP_MT_MOON_POKECENTER', 'MAGIKARP', 5, 'Gift');
for (const fossil of ['OMANYTE', 'KABUTO', 'AERODACTYL']) addSpecial('MAP_CINNABAR_LAB_FOSSIL_ROOM', fossil, 30, 'Gift');
for (const [species, level, version] of [
  ['ABRA',9,'Red'],['ABRA',6,'Blue'],['CLEFAIRY',8,'Red'],['CLEFAIRY',12,'Blue'],['NIDORINA',17,'Red'],['NIDORINO',17,'Blue'],
  ['DRATINI',18,'Red'],['DRATINI',24,'Blue'],['SCYTHER',25,'Red'],['PINSIR',20,'Blue'],['PORYGON',26,'Red'],['PORYGON',18,'Blue']
]) addSpecial('MAP_GAME_CORNER_PRIZE_ROOM', species, level, 'Gift', version);
for (const [map, received, requested] of [
  ['MAP_ROUTE_11_GATE_2F','NIDORINA','Nidorino'],['MAP_ROUTE_2_TRADE_HOUSE','MR_MIME','Abra'],
  ['MAP_CINNABAR_LAB_FOSSIL_ROOM','SEEL','Ponyta'],['MAP_VERMILION_TRADE_HOUSE','FARFETCHD','Spearow'],
  ['MAP_ROUTE_18_GATE_2F','LICKITUNG','Slowbro'],['MAP_CERULEAN_TRADE_HOUSE','JYNX','Poliwhirl'],
  ['MAP_CINNABAR_LAB_TRADE_ROOM','ELECTRODE','Raichu'],['MAP_CINNABAR_LAB_TRADE_ROOM','TANGELA','Venonat'],
  ['MAP_UNDERGROUND_PATH_ROUTE_5','NIDORAN_F','Nidoran♂']
]) addSpecial(map, received, 0, 'Trade', 'Both', requested);
addSpecial('MAP_ROUTE_12', 'SNORLAX', 30); addSpecial('MAP_ROUTE_16', 'SNORLAX', 30);

// Render each .blk through its 4x4-tile blockset at the game's native 2x scale.
const tilesetAliases = { REDS_HOUSE_1: 'reds_house', REDS_HOUSE_2: 'reds_house', MART: 'pokecenter', DOJO: 'gym', FOREST_GATE: 'gate', MUSEUM: 'gate' };
for (const area of maps.values()) {
  const tileName = tilesetAliases[area.tileset] ?? area.tileset.toLowerCase();
  const tilePath = path.join(source, `gfx/tilesets/${tileName}.png`);
  const blockPath = path.join(source, `gfx/blocksets/${tileName}.bst`);
  const mapPath = path.join(source, `maps/${area.label}.blk`);
  if (![tilePath, blockPath, mapPath].every(fs.existsSync) || !area.width || !area.height) continue;
  const { data: tilePixels, info } = await sharp(tilePath).raw().toBuffer({ resolveWithObject: true });
  const blocks = fs.readFileSync(blockPath), layout = fs.readFileSync(mapPath);
  const width = area.width * 32, height = area.height * 32;
  const canvas = Buffer.alloc(width * height * 4, 255);
  const channels = info.channels;
  for (let by = 0; by < area.height; by++) for (let bx = 0; bx < area.width; bx++) {
    const block = layout[by * area.width + bx] ?? 0;
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const tile = blocks[block * 16 + ty * 4 + tx] ?? 0;
      const sx = (tile % 16) * 8, sy = Math.floor(tile / 16) * 8;
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        const si = ((sy + py) * info.width + sx + px) * channels;
        const shade = tilePixels[si];
        const dx = bx * 32 + tx * 8 + px, dy = by * 32 + ty * 8 + py, di = (dy * width + dx) * 4;
        canvas[di] = shade; canvas[di + 1] = shade; canvas[di + 2] = shade; canvas[di + 3] = 255;
      }
    }
  }
  const filename = `${area.key}.png`;
  await sharp(canvas, { raw: { width, height, channels: 4 } }).png().toFile(path.join(mapsOut, filename));
  area.mapImage = `games/rb/maps/${filename}`; area.mapWidth = width; area.mapHeight = height;
}

// Place every connected outdoor map on one exact canvas using header offsets.
const outdoor = new Set([...maps.values()].filter(x => x.connections.length || x.id === 'MAP_PALLET_TOWN' || x.id === 'MAP_INDIGO_PLATEAU').map(x => x.id));
const positions = new Map([['MAP_PALLET_TOWN', { x: 0, y: 0 }]]), queue = ['MAP_PALLET_TOWN'];
while (queue.length) {
  const id = queue.shift(), area = maps.get(id), pos = positions.get(id);
  for (const c of area.connections) {
    if (!outdoor.has(c.target) || positions.has(c.target)) continue;
    const target = maps.get(c.target); let x = pos.x, y = pos.y;
    if (c.direction === 'north') { x += c.offset * 32; y -= target.height * 32; }
    if (c.direction === 'south') { x += c.offset * 32; y += area.height * 32; }
    if (c.direction === 'west') { x -= target.width * 32; y += c.offset * 32; }
    if (c.direction === 'east') { x += area.width * 32; y += c.offset * 32; }
    positions.set(c.target, { x, y }); queue.push(c.target);
  }
}
const placed = [...positions].map(([id, p]) => ({ id, ...p, width: maps.get(id).mapWidth, height: maps.get(id).mapHeight })).filter(x => x.width);
const minX = Math.min(...placed.map(x => x.x)), minY = Math.min(...placed.map(x => x.y));
for (const p of placed) { p.x -= minX; p.y -= minY; }
const worldWidth = Math.max(...placed.map(x => x.x + x.width)), worldHeight = Math.max(...placed.map(x => x.y + x.height));
await sharp({ create: { width: worldWidth, height: worldHeight, channels: 4, background: '#d8e0c0' } }).composite(
  placed.map(p => ({ input: path.join(mapsOut, `${maps.get(p.id).key}.png`), left: p.x, top: p.y }))
).png().toFile(path.join(mapsOut, 'WORLD_KANTO.png'));
fs.writeFileSync(path.join(dataRoot, 'worlds.json'), JSON.stringify([{ id: 'rb-kanto', image: 'games/rb/maps/WORLD_KANTO.png', width: worldWidth, height: worldHeight, maps: placed }]));

const outdoorIds = new Set(placed.map(placement => placement.id));
const hasRelevantData = area => area.encounters.length || area.items.length || area.specialPokemon.length;
const resolveContractedTarget = (sourceId, targetId) => {
  const queue = targetId ? [targetId] : [], visited = new Set([sourceId]);
  while (queue.length) {
    const id = queue.shift(); if (visited.has(id)) continue; visited.add(id);
    const target = maps.get(id); if (!target) continue;
    if (outdoorIds.has(id) || hasRelevantData(target)) return target;
    for (const exit of target.entrances) if (exit.targetId && !visited.has(exit.targetId)) queue.push(exit.targetId);
  }
  return null;
};
for (const area of maps.values()) {
  const combined = new Map();
  for (const encounter of area.encounters) {
    const key = [encounter.speciesId, encounter.method, encounter.version, encounter.minLevel, encounter.maxLevel].join('|');
    if (combined.has(key)) combined.get(key).chance += encounter.chance;
    else combined.set(key, { ...encounter });
  }
  area.encounters = [...combined.values()];
  delete area.key; delete area.label; delete area.tileset; delete area.width; delete area.height; delete area.connections;
  area.entrances = area.entrances.map(entrance => {
    const target = resolveContractedTarget(area.id, entrance.targetId);
    return target ? { ...entrance, targetId: target.id, name: target.name } : null;
  }).filter(Boolean);
}
const areas = [...maps.values()].filter(area => outdoorIds.has(area.id) || hasRelevantData(area));
const included = new Map(areas.map(area => [area.id, area]));
const adjacency = new Map(areas.map(area => [area.id, new Set()]));
for (const area of areas) for (const entrance of area.entrances) if (entrance.targetId && included.has(entrance.targetId)) {
  adjacency.get(area.id).add(entrance.targetId); adjacency.get(entrance.targetId).add(area.id);
}
const reachable = new Set(placed.map(placement => placement.id)), reachQueue = [...reachable];
while (reachQueue.length) for (const target of adjacency.get(reachQueue.shift()) ?? []) if (!reachable.has(target)) { reachable.add(target); reachQueue.push(target); }
const unreachableRelevant = areas.filter(area => (area.encounters.length || area.items.length || area.specialPokemon.length) && !reachable.has(area.id));
if (unreachableRelevant.length) throw new Error(`Relevant areas are unreachable from Kanto: ${unreachableRelevant.map(area => area.id).join(', ')}`);
const referencedMapFiles = new Set(['WORLD_KANTO.png', ...areas.map(area => path.basename(area.mapImage))]);
for (const file of fs.readdirSync(mapsOut).filter(file => file.endsWith('.png')))
  if (!referencedMapFiles.has(file)) fs.rmSync(path.join(mapsOut, file));
const itemCounts = areas.flatMap(area => area.items).reduce((counts, item) => counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1), new Map());
const expectedItemCounts = { Visible: 104, Hidden: 53, Event: 44 };
for (const [kind, expected] of Object.entries(expectedItemCounts)) if (itemCounts.get(kind) !== expected)
  throw new Error(`${kind} item audit failed: expected ${expected}, generated ${itemCounts.get(kind) ?? 0}`);
if (areas.reduce((sum, area) => sum + area.specialPokemon.length, 0) !== 46) throw new Error('Special Pokémon audit failed: expected 46 distinct acquisitions');
fs.writeFileSync(path.join(dataRoot, 'fieldguide.json'), JSON.stringify({ source: 'pret/pokered', generated: new Date().toISOString().slice(0, 10), areas }));

const species = [...read('constants/pokedex_constants.asm').matchAll(/^\s*const\s+DEX_([A-Z0-9_]+)/gm)].map(m => m[1]).slice(0, 151);
const obtainable = { Red: new Set(), Blue: new Set() };
for (const area of areas) for (const version of ['Red', 'Blue']) {
  for (const e of area.encounters) if (e.version === 'Both' || e.version === version) obtainable[version].add(e.speciesId);
  for (const p of area.specialPokemon) if (p.version === 'Both' || p.version === version) obtainable[version].add(p.speciesId);
}
const dexByCompactName = new Map(species.map(name => [name.replaceAll('_', ''), `SPECIES_${name}`]));
const evolutionLinks = [];
for (const section of read('data/pokemon/evos_moves.asm').split(/(?=^\w+EvosMoves:)/m)) {
  const fromName = section.match(/^(\w+)EvosMoves:/m)?.[1]?.toUpperCase();
  const from = dexByCompactName.get(fromName);
  if (!from) continue;
  const evolutionBlock = section.slice(0, section.search(/^\s*db\s+0/m));
  for (const match of evolutionBlock.matchAll(/(EVOLVE_[A-Z]+),[^\n,]+,(?:[^\n,]+,)?\s*([A-Z0-9_]+)\s*$/gm))
    if (match[1] !== 'EVOLVE_TRADE') evolutionLinks.push([from, `SPECIES_${match[2]}`]);
}
for (const version of ['Red', 'Blue']) {
  let changed = true;
  while (changed) { changed = false; for (const [from, to] of evolutionLinks) if (obtainable[version].has(from) && !obtainable[version].has(to)) { obtainable[version].add(to); changed = true; } }
}
const event = new Set(['MEW']);
const dex = species.map((name, i) => ({ number: i + 1, regionalNumber: i + 1, name: title(name), speciesId: `SPECIES_${name}`, availability: Object.fromEntries(['Red', 'Blue'].map(v => [v, obtainable[v].has(`SPECIES_${name}`) ? 'Obtainable' : event.has(name) ? 'Event distribution' : 'Trade / transfer required'])) }));
const expectedUnavailable = {
  Red: new Set(['SANDSHREW', 'SANDSLASH', 'VULPIX', 'NINETALES', 'MEOWTH', 'PERSIAN', 'ALAKAZAM', 'MACHAMP', 'BELLSPROUT', 'WEEPINBELL', 'VICTREEBEL', 'GOLEM', 'GENGAR', 'MAGMAR', 'PINSIR', 'MEW']),
  Blue: new Set(['EKANS', 'ARBOK', 'ODDISH', 'GLOOM', 'VILEPLUME', 'MANKEY', 'PRIMEAPE', 'GROWLITHE', 'ARCANINE', 'ALAKAZAM', 'MACHAMP', 'GOLEM', 'GENGAR', 'SCYTHER', 'ELECTABUZZ', 'MEW'])
};
for (const version of ['Red', 'Blue']) {
  const unavailable = new Set(dex.filter(entry => entry.availability[version] !== 'Obtainable').map(entry => entry.speciesId.replace('SPECIES_', '')));
  if (unavailable.size !== expectedUnavailable[version].size || [...unavailable].some(name => !expectedUnavailable[version].has(name)))
    throw new Error(`${version} Pokédex availability audit failed: ${[...unavailable].join(', ')}`);
}
fs.writeFileSync(path.join(dataRoot, 'pokedex.json'), JSON.stringify(dex));
const spriteName = speciesId => ({ SPECIES_NIDORAN_F: 'nidoranf.png', SPECIES_NIDORAN_M: 'nidoranm.png', SPECIES_MR_MIME: 'mr.mime.png' }[speciesId]
  ?? speciesId.replace('SPECIES_', '').toLowerCase() + '.png');
const referencedSpriteFiles = new Set(['question_mark.png', ...dex.map(entry => spriteName(entry.speciesId))]);
async function copySpriteWithTransparentBackground(file) {
  const { data, info } = await sharp(path.join(source, 'gfx/pokemon/front_rg', file)).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const borderCounts = new Map();
  const countBorder = (x, y) => { const shade = data[(y * info.width + x) * 4]; borderCounts.set(shade, (borderCounts.get(shade) ?? 0) + 1); };
  for(let x=0;x<info.width;x++){countBorder(x,0);countBorder(x,info.height-1);}for(let y=1;y<info.height-1;y++){countBorder(0,y);countBorder(info.width-1,y);}
  const background = [...borderCounts].sort((a, b) => b[1] - a[1])[0][0], seen = new Uint8Array(info.width * info.height), queue = [];
  const enqueue = (x, y) => { const p=y*info.width+x;if(x<0||y<0||x>=info.width||y>=info.height||seen[p]||data[p*4]!==background)return;seen[p]=1;queue.push(p); };
  for(let x=0;x<info.width;x++){enqueue(x,0);enqueue(x,info.height-1);}for(let y=0;y<info.height;y++){enqueue(0,y);enqueue(info.width-1,y);}
  for(let i=0;i<queue.length;i++){const p=queue[i],x=p%info.width,y=Math.floor(p/info.width);data[p*4+3]=0;enqueue(x-1,y);enqueue(x+1,y);enqueue(x,y-1);enqueue(x,y+1);}
  await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(path.join(pokemonOut,file));
}
for (const file of fs.readdirSync(path.join(source, 'gfx/pokemon/front_rg')).filter(file => referencedSpriteFiles.has(file))) await copySpriteWithTransparentBackground(file);
const fallback = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#ffffff00' } }).composite([{ input: Buffer.from('<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="#eee" stroke="#333" stroke-width="2"/><text x="16" y="23" text-anchor="middle" font-size="22">?</text></svg>') }]).png().toBuffer();
fs.writeFileSync(path.join(pokemonOut, 'question_mark.png'), fallback); fs.writeFileSync(path.join(itemsOut, 'question_mark.png'), fallback);
for (const file of fs.readdirSync(pokemonOut).filter(file => file.endsWith('.png')))
  if (!referencedSpriteFiles.has(file)) fs.rmSync(path.join(pokemonOut, file));
console.log(`Generated Red/Blue: ${areas.length} areas, ${placed.length} outdoor maps, ${areas.reduce((n,a)=>n+a.encounters.length,0)} encounters, ${areas.reduce((n,a)=>n+a.items.length,0)} items; all ${areas.filter(a=>a.encounters.length||a.items.length||a.specialPokemon.length).length} relevant areas reachable.`);
