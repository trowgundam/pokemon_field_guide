import fs from 'node:fs';
import path from 'node:path';

import { registerQuestionMarkSprites } from '../package-finalization/assets.mjs';
import { displayName } from './display-names.mjs';
import { copySpriteWithTransparentBackground } from './sprite-rendering.mjs';

const nationalDex = source => {
  const files = ['include/constants/pokedex.h', 'include/constants/species.h']
    .map(relative => path.join(source, relative)).filter(fs.existsSync);
  const text = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const numbered = [...text.matchAll(/^#define\s+NATIONAL_DEX_([A-Z0-9_]+)\s+(\d+)/gm)]
    .map(match => ({ name: match[1], number: Number(match[2]) }))
    .filter(entry => entry.number >= 1 && entry.number <= 386)
    .sort((left, right) => left.number - right.number);
  if (numbered.length >= 386) return numbered.slice(0, 386).map(entry => entry.name);
  const start = text.indexOf('NATIONAL_DEX_NONE'), end = text.indexOf('NATIONAL_DEX_COUNT', start);
  const names = [...text.slice(start, end).matchAll(/\bNATIONAL_DEX_([A-Z0-9_]+)/g)]
    .map(match => match[1]).filter(name => name !== 'NONE');
  if (names.length < 386) throw new Error(`National Pokédex audit found ${names.length} species; expected 386.`);
  return names.slice(0, 386);
};

const hoennDex = source => {
  const files = ['include/constants/pokedex.h', 'include/constants/species.h']
    .map(relative => path.join(source, relative)).filter(fs.existsSync);
  const text = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const numbered = new Map([...text.matchAll(/^#define\s+HOENN_DEX_([A-Z0-9_]+)\s+(\d+)/gm)]
    .map(match => [match[1], Number(match[2])]));
  if (numbered.size) return numbered;
  const start = text.indexOf('HOENN_DEX_NONE'), end = text.indexOf('HOENN_DEX_COUNT', start);
  return new Map([...text.slice(start, end).matchAll(/\bHOENN_DEX_([A-Z0-9_]+)/g)]
    .map(match => match[1]).filter(name => name !== 'NONE').map((name, index) => [name, index + 1]));
};

export function selectReachableAreas(work, worlds, excluded) {
  const reachable = new Set(), queue = [];
  const enqueue = id => {
    if (!id || reachable.has(id) || excluded.test(id) || !work.areas.has(id)) return;
    reachable.add(id); queue.push(id);
  };
  for (const placement of worlds.flatMap(world => world.maps)) enqueue(placement.id);
  while (queue.length) {
    const area = work.areas.get(queue.shift());
    for (const entrance of area.entrances) enqueue(entrance.targetId);
    for (const transport of area.transports) for (const destination of transport.destinations) enqueue(destination.targetId);
  }
  const areas = [...reachable].map(id => work.areas.get(id));
  for (const area of areas) {
    area.entrances = area.entrances.map(entrance => excluded.test(entrance.targetId) || !work.areas.has(entrance.targetId)
      ? { ...entrance, targetId: '' } : entrance);
  }
  return areas;
}

const evolutionClosure = (source, obtainable) => {
  const text = fs.readFileSync(path.join(source, 'src/data/pokemon/evolution.h'), 'utf8');
  const links = [];
  for (const entry of text.matchAll(/\[(SPECIES_[A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)(?=\n\s*\[SPECIES_|\n};)/g))
    for (const evolution of entry[2].matchAll(/\{\s*(EVO_[A-Z0-9_]+),\s*[^,]+,\s*(SPECIES_[A-Z0-9_]+)/g))
      if (!evolution[1].startsWith('EVO_TRADE')) links.push([entry[1], evolution[2]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [before, after] of links) if (obtainable.has(before) !== obtainable.has(after)) {
      obtainable.add(before); obtainable.add(after); changed = true;
    }
  }
};

export function buildPokedex(work, areas) {
  const names = nationalDex(work.source), regional = hoennDex(work.source);
  const eventSpecies = new Set([
    'SPECIES_MEW', 'SPECIES_LUGIA', 'SPECIES_HO_OH', 'SPECIES_CELEBI', 'SPECIES_JIRACHI', 'SPECIES_DEOXYS'
  ]);
  const obtainable = {};
  for (const version of work.versions) {
    const set = new Set();
    for (const area of areas) {
      for (const encounter of area.encounters) if (encounter.version === 'Both' || encounter.version === version.id) set.add(encounter.speciesId);
      for (const pokemon of area.specialPokemon) if (pokemon.version === 'Both' || pokemon.version === version.id) set.add(pokemon.speciesId);
    }
    evolutionClosure(work.source, set); obtainable[version.id] = set;
  }
  return names.map((name, index) => {
    const speciesId = `SPECIES_${name}`, availability = {};
    for (const version of work.versions) availability[version.id] = obtainable[version.id].has(speciesId)
      ? 'Obtainable' : eventSpecies.has(speciesId) ? 'Event distribution' : 'Trade / transfer required';
    const regionalNumber = regional.get(name);
    return {
      number: index + 1,
      regionalNumber: regionalNumber && regionalNumber <= 202 ? regionalNumber : null,
      name: displayName(speciesId), speciesId, availability
    };
  });
}

export async function registerPokemonSprites(work, pokedex, assets, sharp, animated) {
  const pokemonSprites = {};
  for (const entry of pokedex) {
    const folder = entry.speciesId.replace('SPECIES_', '').toLowerCase();
    const relative = folder === 'unown'
      ? animated ? 'a/anim_front.png' : 'front_a.png'
      : folder === 'castform'
        ? animated ? 'normal/anim_front.png' : 'front_normal_form.png'
        : animated ? 'anim_front.png' : 'front.png';
    const sourceFile = path.join(work.source, 'graphics/pokemon', folder, relative);
    if (!fs.existsSync(sourceFile)) throw new Error(`Missing ${animated ? 'animated ' : ''}battle sprite for ${entry.speciesId}.`);
    pokemonSprites[entry.speciesId] = await assets.pokemonSprite(`${folder}.png`, target =>
      copySpriteWithTransparentBackground(sourceFile, target, sharp));
  }
  const pokemonFallback = await registerQuestionMarkSprites(assets, sharp);
  return { pokemonSprites, pokemonFallback };
}

export function finishAreas(work, areas, mapAssets) {
  for (const area of areas) {
    area.mapImage = mapAssets.get(area.mapLayout);
    if (!area.mapImage) throw new Error(`${area.id} lacks rendered layout ${area.mapLayout}.`);
    area.specialPokemon = [...new Map(area.specialPokemon.map(pokemon => [pokemon.id, pokemon])).values()];
    area.items = [...new Map(area.items.map(item => [item.id, item])).values()];
    delete area.mapLayout; delete area.scripts;
  }
  return areas.sort((left, right) => left.region.localeCompare(right.region) || left.name.localeCompare(right.name));
}
