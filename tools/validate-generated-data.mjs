import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'PokemonFieldGuide/wwwroot');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'games/catalog.json')));
const integerFields = {
  fieldguide: ['minLevel', 'maxLevel', 'level', 'x', 'y', 'quantity', 'mapWidth', 'mapHeight'],
  pokedex: ['number', 'regionalNumber'],
  worlds: ['width', 'height', 'x', 'y']
};

const walk = (value, visit) => {
  if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (value && typeof value === 'object') { visit(value); for (const child of Object.values(value)) walk(child, visit); }
};
const pokemonSpriteName = (rules, speciesId) => rules === 'rb' || rules === 'yellow'
  ? ({ SPECIES_NIDORAN_F: 'nidoranf.png', SPECIES_NIDORAN_M: 'nidoranm.png', SPECIES_MR_MIME: 'mr.mime.png' }[speciesId]
    ?? speciesId.replace('SPECIES_', '').toLowerCase() + '.png')
  : speciesId.replace('SPECIES_', '').toLowerCase() + '.png';
const hasEmbeddedPokemonIcon = (rules, speciesId) => rules === 'frlg' && speciesId === 'SPECIES_UNOWN';
const normalizeAreaId = (rules, id) => rules === 'frlg' && id === 'MAP_SAFFRON_CITY_CONNECTION' ? 'MAP_SAFFRON_CITY' : id;
const pngFiles = directory => fs.readdirSync(directory).filter(file => file.endsWith('.png')).map(file => path.join(directory, file));

