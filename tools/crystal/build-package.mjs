import fs from 'node:fs';
import path from 'node:path';

import {
  finishGen2Package,
  prepareGen2Package
} from '../gen2/build-package.mjs';
import { createConnectedWorldLayout, renderConnectedWorld } from '../gen2/connected-world.mjs';
import { displayNameFromConstant, speciesId } from '../gen2/display-names.mjs';
import { copySpriteWithTransparentBackground } from '../gen2/sprite-rendering.mjs';

const versions = [{ id: 'Crystal', symbol: '_CRYSTAL' }];
const tilesetGraphics = new Map([['BATTLE_TOWER_OUTSIDE', 'johto_modern']]);

function addCrystalContent(work) {
  const { read, maps } = work;
  const roamerArea = maps.get('MAP_BURNED_TOWER_1F');
  for (const species of ['RAIKOU', 'ENTEI']) roamerArea?.encounters.push({
    species: displayNameFromConstant(species),
    speciesId: speciesId(species),
    minLevel: 40,
    maxLevel: 40,
    chance: 100,
    method: 'Roaming',
    condition: null,
    type: 'Roaming',
    version: 'Both'
  });

  const itemConstants = [...read('constants/item_constants.asm').matchAll(/^\s*const\s+([A-Z][A-Z0-9_]+)\s*;/gm)]
    .map(match => match[1]);
  const rewardConstants = read('constants/battle_tower_constants.asm');
  const firstReward = rewardConstants.match(/BATTLETOWER_MIN_REWARD\s+EQU\s+([A-Z0-9_]+)/)?.[1];
  const lastReward = rewardConstants.match(/BATTLETOWER_MAX_REWARD\s+EQU\s+([A-Z0-9_]+)/)?.[1];
  const quantity = +(rewardConstants.match(/BATTLETOWER_REWARD_QUANTITY\s+EQU\s+(\d+)/)?.[1] ?? 0);
  const rewards = itemConstants.slice(itemConstants.indexOf(firstReward), itemConstants.indexOf(lastReward) + 1)
    .filter(item => item !== 'LUCKY_PUNCH');
  if (rewards.length !== 5 || quantity !== 5) throw new Error('Crystal Battle Tower reward audit failed.');
  maps.get('MAP_BATTLE_TOWER_1F').resources.push({
    name: 'Battle Tower prize', kind: 'Repeatable seven-win challenge', x: 7, y: 6,
    comment: 'Awarded after seven consecutive wins.',
    rewards: rewards.map((item, index) => ({
      name: displayNameFromConstant(item), quantity, weight: index < 2 ? 2 : 1
    }))
  });

  const registrations = [
    ['MAP_NATIONAL_PARK', 'Beverly', 18, 29, ['Nugget']],
    ['MAP_ROUTE_27', 'Jose', 58, 13, ['Star Piece']],
    ['MAP_ROUTE_31', 'Wade', 21, 13, ['Berry', 'Psncureberry', 'Przcureberry', 'Bitter Berry']],
    ['MAP_ROUTE_34', 'Gina', 10, 26, ['Leaf Stone']],
    ['MAP_ROUTE_36', 'Alan', 31, 14, ['Fire Stone']],
    ['MAP_ROUTE_38', 'Dana', 15, 3, ['Thunderstone']],
    ['MAP_ROUTE_39', 'Derek', 10, 22, ['Nugget']],
    ['MAP_ROUTE_42', 'Tully', 40, 10, ['Water Stone']],
    ['MAP_ROUTE_43', 'Tiffany', 9, 25, ['Pink Bow']],
    ['MAP_ROUTE_44', 'Wilton', 35, 3, ['Ultra Ball', 'Great Ball', 'Poké Ball']]
  ];
  for (const [mapId, trainer, x, y, giftNames] of registrations) {
    const area = maps.get(mapId);
    const sourceText = read(`maps/${area.label}.asm`);
    const trainerAtLocation = new RegExp(`^\\s*object_event\\s+${x},\\s+${y},[^\\n]*${trainer}`, 'im');
    if (!trainerAtLocation.test(sourceText)) throw new Error(`${trainer} phone registration location audit failed.`);
    const gifts = area.items.filter(item => item.kind === 'Event' && giftNames.includes(item.name));
    if (gifts.length !== giftNames.length)
      throw new Error(`${trainer} phone gift audit found ${gifts.length}; expected ${giftNames.length}.`);
    area.items = area.items.filter(item => !gifts.includes(item));
    area.items.push({
      id: `${mapId}:event:REGISTER_${trainer.toUpperCase()}`,
      name: `Register ${trainer}`, kind: 'Event', icon: 'question_mark.png', x, y, quantity: 1
    });
  }

  const resourceCount = [...maps.values()].reduce((count, area) => count + area.resources.length, 0);
  const registrationCount = [...maps.values()].flatMap(area => area.items)
    .filter(item => item.id.includes(':event:REGISTER_')).length;
  if (resourceCount !== 35 || registrationCount !== registrations.length)
    throw new Error(`Crystal resource audit found ${resourceCount} resources and ${registrationCount} registrations.`);

  const oddEggSpecies = [...new Set([...read('data/events/odd_eggs.asm').matchAll(/^\s*db\s+([A-Z0-9_]+)\s*\n\s*db\s+NO_ITEM/gm)]
    .map(match => match[1]))];
  const dayCare = maps.get('MAP_DAY_CARE');
  for (const species of oddEggSpecies) dayCare?.specialPokemon.push({
    id: `MAP_DAY_CARE:Egg:${species}:Crystal`,
    species: displayNameFromConstant(species),
    speciesId: speciesId(species),
    level: 5,
    kind: 'Egg',
    version: 'Crystal',
    requestedSpecies: null
  });
}

async function registerCrystalSprites(work) {
  const { read, species, assets, sharp } = work;
  const pokemonSprites = {};
  for (const name of species) {
    const folder = name === 'UNOWN' ? 'unown_a' : name.toLowerCase();
    const source = path.join(read.root, `gfx/pokemon/${folder}/front.png`);
    if (!fs.existsSync(source)) throw new Error(`Missing Crystal sprite for ${name}.`);
    pokemonSprites[speciesId(name)] = await assets.pokemonSprite(`${folder}.png`, target =>
      copySpriteWithTransparentBackground(source, target, sharp, true));
  }
  return pokemonSprites;
}

export async function buildCrystalPackage({ source, assets, sharp }) {
  const work = await prepareGen2Package({ source, sourceName: 'pret/pokecrystal', versions, assets, sharp, tilesetGraphics });
  addCrystalContent(work);
  const layout = await createConnectedWorldLayout(work.maps, assets, sharp);
  const route40 = layout.positions.get('MAP_ROUTE_40');
  if (!route40) throw new Error('Route 40 is missing from the Crystal overworld.');
  layout.positions.set('MAP_BATTLE_TOWER_OUTSIDE', { x: route40.x, y: route40.y - 320 });
  layout.crops.set('MAP_BATTLE_TOWER_OUTSIDE', { left: 0, top: 0, width: 320, height: 320 });
  const world = await renderConnectedWorld({ worldId: 'crystal-johto-kanto', maps: work.maps, layout, assets, sharp });
  const pokemonSprites = await registerCrystalSprites(work);
  return finishGen2Package(work, { world, pokemonSprites });
}
