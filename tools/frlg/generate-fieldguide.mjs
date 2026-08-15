import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2] ?? '/tmp/pokefirered-fieldguide';
const output = process.argv[3] ?? 'PokemonFieldGuide/wwwroot/games/frlg/data/fieldguide.json';
const packageRoot = path.dirname(path.dirname(output));
const pokemonOut = path.join(packageRoot, 'sprites/pokemon');
const itemsOut = path.join(packageRoot, 'sprites/items');
const mapWebPath = 'games/frlg/maps';
const title = value => value
  .replace(/^MAP_/, '').replace(/^SPECIES_/, '').replace(/^ITEM_/, '')
  .toLowerCase().split('_').map(x => x ? x[0].toUpperCase() + x.slice(1) : x).join(' ')
  .replace(/(Route)(\d+)/g, '$1 $2').replace(/(Room)(\d+)/g, '$1 $2')
  .replace(/\bB(\d)f\b/g, 'B$1F').replace(/\b(\d)f\b/g, '$1F')
  .replace(/\bTm(\d+)/g, 'TM$1').replace(/\bHm(\d+)/g, 'HM$1')
  .replace(/\b(\d)p\b/g, '$1P').replace(/\bSsanne\b/g, 'S.S. Anne')
  .replace(/\bSs Ticket\b/g, 'S.S. Ticket').replace(/\bTeachy Tv\b/g, 'Teachy TV')
  .replace(/\bPp\b/g, 'PP').replace(/\bHp\b/g, 'HP').replace(/\bExp Share\b/g, 'Exp. Share')
  .replace(/\bGuard Spec\b/g, 'Guard Spec.').replace(/\bTri Pass\b/g, 'Tri-Pass').replace(/\bUp Grade\b/g, 'Up-Grade')
  .replace(/\bNever Melt Ice\b/g, 'NeverMeltIce').replace(/\bOaks Parcel\b/g, "Oak's Parcel").replace(/\bKings Rock\b/g, "King's Rock")
  .replace(/\bOaks\b/g, "Oak's").replace(/\bRivals\b/g, "Rival's").replace(/\bPlayers\b/g, "Player's").replace(/\bWardens\b/g, "Warden's")
  .replace(/\bCopycats\b/g, "Copycat's").replace(/\bLoreleis\b/g, "Lorelei's").replace(/\bDigletts\b/g, "Diglett's").replace(/\bMr Psychics\b/g, "Mr. Psychic's")
  .replace(/\bMt Moon\b/g, 'Mt. Moon').replace(/\bHo Oh\b/g, 'Ho-Oh').replace(/\bPoke\b/g, 'Poké').replace(/\bMr Mime\b/g, 'Mr. Mime').replace(/\bFarfetchd\b/g, "Farfetch’d").replace(/Pokemon/g, 'Pokémon');