for (const game of catalog.games) {
  const versions = new Set(game.versions.map(version => version.id));
  if (!versions.size) throw new Error(`${game.id}: at least one version is required`);
  for (const configuredPath of [game.dataPath, game.pokedexPath, game.worldsPath, game.pokemonSpritePath, game.itemSpritePath])
    if (!fs.existsSync(path.join(root, configuredPath))) throw new Error(`${game.id}: configured path does not exist: ${configuredPath}`);

  const documents = {};
  for (const [kind, relative] of [['fieldguide', game.dataPath], ['pokedex', game.pokedexPath], ['worlds', game.worldsPath]]) {
    const file = path.join(root, relative), data = JSON.parse(fs.readFileSync(file));
    documents[kind] = data;
    walk(data, object => {
      for (const field of integerFields[kind]) if (field in object && object[field] !== null && !Number.isInteger(object[field]))
        throw new Error(`${relative}: ${field} must be an integer, received ${object[field]}`);
    });
  }

  const areas = documents.fieldguide.areas;
  if (!Array.isArray(areas)) throw new Error(`${game.dataPath}: areas must be an array`);
  const areaById = new Map();
  const checklistIds = new Set();
  for (const area of areas) {
    if (!area.id || areaById.has(area.id)) throw new Error(`${game.id}: duplicate or empty area ID: ${area.id}`);
    areaById.set(area.id, area);
    if (!area.mapImage || !fs.existsSync(path.join(root, area.mapImage))) throw new Error(`${game.id}: missing map image for ${area.id}: ${area.mapImage}`);
    for (const row of [...(area.items ?? []), ...(area.specialPokemon ?? [])]) {
      if (!row.id || checklistIds.has(row.id)) throw new Error(`${game.id}: duplicate or empty checklist ID: ${row.id}`);
      checklistIds.add(row.id);
    }
    for (const row of [...(area.encounters ?? []), ...(area.specialPokemon ?? [])])
      if (row.version !== 'Both' && !versions.has(row.version)) throw new Error(`${game.id}: invalid version '${row.version}' in ${area.id}`);
    for (const encounter of area.encounters ?? [])
      if (typeof encounter.chance !== 'number' || !Number.isFinite(encounter.chance) || encounter.chance <= 0 || encounter.chance > 100)
        throw new Error(`${game.id}: invalid encounter chance '${encounter.chance}' in ${area.id}`);
    const methods = new Set((area.encounters ?? []).map(encounter => encounter.method).filter(method => !method.startsWith('Roaming')));
    for (const method of methods) for (const version of versions) {
      const rows = area.encounters.filter(encounter => encounter.method === method && (encounter.version === 'Both' || encounter.version === version));
      if (rows.length && Math.abs(rows.reduce((sum, encounter) => sum + encounter.chance, 0) - 100) > 1e-8)
        throw new Error(`${game.id}: ${area.id} ${method} encounter chances do not total 100 for ${version}`);
    }
  }
  for (const area of areas) for (const entrance of area.entrances ?? [])
    if (entrance.targetId && !areaById.has(entrance.targetId)) throw new Error(`${game.id}: ${area.id} targets missing area ${entrance.targetId}`);

  const worlds = documents.worlds;
  if (!Array.isArray(worlds) || !worlds.length) throw new Error(`${game.worldsPath}: at least one world is required`);
  const placed = new Set();
  for (const world of worlds) {
    if (!world.image || !fs.existsSync(path.join(root, world.image))) throw new Error(`${game.id}: missing world image: ${world.image}`);
    for (const placement of world.maps ?? []) {
      const areaId = normalizeAreaId(game.rules, placement.id);
      if (!areaById.has(areaId)) throw new Error(`${game.id}: world placement targets missing area ${areaId}`);
      placed.add(areaId);
    }
  }
  const adjacency = new Map(areas.map(area => [area.id, new Set()]));
  for (const area of areas) for (const entrance of area.entrances ?? []) if (entrance.targetId) {
    adjacency.get(area.id).add(entrance.targetId);
    adjacency.get(entrance.targetId).add(area.id);
  }
  const reachable = new Set(placed), queue = [...placed];
  while (queue.length) for (const target of adjacency.get(queue.shift()) ?? []) if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
  const unreachable = areas.filter(area => ((area.encounters?.length ?? 0) + (area.items?.length ?? 0) + (area.specialPokemon?.length ?? 0)) > 0 && !reachable.has(area.id));
  if (game.validateWorldReachability && unreachable.length) throw new Error(`${game.id}: relevant areas are unreachable: ${unreachable.map(area => area.id).join(', ')}`);

  const dex = documents.pokedex;
  if (!Array.isArray(dex)) throw new Error(`${game.pokedexPath}: Pokédex must be an array`);
  const dexSpecies = new Set();
  for (const entry of dex) {
    if (!entry.speciesId || dexSpecies.has(entry.speciesId)) throw new Error(`${game.id}: duplicate or empty Pokédex species ID: ${entry.speciesId}`);
    dexSpecies.add(entry.speciesId);
    for (const version of versions) if (!(version in (entry.availability ?? {}))) throw new Error(`${game.id}: ${entry.speciesId} lacks availability for ${version}`);
  }

  const expectedPokemon = new Set([path.join(root, game.pokemonSpritePath, 'question_mark.png')]);
  for (const entry of dex) if (!hasEmbeddedPokemonIcon(game.rules, entry.speciesId))
    expectedPokemon.add(path.join(root, game.pokemonSpritePath, pokemonSpriteName(game.rules, entry.speciesId)));
  const expectedItems = new Set([path.join(root, game.itemSpritePath, 'question_mark.png')]);
  for (const area of areas) for (const item of area.items ?? []) expectedItems.add(path.join(root, game.itemSpritePath, item.icon));
  const expectedMaps = new Set([
    ...areas.map(area => path.join(root, area.mapImage)),
    ...worlds.map(world => path.join(root, world.image))
  ]);
  for (const [kind, expected, actual] of [
    ['Pokémon sprite', expectedPokemon, pngFiles(path.join(root, game.pokemonSpritePath))],
    ['item sprite', expectedItems, pngFiles(path.join(root, game.itemSpritePath))],
    ['map', expectedMaps, [...new Set(worlds.flatMap(world => pngFiles(path.dirname(path.join(root, world.image)))))] ]
  ]) {
    for (const file of expected) if (!fs.existsSync(file)) throw new Error(`${game.id}: missing referenced ${kind}: ${path.relative(root, file)}`);
    const unused = actual.filter(file => !expected.has(file));
    if (unused.length) throw new Error(`${game.id}: unreferenced ${kind} assets: ${unused.map(file => path.relative(root, file)).join(', ')}`);
  }
}

console.log(`Validated generated JSON for ${catalog.games.length} packages.`);
