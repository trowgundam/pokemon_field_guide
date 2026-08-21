import fs from 'node:fs';
import path from 'node:path';

import {
  finishGen2Package,
  prepareGen2Package
} from '../gen2/build-package.mjs';
import { createConnectedWorldLayout, renderConnectedWorld } from '../gen2/connected-world.mjs';
import { displayNameFromConstant, speciesId } from '../gen2/display-names.mjs';
import { copySpriteWithTransparentBackground } from '../gen2/sprite-rendering.mjs';

const versions = [{ id: 'Gold', symbol: '_GOLD' }, { id: 'Silver', symbol: '_SILVER' }];

function addGoldSilverContent(maps) {
  for (const area of maps.values()) {
    area.specialPokemon = area.specialPokemon.filter(pokemon => !['SPECIES_LUGIA', 'SPECIES_HO_OH'].includes(pokemon.speciesId));
  }
  const addStaticPokemon = (areaId, species, level, version) => maps.get(areaId)?.specialPokemon.push({
    id: `${areaId}:Static:${species}:${version}`,
    species: displayNameFromConstant(species),
    speciesId: speciesId(species),
    level,
    kind: 'Static',
    version,
    requestedSpecies: null
  });
  addStaticPokemon('MAP_WHIRL_ISLAND_LUGIA_CHAMBER', 'LUGIA', 70, 'Gold');
  addStaticPokemon('MAP_WHIRL_ISLAND_LUGIA_CHAMBER', 'LUGIA', 40, 'Silver');
  addStaticPokemon('MAP_TIN_TOWER_ROOF', 'HO_OH', 40, 'Gold');
  addStaticPokemon('MAP_TIN_TOWER_ROOF', 'HO_OH', 70, 'Silver');

  const roamerArea = maps.get('MAP_BURNED_TOWER_B1F');
  for (const species of ['RAIKOU', 'ENTEI', 'SUICUNE']) roamerArea?.encounters.push({
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
}

async function registerGoldSilverSprites(work) {
  const { read, species, assets, sharp } = work;
  const pokemonSprites = {};
  const pokemonSpritesByVersion = { Gold: {}, Silver: {} };
  for (const name of species) {
    const folder = name === 'UNOWN' ? 'unown_a' : name.toLowerCase();
    const gold = path.join(read.root, `gfx/pokemon/${folder}/front_gold.png`);
    const silver = path.join(read.root, `gfx/pokemon/${folder}/front_silver.png`);
    const shared = path.join(read.root, `gfx/pokemon/${folder}/front.png`);
    const goldSource = fs.existsSync(gold) ? gold : shared;
    const silverSource = fs.existsSync(silver) ? silver : shared;
    if (!fs.existsSync(goldSource) || !fs.existsSync(silverSource)) throw new Error(`Missing Gold/Silver sprite for ${name}.`);
    const same = goldSource === silverSource || fs.readFileSync(goldSource).equals(fs.readFileSync(silverSource));
    if (same) {
      const sprite = await assets.pokemonSprite(`${folder}.png`, target =>
        copySpriteWithTransparentBackground(goldSource, target, sharp));
      pokemonSprites[speciesId(name)] = sprite;
      pokemonSpritesByVersion.Gold[speciesId(name)] = sprite;
      pokemonSpritesByVersion.Silver[speciesId(name)] = sprite;
      continue;
    }
    const goldSprite = await assets.pokemonSprite(`${folder}-gold.png`, target =>
      copySpriteWithTransparentBackground(goldSource, target, sharp));
    const silverSprite = await assets.pokemonSprite(`${folder}-silver.png`, target =>
      copySpriteWithTransparentBackground(silverSource, target, sharp));
    pokemonSprites[speciesId(name)] = goldSprite;
    pokemonSpritesByVersion.Gold[speciesId(name)] = goldSprite;
    pokemonSpritesByVersion.Silver[speciesId(name)] = silverSprite;
  }
  return { pokemonSprites, pokemonSpritesByVersion };
}

export async function buildGoldSilverPackage({ source, assets, sharp }) {
  const work = await prepareGen2Package({ source, sourceName: 'pret/pokegold', versions, assets, sharp });
  addGoldSilverContent(work.maps);
  const layout = await createConnectedWorldLayout(work.maps, assets, sharp);
  const world = await renderConnectedWorld({ worldId: 'gs-johto-kanto', maps: work.maps, layout, assets, sharp });
  const sprites = await registerGoldSilverSprites(work);
  return finishGen2Package(work, { world, ...sprites });
}
