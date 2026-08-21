export const displayNameFromConstant = value => value.replace(/^MAP_/, '').replace(/^SPECIES_/, '').replace(/^ITEM_/, '')
  .toLowerCase().split('_').filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')
  .replace(/Pokemon/g, 'Pokémon').replace(/Pokecenter/g, 'Pokémon Center')
  .replace(/Poke /g, 'Poké ').replace(/Mt /g, 'Mt. ').replace(/Mount Moon/g, 'Mt. Moon')
  .replace(/Ho Oh/g, 'Ho-Oh').replace(/Farfetch D/g, 'Farfetch’d').replace(/Mr Mime/g, 'Mr. Mime')
  .replace(/Nidoran F/g, 'Nidoran♀').replace(/Nidoran M/g, 'Nidoran♂')
  .replace(/([0-9])f\b/g, '$1F').replace(/B([0-9])f\b/g, 'B$1F')
  .replace(/Ss Aqua/g, 'S.S. Aqua').replace(/Bills/g, "Bill's").replace(/Elms/g, "Elm's")
  .replace(/Kurts/g, "Kurt's").replace(/Tims/g, "Tim's").replace(/Kyles/g, "Kyle's")
  .replace(/Emys/g, "Emy's").replace(/Mikes/g, "Mike's").replace(/Lances/g, "Lance's")
  .replace(/Wills/g, "Will's").replace(/Kogas/g, "Koga's").replace(/Brunos/g, "Bruno's")
  .replace(/^Tm /, 'TM ').replace(/^Hm /, 'HM ').replace(/ Exp /g, ' Exp. ')
  .replace(/Hp/g, 'HP').replace(/Pp/g, 'PP').replace(/S Mt/g, 's Mt');

export const speciesId = species => `SPECIES_${species}`;
