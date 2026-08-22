import fs from 'node:fs';
import path from 'node:path';

const tierChance = { rare: 10, uncommon: 30, common: 60 };

export function readRenewableHiddenItems(source) {
  const table = fs.readFileSync(path.join(source, 'src/renewable_hidden_items.c'), 'utf8');
  const mapRoot = path.join(source, 'data/maps');
  const mapEvents = new Map();
  for (const directory of fs.readdirSync(mapRoot)) {
    const mapPath = path.join(mapRoot, directory, 'map.json');
    if (!fs.existsSync(mapPath)) continue;
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    mapEvents.set(map.id, (map.bg_events ?? []).filter(event => event.type === 'hidden_item'));
  }

  const maps = [];
  for (const entry of table.matchAll(/^    \{\n\s*\.mapGroup = MAP_GROUP\((MAP_[A-Z0-9_]+)\),([\s\S]*?)^    \},/gm)) {
    const mapId = entry[1];
    const chanceByFlag = new Map();
    for (const tier of entry[2].matchAll(/\.(rare|uncommon|common)\s*=\s*\{([\s\S]*?)^        \}/gm)) {
      for (const flag of tier[2].matchAll(/HIDDEN_ID\((FLAG_HIDDEN_ITEM_[A-Z0-9_]+)\)/g))
        chanceByFlag.set(flag[1], (chanceByFlag.get(flag[1]) ?? 0) + tierChance[tier[1]]);
    }
    const events = mapEvents.get(mapId);
    if (!events) throw new Error(`Renewable table map ${mapId} has no map.json.`);
    const resources = [...chanceByFlag].map(([flag, chance]) => {
      const matches = events.filter(event => event.flag === flag);
      if (matches.length !== 1) throw new Error(`${mapId} renewable flag ${flag} matched ${matches.length} hidden-item events.`);
      const event = matches[0];
      if ((event.quantity ?? 1) !== 1 || event.underfoot !== false)
        throw new Error(`${mapId} renewable flag ${flag} has an unexpected quantity or interaction type.`);
      return { flag, item: event.item, x: event.x, y: event.y, chance };
    });
    maps.push({ mapId, resources });
  }

  if (maps.length !== 15) throw new Error(`Expected 15 renewable maps, but parsed ${maps.length}.`);
  const byFlag = new Map(maps.flatMap(map => map.resources.map(resource => [resource.flag, { mapId: map.mapId, ...resource }])));
  const listedEvents = [...mapEvents.entries()].flatMap(([mapId, events]) =>
    events.filter(event => byFlag.has(event.flag)).map(event => ({ mapId, flag: event.flag })));
  if (listedEvents.length !== byFlag.size)
    throw new Error(`${byFlag.size} renewable flags matched ${listedEvents.length} hidden-item events.`);
  if (byFlag.size !== 61) throw new Error(`Expected 61 renewable resources, but parsed ${byFlag.size}.`);
  return { mapCount: maps.length, resourceCount: byFlag.size, maps, byFlag };
}
