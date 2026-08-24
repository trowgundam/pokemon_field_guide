const overrides = new Map([
  ['POKE_BALL', 'Poké Ball'], ['PP_UP', 'PP Up'], ['PP_MAX', 'PP Max'], ['HP_UP', 'HP Up'],
  ['PARLYZ_HEAL', 'Parlyz Heal'], ['SP_DEF', 'Sp. Def'], ['MR_MIME', 'Mr. Mime'],
  ['MIME_JR', 'Mime Jr.'], ['HO_OH', 'Ho-Oh'], ['PORYGON_Z', 'Porygon-Z'],
  ['NIDORAN_M', 'Nidoran♂'], ['NIDORAN_F', 'Nidoran♀'], ['FARFETCHD', "Farfetch’d"],
  ['JUBLIFE', 'Jubilife City'], ['CANALAVE', 'Canalave City'], ['OREBURGH', 'Oreburgh City'],
  ['ETERNA', 'Eterna City'], ['HEARTHOME', 'Hearthome City'], ['VEILSTONE', 'Veilstone City'],
  ['PASTORIA', 'Pastoria City'], ['SNOWPOINT', 'Snowpoint City'], ['SUNYSHORE', 'Sunyshore City'],
  ['TWINLEAF', 'Twinleaf Town'], ['FLOAROMA', 'Floaroma Town'], ['SOLACEON', 'Solaceon Town'],
  ['SANDGEM', 'Sandgem Town'], ['CELESTIC', 'Celestic Town']
]);

export function displayName(value) {
  const bare = value.replace(/^(?:MAP_HEADER|MAP|SPECIES|ITEM|MOVE|FLAG_OBTAINED_HIDDEN|LOCALID_ITEM)_/, '');
  if (overrides.has(bare)) return overrides.get(bare);
  if (/^TM\d+$/.test(bare) || /^HM\d+$/.test(bare)) return bare;
  return bare.toLowerCase().split('_').filter(Boolean)
    .map(word => word === 'b1f' || word === 'b2f' || word === 'b3f' || word === 'b4f' || word === 'b5f'
      || /^\d+f$/.test(word) ? word.toUpperCase() : `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
    .replace(/ Pokemon /g, ' Pokémon ')
    .replace(/^Pokemon /, 'Pokémon ');
}

export const fileSlug = value => value.replace(/^(?:MAP_HEADER|MAP|SPECIES|ITEM)_/, '').toLowerCase();
