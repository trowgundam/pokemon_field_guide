const replacements = [
  [/\bPokemon\b/g, 'Pokémon'], [/\bPoke\b/g, 'Poké'], [/\bMt\b/g, 'Mt.'],
  [/\bSs\b/g, 'S.S.'], [/\bHo Oh\b/g, 'Ho-Oh'], [/\bMr Mime\b/g, 'Mr. Mime'],
  [/\bFarfetchd\b/g, 'Farfetch’d'], [/\bNidoran F\b/g, 'Nidoran♀'], [/\bNidoran M\b/g, 'Nidoran♂'],
  [/\bPp\b/g, 'PP'], [/\bHp\b/g, 'HP'], [/\bExp Share\b/g, 'Exp. Share'],
  [/\bKings Rock\b/g, "King's Rock"], [/\bDeep Sea\b/g, 'DeepSea'],
  [/\bDevon Scope\b/g, 'Devon Scope'], [/\bOld Sea Map\b/g, 'Old Sea Map']
];

export function displayName(value) {
  let name = value
    .replace(/^MAP_/, '').replace(/^SPECIES_/, '').replace(/^ITEM_/, '').replace(/^LAYOUT_/, '')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .toLowerCase().split('_').flatMap(part => part.split(' '))
    .filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')
    .replace(/(Route)(\d+)/g, '$1 $2').replace(/(Room)(\d+)/g, '$1 $2')
    .replace(/\bB(\d+)f\b/g, 'B$1F').replace(/\b(\d+)f\b/g, '$1F')
    .replace(/\bTm(\d+)/g, 'TM$1').replace(/\bHm(\d+)/g, 'HM$1');
  for (const [pattern, replacement] of replacements) name = name.replace(pattern, replacement);
  return name;
}

export const speciesId = value => value.startsWith('SPECIES_') ? value : `SPECIES_${value}`;