const wild = JSON.parse(fs.readFileSync(path.join(source, 'src/data/wild_encounters.json')));
const mapRoot = path.join(source, 'data/maps');
const itemBallScripts = fs.readFileSync(path.join(source, 'data/scripts/item_ball_scripts.inc'), 'utf8');
const layouts = JSON.parse(fs.readFileSync(path.join(source, 'data/layouts/layouts.json'))).layouts;
const layoutById = new Map(layouts.map(x => [x.id, x]));
const itemGraphics = fs.readFileSync(path.join(source, 'src/data/graphics/items.h'), 'utf8');
const itemTable = fs.readFileSync(path.join(source, 'src/data/item_icon_table.h'), 'utf8');
const graphicFiles = new Map([...itemGraphics.matchAll(/gItemIcon_(\w+)\[\].*?graphics\/items\/icons\/([^".]+)\.4bpp/g)].map(m => [m[1], `${m[2]}.png`]));
const itemIcons = new Map([...itemTable.matchAll(/\[(ITEM_[A-Z0-9_]+)\]\s*=\s*\{gItemIcon_(\w+)/g)].map(m => [m[1], graphicFiles.get(m[2]) ?? 'question_mark.png']));
const trades = {
  INGAME_TRADE_MR_MIME:['SPECIES_MR_MIME','SPECIES_ABRA'], INGAME_TRADE_JYNX:['SPECIES_JYNX','SPECIES_POLIWHIRL'],
  INGAME_TRADE_FARFETCHD:['SPECIES_FARFETCHD','SPECIES_SPEAROW'], INGAME_TRADE_ELECTRODE:['SPECIES_ELECTRODE','SPECIES_RAICHU'],
  INGAME_TRADE_TANGELA:['SPECIES_TANGELA','SPECIES_VENONAT'], INGAME_TRADE_SEEL:['SPECIES_SEEL','SPECIES_PONYTA']
};
const areas = new Map();
const area = id => {
  if (!areas.has(id)) areas.set(id, { id, name: title(id), region: regionFor(id), encounters: [], items: [], specialPokemon: [], entrances: [] });
  return areas.get(id);
};
function regionFor(id) {
  if (/CINNABAR_ISLAND|SEAFOAM_ISLANDS/.test(id)) return 'Kanto';
  if (/^MAP_(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN)_ISLAND|TANOBY|NAVEL|BIRTH|MT_EMBER|KINDLE|CAPE_BRINK|BOND_BRIDGE|BERRY_FOREST|ICEFALL|LOST_CAVE|MEMORIAL|WATER_PATH|RUIN_VALLEY|PATTERN_BUSH|ALTERING_CAVE|OUTCAST|GREEN_PATH|TRAINER_TOWER|DOTTED_HOLE|ROCKET_WAREHOUSE/.test(id)) return 'Sevii Islands';
  return 'Kanto';
}
const methods = { land_mons: 'Grass / cave', water_mons: 'Surf', rock_smash_mons: 'Rock Smash' };
for (const group of wild.wild_encounter_groups) {
  const rates = Object.fromEntries(group.fields.map(f => [f.type, f.encounter_rates]));
  for (const set of group.encounters ?? []) {
    // The eight alternate Altering Cave tables were reserved for an event that
    // was never distributed. Only the normal Zubat table is reachable in-game.
    if (set.map === 'MAP_SIX_ISLAND_ALTERING_CAVE' && /AlteringCave_[2-9]_/.test(set.base_label)) continue;
    const a = area(set.map);
    const version = /_FireRed/i.test(set.base_label) ? 'FireRed' : /_LeafGreen/i.test(set.base_label) ? 'LeafGreen' : 'Both';
    for (const [key, block] of Object.entries(set)) {
      if (!key.endsWith('_mons') || !block?.mons) continue;
      const fishingGroups = group.fields.find(f => f.type === 'fishing_mons')?.groups;
      block.mons.forEach((mon, index) => {
        let method = methods[key] ?? 'Fishing';
        if (key === 'fishing_mons' && fishingGroups) {
          method = Object.entries(fishingGroups).find(([, slots]) => slots.includes(index))?.[0] ?? 'fishing';
          method = title(method);
        }
        a.encounters.push({ species: title(mon.species), speciesId: mon.species, minLevel: mon.min_level, maxLevel: mon.max_level, chance: rates[key]?.[index] ?? 0, method, version });
      });
    }
  }
}
// One roaming beast is released after the Network Machine quest. Its species depends on the chosen starter.
const roamerText = fs.readFileSync(path.join(source, 'src/roamer.c'), 'utf8');
const roamerRoutes = new Set([...roamerText.matchAll(/MAP_NUM\((MAP_ROUTE[A-Z0-9_]+)\)/g)].map(m=>m[1]));
const roamers = [
  ['SPECIES_ENTEI','Roaming · Bulbasaur starter'],
  ['SPECIES_SUICUNE','Roaming · Charmander starter'],
  ['SPECIES_RAIKOU','Roaming · Squirtle starter']
];
for(const mapId of roamerRoutes)for(const [speciesId,method] of roamers)area(mapId).encounters.push({species:title(speciesId),speciesId,minLevel:50,maxLevel:50,chance:25,method,version:'Both'});

for (const dir of fs.readdirSync(mapRoot)) {
  const jsonPath = path.join(mapRoot, dir, 'map.json');
  if (!fs.existsSync(jsonPath)) continue;
  const map = JSON.parse(fs.readFileSync(jsonPath));
  const id = map.id;
  const scriptsPath = path.join(mapRoot, dir, 'scripts.inc');
  const scripts = fs.existsSync(scriptsPath) ? fs.readFileSync(scriptsPath, 'utf8') : '';
  const a = area(id);
  a.isOutdoor = ['MAP_TYPE_TOWN', 'MAP_TYPE_ROUTE', 'MAP_TYPE_OCEAN_ROUTE'].includes(map.map_type);
  const layout = layoutById.get(map.layout);
  if (layout) {
    a.mapImage = `${mapWebPath}/${map.layout}.png`; a.mapWidth = layout.width * 16; a.mapHeight = layout.height * 16;
    a.entrances = (map.warp_events ?? []).map((w, i) => ({ id: `${id}:warp:${i}`, x: w.x, y: w.y, targetId: w.dest_map === 'MAP_DYNAMIC' ? '' : w.dest_map, name: w.dest_map === 'MAP_DYNAMIC' ? 'Passage' : title(w.dest_map) }));
  }
  const scriptItem = label => {
    const start = itemBallScripts.indexOf(`${label}::`);
    if (start < 0) return null;
    const end = itemBallScripts.indexOf('\n\n', start);
    const body = itemBallScripts.slice(start, end < 0 ? undefined : end);
    return body.match(/\b(?:itemball|finditem)\s+(ITEM_[A-Z0-9_]+)/)?.[1] ?? null;
  };
  for (const event of map.object_events ?? []) {
    if (event.graphics_id !== 'OBJ_EVENT_GFX_ITEM_BALL') continue;
    const item = scriptItem(event.script);
    if (item) a.items.push({ id: `${id}:visible:${event.x}:${event.y}`, name: title(item), kind: 'Visible', icon: itemIcons.get(item) ?? 'question_mark.png', x: event.x, y: event.y, quantity: 1 });
  }
  for (const event of map.bg_events ?? []) {
    if (event.type === 'hidden_item') {
      const isCoins = event.item === 'ITEM_NONE' && /GAME_CORNER_COINS/.test(event.flag ?? '');
      a.items.push({ id: `${id}:hidden:${event.x}:${event.y}`, name: isCoins ? 'Coins' : title(event.item), kind: 'Hidden', icon: isCoins ? 'coin_case.png' : itemIcons.get(event.item) ?? 'question_mark.png', x: event.x, y: event.y, quantity: event.quantity ?? 1 });
    }
  }
  for (const match of scripts.matchAll(/\b(?:setwildbattle|seteventmon|givemon)\s+(SPECIES_[A-Z0-9_]+),\s*(\d+)/g)) {
    if (match[1] === 'SPECIES_MAROWAK') continue; // Pokémon Tower ghost cannot be caught.
    const before = scripts.slice(Math.max(0, match.index - 120), match.index);
    const kind = match[0].startsWith('givemon') ? 'Gift' : 'Static';
    a.specialPokemon.push({ id: `${id}:${kind}:${match[1]}:${match.index}`, species: title(match[1]), speciesId: match[1], level: Number(match[2]), kind, version: /LEAF_GREEN/.test(before) ? 'LeafGreen' : /FIRE_RED/.test(before) ? 'FireRed' : 'Both' });
  }
  for (const match of scripts.matchAll(/\b(?:giveitem|giveitem_msg\s+[^,]+,|additem)\s+(ITEM_[A-Z0-9_]+)(?:,\s*(\d+))?/g)) {
    a.items.push({ id: `${id}:event:${match.index}`, name: title(match[1]), kind: 'Event', icon: itemIcons.get(match[1]) ?? 'question_mark.png', x: -1, y: -1, quantity: Number(match[2] ?? 1) });
  }
  for (const match of scripts.matchAll(/setvar\s+VAR_0x8008,\s*(INGAME_TRADE_[A-Z0-9_]+)/g)) {
    const pair = trades[match[1]];
    if (pair) a.specialPokemon.push({ id: `${id}:Trade:${match[1]}`, species: title(pair[0]), speciesId: pair[0], level: 0, kind: 'Trade', version: 'Both', requestedSpecies: title(pair[1]) });
    if (match[1] === 'INGAME_TRADE_NIDORAN') {
      a.specialPokemon.push({ id:`${id}:Trade:NidoranFR`,species:'Nidoran F',speciesId:'SPECIES_NIDORAN_F',level:0,kind:'Trade',version:'FireRed',requestedSpecies:'Nidoran M' });
      a.specialPokemon.push({ id:`${id}:Trade:NidoranLG`,species:'Nidoran M',speciesId:'SPECIES_NIDORAN_M',level:0,kind:'Trade',version:'LeafGreen',requestedSpecies:'Nidoran F' });
    }
    if (match[1] === 'INGAME_TRADE_NIDORINOA') {
      a.specialPokemon.push({ id:`${id}:Trade:NidorinaFR`,species:'Nidorina',speciesId:'SPECIES_NIDORINA',level:0,kind:'Trade',version:'FireRed',requestedSpecies:'Nidorino' });
      a.specialPokemon.push({ id:`${id}:Trade:NidorinoLG`,species:'Nidorino',speciesId:'SPECIES_NIDORINO',level:0,kind:'Trade',version:'LeafGreen',requestedSpecies:'Nidorina' });
    }
    if (match[1] === 'INGAME_TRADE_LICKITUNG') {
      a.specialPokemon.push({ id:`${id}:Trade:LickitungFR`,species:'Lickitung',speciesId:'SPECIES_LICKITUNG',level:0,kind:'Trade',version:'FireRed',requestedSpecies:'Golduck' });
      a.specialPokemon.push({ id:`${id}:Trade:LickitungLG`,species:'Lickitung',speciesId:'SPECIES_LICKITUNG',level:0,kind:'Trade',version:'LeafGreen',requestedSpecies:'Slowbro' });
    }
  }
}

const addSpecial = (mapId, speciesId, level, kind = 'Gift', version = 'Both') => area(mapId).specialPokemon.push({ id:`${mapId}:${kind}:${speciesId}:${version}`, species:title(speciesId), speciesId, level, kind, version });
const addEventItem = (mapId, itemId) => area(mapId).items.push({id:`${mapId}:event:${itemId}`,name:title(itemId),kind:'Event',icon:itemIcons.get(itemId)??'question_mark.png',x:-1,y:-1,quantity:1});
for (const species of ['SPECIES_BULBASAUR','SPECIES_CHARMANDER','SPECIES_SQUIRTLE']) addSpecial('MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB',species,5);
for (const species of ['SPECIES_HITMONLEE','SPECIES_HITMONCHAN']) addSpecial('MAP_SAFFRON_CITY_DOJO',species,25);
addSpecial('MAP_FIVE_ISLAND_WATER_LABYRINTH','SPECIES_TOGEPI',5,'Gift');
for (const [species,fr,lg] of [['SPECIES_ABRA',9,7],['SPECIES_CLEFAIRY',8,12],['SPECIES_DRATINI',18,24],['SPECIES_PORYGON',26,18]]) { addSpecial('MAP_CELADON_CITY_GAME_CORNER_PRIZE_ROOM',species,fr,'Gift','FireRed');addSpecial('MAP_CELADON_CITY_GAME_CORNER_PRIZE_ROOM',species,lg,'Gift','LeafGreen'); }
addSpecial('MAP_CELADON_CITY_GAME_CORNER_PRIZE_ROOM','SPECIES_SCYTHER',25,'Gift','FireRed');
addSpecial('MAP_CELADON_CITY_GAME_CORNER_PRIZE_ROOM','SPECIES_PINSIR',18,'Gift','LeafGreen');
for(const item of ['ITEM_LUXURY_BALL','ITEM_BIG_PEARL','ITEM_PEARL','ITEM_STARDUST','ITEM_STAR_PIECE','ITEM_NUGGET','ITEM_RARE_CANDY']) addEventItem('MAP_FIVE_ISLAND_RESORT_GORGEOUS_HOUSE',item);

// Collapse duplicate slot rows while retaining their combined encounter chance.
for (const a of areas.values()) {
  const combined = new Map();
  for (const e of a.encounters) {
    const key = [e.speciesId, e.method, e.version, e.minLevel, e.maxLevel].join('|');
    if (combined.has(key)) combined.get(key).chance += e.chance;
    else combined.set(key, { ...e });
  }
  a.encounters = [...combined.values()].sort((x, y) => x.method.localeCompare(y.method) || y.chance - x.chance);
  a.items = [...new Map(a.items.map(i => [[i.kind,i.name,i.x,i.y].join('|'),i])).values()];
  a.specialPokemon = [...new Map(a.specialPokemon.map(p => [[p.kind,p.speciesId,p.version].join('|'),p])).values()];
}
const excludedMaps = /(?:PROTOTYPE|UNUSED)|^MAP_(?:BATTLE_COLOSSEUM_[24]P|RECORD_CORNER|TRADE_CENTER|UNION_ROOM)$/;
const hasRelevantData = a => a.encounters.length || a.items.length || a.specialPokemon.length;
const outdoorIds = new Set([...areas.values()].filter(a => a.isOutdoor && !excludedMaps.test(a.id)).map(a => a.id));
const resolveContractedTarget = (sourceId, targetId) => {
  const queue = targetId ? [targetId] : [], visited = new Set([sourceId]);
  while (queue.length) {
    const id = queue.shift(); if (visited.has(id)) continue; visited.add(id);
    const target = areas.get(id); if (!target || excludedMaps.test(id)) continue;
    if (outdoorIds.has(id) || hasRelevantData(target)) return target;
    for (const exit of target.entrances) if (exit.targetId && !visited.has(exit.targetId)) queue.push(exit.targetId);
  }
  return null;
};
for (const a of areas.values()) {
  a.entrances = a.entrances.map(entrance => {
    const target = resolveContractedTarget(a.id, entrance.targetId);
    return target ? { ...entrance, targetId: target.id, name: target.name } : null;
  }).filter(Boolean);
  delete a.isOutdoor;
}
const data = [...areas.values()].filter(a => !excludedMaps.test(a.id) && (outdoorIds.has(a.id) || hasRelevantData(a)))
  .sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
const includedMapIds = new Set(data.map(a => a.id));
for (const a of data) for (const entrance of a.entrances)
  if (!includedMapIds.has(entrance.targetId)) throw new Error(`${a.id} targets omitted area ${entrance.targetId}`);
const adjacency = new Map(data.map(a => [a.id, new Set()]));
for (const a of data) for (const entrance of a.entrances) {
  adjacency.get(a.id).add(entrance.targetId);
  adjacency.get(entrance.targetId).add(a.id);
}
const reachable = new Set(outdoorIds), reachQueue = [...reachable];
while (reachQueue.length) for (const target of adjacency.get(reachQueue.shift()) ?? []) if (!reachable.has(target)) { reachable.add(target); reachQueue.push(target); }
const unreachableRelevant = data.filter(a => hasRelevantData(a) && !reachable.has(a.id));
if (unreachableRelevant.length) throw new Error(`Relevant areas are unreachable from an outdoor map: ${unreachableRelevant.map(a => a.id).join(', ')}`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ source: 'pret/pokefirered', generated: new Date().toISOString().slice(0, 10), areas: data }));
const dexHeader = fs.readFileSync(path.join(source, 'include/constants/pokedex.h'), 'utf8');
const dexBlock = dexHeader.slice(dexHeader.indexOf('NATIONAL_DEX_NONE'), dexHeader.indexOf('#define NATIONAL_DEX_COUNT'));
const dexSpecies = [...dexBlock.matchAll(/\bNATIONAL_DEX_([A-Z0-9_]+),?/g)].map(m=>m[1]).filter(x=>x!=='NONE').slice(0,386);
const evolutionText = fs.readFileSync(path.join(source, 'src/data/pokemon/evolution.h'), 'utf8');
const evolutionLinks = [];
for(const entry of evolutionText.matchAll(/\[(SPECIES_[A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)(?=\n\s*\[SPECIES_|\n};)/g))for(const evo of entry[2].matchAll(/\{(EVO_[A-Z0-9_]+),\s*[^,]+,\s*(SPECIES_[A-Z0-9_]+)/g))if(!evo[1].startsWith('EVO_TRADE'))evolutionLinks.push([entry[1],evo[2]]);
const eventSpecies = new Set(['SPECIES_MEW','SPECIES_LUGIA','SPECIES_HO_OH','SPECIES_CELEBI','SPECIES_JIRACHI','SPECIES_DEOXYS']);
const obtainable = {};
for(const version of ['FireRed','LeafGreen']){
  const set=new Set();
  for(const a of data){for(const e of a.encounters)if(e.version==='Both'||e.version===version)set.add(e.speciesId);for(const p of a.specialPokemon)if((p.version==='Both'||p.version===version)&&!eventSpecies.has(p.speciesId))set.add(p.speciesId);}
  let changed=true;while(changed){changed=false;for(const [x,y] of evolutionLinks)if(set.has(x)!==set.has(y)){set.add(x);set.add(y);changed=true;}}
  obtainable[version]=set;
}
const pokedex=dexSpecies.map((id,index)=>{const speciesId=`SPECIES_${id}`;const availability={};for(const version of ['FireRed','LeafGreen'])availability[version]=obtainable[version].has(speciesId)?'Obtainable':eventSpecies.has(speciesId)?'Event distribution':'Trade / transfer required';return {number:index+1,regionalNumber:index<151?index+1:null,name:title(speciesId).replace('Ho Oh','Ho-Oh'),speciesId,availability};});
fs.writeFileSync(path.join(path.dirname(output),'pokedex.json'),JSON.stringify(pokedex));
const referencedPokemonFiles = new Set(['question_mark.png', ...pokedex.filter(entry => entry.speciesId !== 'SPECIES_UNOWN').map(entry => entry.speciesId.replace('SPECIES_', '').toLowerCase() + '.png')]);
const referencedItemFiles = new Set(['question_mark.png', ...data.flatMap(a => a.items.map(item => item.icon))]);
for (const [directory, referenced] of [[pokemonOut, referencedPokemonFiles], [itemsOut, referencedItemFiles]])
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.png')))
    if (!referenced.has(file)) fs.rmSync(path.join(directory, file));
console.log(`Generated ${data.length} areas, ${data.reduce((n,a)=>n+a.encounters.length,0)} encounter rows, ${data.reduce((n,a)=>n+a.items.length,0)} items, and ${data.reduce((n,a)=>n+a.specialPokemon.length,0)} special Pokémon.`);
