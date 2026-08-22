import fs from 'node:fs/promises';
import path from 'node:path';
import { validateJson } from '../package-schema/validate.mjs';
import { isAsset, isPackageFileName } from './assets.mjs';

const integerFields = {
  fieldguide: ['minLevel', 'maxLevel', 'level', 'x', 'y', 'quantity', 'mapWidth', 'mapHeight'],
  pokedex: ['number', 'regionalNumber'],
  worlds: ['width', 'height', 'x', 'y', 'markerOffsetX', 'markerOffsetY']
};

const walk = (value, visit) => {
  if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (value && typeof value === 'object') {
    visit(value);
    for (const child of Object.values(value)) walk(child, visit);
  }
};

const relevant = area => area.includeInNavigation === true
  || area.encounters.length + area.items.length + (area.resources?.length ?? 0)
    + area.specialPokemon.length + (area.transports?.length ?? 0) > 0;

const blank = value => typeof value !== 'string' || value.trim().length === 0;

function validateResourceRelationships(gameId, area, resource) {
  const x = resource.x * 16 + 8, y = resource.y * 16 + 8;
  if (Number.isInteger(resource.x) && Number.isInteger(resource.y)
    && (x < 0 || y < 0 || x >= area.mapWidth || y >= area.mapHeight))
    throw new Error(`${gameId}: ${area.id} map resource '${resource.name}' falls outside its area map.`);

  const rewards = resource.rewards ?? [];
  if (!Array.isArray(rewards)) return;
  const weighted = rewards.filter(reward => reward.weight !== undefined && reward.weight !== null).length;
  if (weighted > 0 && weighted < rewards.length)
    throw new Error(`${gameId}: ${area.id} map resource '${resource.name}' mixes weighted and conditional rewards.`);
  for (const reward of rewards) {
    if (rewards.length && weighted === 0 && blank(reward.comment))
      throw new Error(`${gameId}: ${area.id} map resource '${resource.name}' has a conditional reward without a comment.`);
  }
}

const projectResource = resource => ({
  name: resource.name,
  kind: resource.kind,
  x: resource.x,
  y: resource.y,
  ...(!Object.hasOwn(resource, 'comment') ? {} : { comment: resource.comment }),
  ...(!Object.hasOwn(resource, 'rewards') ? {} : {
    rewards: Array.isArray(resource.rewards) ? resource.rewards.map(reward => ({
      name: reward.name,
      quantity: reward.quantity,
      ...(!Object.hasOwn(reward, 'weight') ? {} : { weight: reward.weight }),
      ...(!Object.hasOwn(reward, 'comment') ? {} : { comment: reward.comment })
    })) : resource.rewards
  })
});

const assertAllAreasReachWorld = (game, areas, worlds, aliases, phase) => {
  const normalize = id => aliases?.[id] ?? id;
  const areasById = new Map(areas.map(area => [area.id, area]));
  const worldById = new Map(worlds.map(world => [world.id, world]));
  const worldsByArea = new Map();
  for (const world of worlds) for (const placement of world.maps ?? []) {
    const id = normalize(placement.id);
    if (!areasById.has(id)) throw new Error(`${game.id}: ${phase} world placement targets missing area ${id}.`);
    if (!worldsByArea.has(id)) worldsByArea.set(id, []);
    worldsByArea.get(id).push(world.id);
  }
  for (const area of areas) for (const entrance of area.entrances ?? []) if (entrance.targetId) {
    const targetId = normalize(entrance.targetId);
    if (!areasById.has(targetId)) throw new Error(`${game.id}: ${phase} entrance ${area.id} '${entrance.id}' targets missing area ${targetId}.`);
  }
  for (const area of areas) for (const transport of area.transports ?? []) for (const destination of transport.destinations ?? []) {
    const targetId = normalize(destination.targetId);
    if (!areasById.has(targetId)) throw new Error(`${game.id}: ${phase} transport ${area.id} '${transport.id}' targets missing area ${targetId}.`);
  }

  const reachable = new Set(), reachableWorlds = new Set(), queue = [];
  const enterWorld = worldId => {
    if (reachableWorlds.has(worldId)) return;
    const world = worldById.get(worldId);
    if (!world) throw new Error(`${game.id}: ${phase} navigation targets missing world ${worldId}.`);
    reachableWorlds.add(worldId);
    for (const placement of world.maps ?? []) enqueueArea(normalize(placement.id), false);
  };
  const enqueueArea = (id, activateWorld) => {
    if (!id || reachable.has(id)) return;
    reachable.add(id);
    queue.push(id);
    if (activateWorld) for (const worldId of worldsByArea.get(id) ?? []) enterWorld(worldId);
  };
  const visibleWorldIds = new Set([game.defaultWorldId, ...(game.regions ?? []).map(region => region.worldId)]);
  for (const worldId of visibleWorldIds) enterWorld(worldId);
  while (queue.length) {
    const area = areasById.get(queue.shift());
    for (const entrance of area.entrances ?? []) {
      const targetId = normalize(entrance.targetId);
      enqueueArea(targetId, false);
    }
    for (const transport of area.transports ?? []) for (const destination of transport.destinations ?? [])
      enqueueArea(normalize(destination.targetId), true);
  }
  const hidden = worlds.filter(world => !visibleWorldIds.has(world.id) && !reachableWorlds.has(world.id));
  if (hidden.length) throw new Error(`${game.id}: ${phase} hidden world ${hidden.map(world => world.id).sort().join(', ')} has no inbound transport path.`);
  const unreachable = areas.map(area => area.id).filter(id => !reachable.has(id)).sort();
  if (unreachable.length) throw new Error(`${game.id}: ${phase} areas are not reachable from a world warp or transport: ${unreachable.join(', ')}.`);
};

const assetFileName = (gameId, kind, fileName) => {
  if (!isPackageFileName(fileName))
    throw new Error(`${gameId}: invalid ${kind} asset filename '${fileName}'.`);
  return fileName;
};

const relativeInsidePackage = (game, configuredPath) => {
  const prefix = `games/${game.id}/`;
  if (typeof configuredPath !== 'string' || !configuredPath.startsWith(prefix) || configuredPath.includes('..'))
    throw new Error(`${game.id}: configured path must stay inside ${prefix}: ${configuredPath}`);
  return configuredPath.slice(prefix.length);
};

export function parseCatalog(raw) {
  if (!raw || !Array.isArray(raw.games) || raw.games.length === 0) throw new Error('Catalog must contain at least one game package.');
  const ids = new Set();
  for (const game of raw.games) {
    if (!game?.id || ids.has(game.id)) throw new Error(`Catalog contains duplicate or empty game ID '${game?.id ?? ''}'.`);
    ids.add(game.id);
    const versions = new Set((game.versions ?? []).map(version => version.id));
    if (!versions.size || versions.size !== game.versions.length) throw new Error(`${game.id}: version IDs must be present and unique.`);
    for (const field of ['dataPath', 'pokedexPath', 'worldsPath', 'pokemonSpritePath', 'itemSpritePath']) relativeInsidePackage(game, game[field]);
  }
  if (!ids.has(raw.defaultGameId)) throw new Error(`Catalog default game '${raw.defaultGameId}' is not registered.`);
  return raw;
}

const assetPath = (game, kind, asset) => {
  if (!isAsset(asset, kind)) throw new Error(`${game.id}: expected a registered ${kind} asset reference.`);
  const base = kind === 'map' ? `games/${game.id}/maps`
    : kind === 'pokemon' ? game.pokemonSpritePath : game.itemSpritePath;
  return `${base}/${asset.fileName}`;
};

const reachableFinalIds = (gameId, startId, areasById, finalIds, blockedIds) => {
  const targets = new Set(), visited = new Set(blockedIds), queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    if (!areasById.has(id)) throw new Error(`${gameId}: entrance contraction reached missing area ${id}.`);
    visited.add(id);
    if (finalIds.has(id)) {
      targets.add(id);
      continue;
    }
    for (const entrance of areasById.get(id).entrances) if (entrance.targetId) queue.push(entrance.targetId);
  }
  return targets;
};

const entranceJunction = (gameId, sourceArea, entrance, areasById, finalIds) => {
  if (entrance.targetId === null || entrance.targetId === '') return null;
  if (!areasById.has(entrance.targetId)) throw new Error(`${gameId}: ${sourceArea.id} entrance '${entrance.id}' targets missing area ${entrance.targetId}.`);
  let frontier = [entrance.targetId];
  const visited = new Set([sourceArea.id]);
  while (frontier.length) {
    const layer = [...new Set(frontier)].filter(id => !visited.has(id));
    for (const id of layer) if (!areasById.has(id)) throw new Error(`${gameId}: entrance contraction reached missing area ${id}.`);
    const candidates = [];
    for (const id of layer) {
      if (finalIds.has(id)) continue;
      const area = areasById.get(id);
      const branchTargets = [...new Set(area.entrances.map(exit => exit.targetId).filter(Boolean))]
        .map(targetId => reachableFinalIds(gameId, targetId, areasById, finalIds, new Set([sourceArea.id, id])))
        .filter(targets => targets.size > 0);
      const distinctTargets = new Set(branchTargets.flatMap(targets => [...targets]));
      if (branchTargets.length > 1 && distinctTargets.size > 1) candidates.push(area);
    }
    if (candidates.length > 1)
      throw new Error(`${gameId}: ambiguous entrance junction for ${sourceArea.id} '${entrance.id}': ${candidates.map(area => area.id).sort().join(', ')}.`);
    if (candidates.length === 1) return candidates[0];
    const next = [];
    for (const id of layer) {
      visited.add(id);
      if (finalIds.has(id)) continue;
      for (const exit of areasById.get(id).entrances) if (exit.targetId && !visited.has(exit.targetId)) next.push(exit.targetId);
    }
    frontier = next;
  }
  return null;
};

const nearestContractTargets = (gameId, sourceArea, entrance, areasById, finalIds) => {
  if (entrance.targetId === null || entrance.targetId === '') return [];
  if (!areasById.has(entrance.targetId)) throw new Error(`${gameId}: ${sourceArea.id} entrance '${entrance.id}' targets missing area ${entrance.targetId}.`);
  let frontier = [entrance.targetId];
  const visited = new Set([sourceArea.id]);
  while (frontier.length) {
    const layer = [...new Set(frontier)].filter(id => !visited.has(id));
    for (const id of layer) if (!areasById.has(id)) throw new Error(`${gameId}: entrance contraction reached missing area ${id}.`);
    const candidates = layer.filter(id => finalIds.has(id)).sort();
    if (candidates.length) return candidates.map(id => areasById.get(id));
    const next = [];
    for (const id of layer) {
      visited.add(id);
      const area = areasById.get(id);
      for (const exit of area.entrances) if (exit.targetId && !visited.has(exit.targetId)) next.push(exit.targetId);
    }
    frontier = next;
  }
  return [];
};

const contractTarget = (gameId, sourceArea, entrance, areasById, finalIds) => {
  const targets = nearestContractTargets(gameId, sourceArea, entrance, areasById, finalIds);
  if (targets.length > 1)
    throw new Error(`${gameId}: unresolved entrance junction for ${sourceArea.id} '${entrance.id}': ${targets.map(target => target.id).join(', ')}.`);
  return targets[0] ?? null;
};

const combineEncounters = encounters => {
  const combined = new Map();
  for (const encounter of encounters) {
    const key = [encounter.speciesId, encounter.method, encounter.condition ?? '', encounter.type, encounter.version, encounter.minLevel, encounter.maxLevel].join('|');
    if (combined.has(key)) combined.get(key).chance += encounter.chance;
    else combined.set(key, { ...encounter });
  }
  return [...combined.values()];
};

export function finalizeDraft(game, draft, formatVersion = 2) {
  if (!draft || !Array.isArray(draft.areas) || !Array.isArray(draft.worlds) || !Array.isArray(draft.pokedex))
    throw new Error(`${game.id}: game adapter returned an invalid package draft.`);
  const versions = new Set(game.versions.map(version => version.id));
  const areasById = new Map();
  for (const area of draft.areas) {
    if (!area?.id || areasById.has(area.id)) throw new Error(`${game.id}: duplicate or empty draft area ID '${area?.id ?? ''}'.`);
    areasById.set(area.id, area);
  }
  if (formatVersion !== 2 && formatVersion !== 3) throw new Error(`${game.id}: unsupported package manifest version ${formatVersion}.`);
  assertAllAreasReachWorld(game, draft.areas, draft.worlds, draft.areaAliases, 'draft');
  const normalizeAreaId = id => draft.areaAliases?.[id] ?? id;
  const outdoorIds = new Set(draft.worlds.flatMap(world => world.maps.map(placement => normalizeAreaId(placement.id))));
  for (const id of outdoorIds) if (!areasById.has(id)) throw new Error(`${game.id}: world placement targets missing draft area ${id}.`);
  const finalIds = new Set([...outdoorIds, ...draft.areas.filter(relevant).map(area => area.id)]);
  let retainedJunction = true;
  while (retainedJunction) {
    retainedJunction = false;
    for (const area of draft.areas) {
      if (!finalIds.has(area.id)) continue;
      for (const entrance of area.entrances) {
        const junction = entranceJunction(game.id, area, entrance, areasById, finalIds);
        if (junction && !finalIds.has(junction.id)) {
          finalIds.add(junction.id);
          retainedJunction = true;
        }
      }
    }
  }

  const areas = draft.areas.filter(area => finalIds.has(area.id)).map(area => ({
    id: area.id,
    name: area.name,
    region: area.region,
    encounters: combineEncounters(area.encounters).map(encounter => {
      if (encounter.version !== 'Both' && !versions.has(encounter.version)) throw new Error(`${game.id}: invalid version '${encounter.version}' in ${area.id}.`);
      return { ...encounter };
    }),
    items: area.items.map(item => {
      const version = item.version ?? 'Both';
      if (version !== 'Both' && !versions.has(version)) throw new Error(`${game.id}: invalid version '${version}' in ${area.id}.`);
      return {
        ...item,
        ...(formatVersion === 3 ? { version } : {}),
        icon: isAsset(item.icon, 'item') ? item.icon.fileName : item.icon
      };
    }),
    resources: (area.resources ?? []).map(resource => {
      validateResourceRelationships(game.id, area, resource);
      return projectResource(resource);
    }),
    specialPokemon: area.specialPokemon.map(mon => {
      if (mon.version !== 'Both' && !versions.has(mon.version)) throw new Error(`${game.id}: invalid version '${mon.version}' in ${area.id}.`);
      return { ...mon };
    }),
    ...(area.includeInNavigation === true ? { includeInNavigation: true } : {}),
    entrances: area.entrances.map(entrance => {
      const target = contractTarget(game.id, area, entrance, areasById, finalIds);
      return target ? { id: entrance.id, targetId: target.id, name: target.name, x: entrance.x, y: entrance.y } : null;
    }).filter(Boolean),
    ...(formatVersion === 3 ? {
      transports: (area.transports ?? []).map(transport => {
        if (!Array.isArray(transport.destinations) || transport.destinations.length === 0)
          throw new Error(`${game.id}: ${area.id} transport '${transport.id}' has no destinations.`);
        return {
          id: transport.id,
          name: transport.name,
          x: transport.x,
          y: transport.y,
          destinations: transport.destinations.map(destination => {
            const version = destination.version ?? 'Both';
            if (version !== 'Both' && !versions.has(version))
              throw new Error(`${game.id}: invalid transport version '${version}' in ${area.id}.`);
            const targetId = normalizeAreaId(destination.targetId);
            if (!finalIds.has(targetId))
              throw new Error(`${game.id}: ${area.id} transport '${transport.id}' targets unretained area ${targetId}.`);
            return {
              id: destination.id,
              targetId,
              name: destination.name,
              version,
              ...(!Object.hasOwn(destination, 'requirement') ? {} : { requirement: destination.requirement })
            };
          })
        };
      })
    } : {}),
    mapImage: assetPath(game, 'map', area.mapImage),
    mapWidth: area.mapWidth,
    mapHeight: area.mapHeight
  }));

  const worlds = draft.worlds.map(world => ({
    ...world,
    image: assetPath(game, 'map', world.image),
    maps: world.maps.map(placement => ({ ...placement }))
  }));

  const pokemonSprites = {};
  for (const entry of draft.pokedex) {
    const sprite = draft.pokemonSprites?.[entry.speciesId];
    if (sprite) {
      if (!isAsset(sprite, 'pokemon')) throw new Error(`${game.id}: invalid Pokémon sprite reference for ${entry.speciesId}.`);
      pokemonSprites[entry.speciesId] = sprite.fileName;
    } else throw new Error(`${game.id}: no Pokémon sprite is registered for ${entry.speciesId}.`);
  }
  const pokemonSpritesByVersion = {};
  for (const [version, sprites] of Object.entries(draft.pokemonSpritesByVersion ?? {})) {
    if (!versions.has(version)) throw new Error(`${game.id}: invalid Pokémon sprite version '${version}'.`);
    pokemonSpritesByVersion[version] = {};
    for (const [speciesId, sprite] of Object.entries(sprites)) {
      if (!(speciesId in pokemonSprites)) throw new Error(`${game.id}: ${version} Pokémon sprite references unknown species ${speciesId}.`);
      if (!isAsset(sprite, 'pokemon')) throw new Error(`${game.id}: invalid ${version} Pokémon sprite reference for ${speciesId}.`);
      pokemonSpritesByVersion[version][speciesId] = sprite.fileName;
    }
  }
  if (!isAsset(draft.pokemonFallback, 'pokemon') || draft.pokemonFallback.fileName !== 'question_mark.png')
    throw new Error(`${game.id}: Pokémon fallback question_mark.png is required.`);

  if (formatVersion === 2 && Object.keys(draft.areaMapsByVersion ?? {}).length)
    throw new Error(`${game.id}: version-specific area maps require package manifest v3.`);
  const areaMapsByVersion = {};
  for (const [version, areaMaps] of Object.entries(draft.areaMapsByVersion ?? {})) {
    if (!versions.has(version)) throw new Error(`${game.id}: invalid area map version '${version}'.`);
    areaMapsByVersion[version] = {};
    for (const [rawAreaId, descriptor] of Object.entries(areaMaps)) {
      const areaId = normalizeAreaId(rawAreaId);
      if (!finalIds.has(areaId)) throw new Error(`${game.id}: ${version} area map references unknown or unretained area ${areaId}.`);
      if (outdoorIds.has(areaId)) throw new Error(`${game.id}: ${version} area map override for outdoor area ${areaId} cannot change its connected-world image.`);
      if (!Number.isInteger(descriptor.width) || descriptor.width <= 0
        || !Number.isInteger(descriptor.height) || descriptor.height <= 0)
        throw new Error(`${game.id}: ${version} area map for ${areaId} has invalid dimensions.`);
      areaMapsByVersion[version][areaId] = {
        image: assetPath(game, 'map', descriptor.image),
        width: descriptor.width,
        height: descriptor.height
      };
    }
  }

  return {
    fieldGuide: { source: draft.source, generated: draft.generated, areas },
    pokedex: draft.pokedex.map(entry => ({ ...entry })),
    worlds,
    manifest: {
      formatVersion,
      pokemonSprites,
      ...(Object.keys(pokemonSpritesByVersion).length ? { pokemonSpritesByVersion } : {}),
      areaAliases: { ...(draft.areaAliases ?? {}) },
      ...(formatVersion === 3 ? { areaMapsByVersion } : {})
    }
  };
}

const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const pngFiles = async directory => (await fs.readdir(directory)).filter(file => file.endsWith('.png')).map(file => path.join(directory, file));

export async function checkPackage(game, packageRoot) {
  const dataFile = path.join(packageRoot, relativeInsidePackage(game, game.dataPath));
  const pokedexFile = path.join(packageRoot, relativeInsidePackage(game, game.pokedexPath));
  const worldsFile = path.join(packageRoot, relativeInsidePackage(game, game.worldsPath));
  const manifestFile = path.join(path.dirname(dataFile), 'package-manifest.json');
  const [fieldGuide, pokedex, worlds, manifest] = await Promise.all([json(dataFile), json(pokedexFile), json(worldsFile), json(manifestFile)]);
  validateJson('fieldguide.schema.json', fieldGuide, `${game.id} fieldguide.json`);
  validateJson('pokedex.schema.json', pokedex, `${game.id} pokedex.json`);
  validateJson('worlds.schema.json', worlds, `${game.id} worlds.json`);
  const manifestSchema = manifest.formatVersion === 2 ? 'package-manifest-v2.schema.json'
    : manifest.formatVersion === 3 ? 'package-manifest-v3.schema.json' : null;
  if (!manifestSchema) throw new Error(`${game.id}: unsupported package manifest version ${manifest.formatVersion}.`);
  validateJson(manifestSchema, manifest, `${game.id} package-manifest.json`);
  if (!Array.isArray(fieldGuide.areas)) throw new Error(`${game.id}: field guide areas must be an array.`);
  if (!Array.isArray(pokedex)) throw new Error(`${game.id}: Pokédex must be an array.`);
  if (!Array.isArray(worlds) || worlds.length === 0) throw new Error(`${game.id}: at least one world is required.`);

  for (const [kind, value] of [['fieldguide', fieldGuide], ['pokedex', pokedex], ['worlds', worlds]]) walk(value, object => {
    for (const field of integerFields[kind]) if (field in object && object[field] !== null && !Number.isInteger(object[field]))
      throw new Error(`${game.id}: ${field} must be an integer, received ${object[field]}.`);
  });

  const versions = new Set(game.versions.map(version => version.id));
  const areaById = new Map();
  const checklistIds = new Set();
  for (const area of fieldGuide.areas ?? []) {
    if (!area.id || areaById.has(area.id)) throw new Error(`${game.id}: duplicate or empty area ID '${area.id}'.`);
    areaById.set(area.id, area);
    if (!area.mapImage) throw new Error(`${game.id}: ${area.id} has no map image.`);
    for (const row of [...(area.items ?? []), ...(area.specialPokemon ?? [])]) {
      if (!row.id || checklistIds.has(row.id)) throw new Error(`${game.id}: duplicate or empty checklist ID '${row.id}'.`);
      checklistIds.add(row.id);
    }
    for (const resource of area.resources ?? []) {
      validateResourceRelationships(game.id, area, resource);
    }
    for (const row of [...(area.encounters ?? []), ...(area.items ?? []), ...(area.specialPokemon ?? [])]) {
      const version = row.version ?? 'Both';
      if (version !== 'Both' && !versions.has(version)) throw new Error(`${game.id}: invalid version '${version}' in ${area.id}.`);
    }
    const transportIds = new Set(), destinationIds = new Set();
    for (const transport of area.transports ?? []) {
      if (!transport.id || transportIds.has(transport.id)) throw new Error(`${game.id}: duplicate or empty transport ID '${transport.id}' in ${area.id}.`);
      transportIds.add(transport.id);
      const markerX = transport.x * 16 + 8, markerY = transport.y * 16 + 8;
      if (markerX < 0 || markerY < 0 || markerX >= area.mapWidth || markerY >= area.mapHeight)
        throw new Error(`${game.id}: ${area.id} transport '${transport.id}' falls outside its area map.`);
      if (!transport.destinations?.length) throw new Error(`${game.id}: ${area.id} transport '${transport.id}' has no destinations.`);
      for (const destination of transport.destinations) {
        const destinationKey = `${transport.id}\0${destination.id}`;
        if (!destination.id || destinationIds.has(destinationKey))
          throw new Error(`${game.id}: duplicate or empty transport destination ID '${destination.id}' in ${area.id}.`);
        destinationIds.add(destinationKey);
        if (destination.version !== 'Both' && !versions.has(destination.version))
          throw new Error(`${game.id}: invalid transport version '${destination.version}' in ${area.id}.`);
      }
    }
    for (const encounter of area.encounters ?? [])
      if (typeof encounter.chance !== 'number' || !Number.isFinite(encounter.chance) || encounter.chance <= 0 || encounter.chance > 100)
        throw new Error(`${game.id}: invalid encounter chance '${encounter.chance}' in ${area.id}.`);
    const tables = new Map((area.encounters ?? []).filter(encounter => encounter.type !== 'Roaming')
      .map(encounter => [`${encounter.type}\0${encounter.condition ?? ''}`, { type: encounter.type, condition: encounter.condition ?? null }]));
    for (const { type, condition } of tables.values()) for (const version of versions) {
      const rows = area.encounters.filter(encounter => encounter.type === type && (encounter.condition ?? null) === condition
        && (encounter.version === 'Both' || encounter.version === version));
      if (rows.length && Math.abs(rows.reduce((sum, encounter) => sum + encounter.chance, 0) - 100) > 1e-8)
        throw new Error(`${game.id}: ${area.id} ${type}${condition ? ` (${condition})` : ''} encounter chances do not total 100 for ${version}.`);
    }
  }
  for (const area of areaById.values()) {
    for (const entrance of area.entrances ?? [])
      if (entrance.targetId && !areaById.has(entrance.targetId)) throw new Error(`${game.id}: ${area.id} targets missing area ${entrance.targetId}.`);
    for (const transport of area.transports ?? []) for (const destination of transport.destinations)
      if (!areaById.has(manifest.areaAliases?.[destination.targetId] ?? destination.targetId))
        throw new Error(`${game.id}: ${area.id} transport '${transport.id}' targets missing area ${destination.targetId}.`);
  }

  const worldById = new Map();
  const placed = new Set();
  const placements = [];
  for (const world of worlds) {
    if (!world.id || worldById.has(world.id)) throw new Error(`${game.id}: duplicate or empty world ID '${world.id}'.`);
    worldById.set(world.id, world);
    for (const placement of world.maps ?? []) {
      const areaId = manifest.areaAliases?.[placement.id] ?? placement.id;
      if (!areaById.has(areaId)) throw new Error(`${game.id}: world placement targets missing area ${areaId}.`);
      const area = areaById.get(areaId);
      const hasMarkerOffsets = Object.hasOwn(placement, 'markerOffsetX') && Object.hasOwn(placement, 'markerOffsetY');
      if ((area.mapWidth !== placement.width || area.mapHeight !== placement.height) && !hasMarkerOffsets)
        throw new Error(`${game.id}: cropped placement ${placement.id} requires marker offsets.`);
      const markerOffsetX = placement.markerOffsetX ?? 0, markerOffsetY = placement.markerOffsetY ?? 0;
      if (markerOffsetX < 0 || markerOffsetY < 0
        || markerOffsetX * 16 + placement.width > area.mapWidth
        || markerOffsetY * 16 + placement.height > area.mapHeight)
        throw new Error(`${game.id}: marker offsets place ${placement.id} outside its area map.`);
      placed.add(areaId);
      placements.push({ area, placement, markerOffsetX, markerOffsetY });
    }
  }
  for (const { area, placement, markerOffsetX, markerOffsetY } of placements) {
    const markers = [
      ...(area.items ?? []).filter(item => item.x >= 0 && item.y >= 0),
      ...(area.resources ?? []),
      ...(area.transports ?? []),
      ...(area.entrances ?? []).filter(entrance => !placed.has(manifest.areaAliases?.[entrance.targetId] ?? entrance.targetId))
    ];
    for (const marker of markers) {
      const x = (marker.x - markerOffsetX) * 16 + 8, y = (marker.y - markerOffsetY) * 16 + 8;
      if (x < 0 || y < 0 || x >= placement.width || y >= placement.height)
        throw new Error(`${game.id}: visible marker ${marker.id} falls outside ${placement.id} placement.`);
    }
  }
  const declaredAreaMaps = [];
  for (const [version, areaMaps] of Object.entries(manifest.areaMapsByVersion ?? {})) {
    if (!versions.has(version)) throw new Error(`${game.id}: manifest contains unknown area map version '${version}'.`);
    for (const [rawAreaId, descriptor] of Object.entries(areaMaps)) {
      const areaId = manifest.areaAliases?.[rawAreaId] ?? rawAreaId;
      const area = areaById.get(areaId);
      if (!area) throw new Error(`${game.id}: ${version} area map references missing area ${areaId}.`);
      if (placed.has(areaId)) throw new Error(`${game.id}: ${version} area map override for outdoor area ${areaId} cannot change its connected-world image.`);
      relativeInsidePackage(game, descriptor.image);
      const markers = [
        ...(area.items ?? []).filter(item => item.x >= 0 && item.y >= 0
          && ((item.version ?? 'Both') === 'Both' || item.version === version)),
        ...(area.resources ?? []),
        ...(area.entrances ?? []),
        ...(area.transports ?? []).filter(transport => transport.destinations.some(destination => destination.version === 'Both' || destination.version === version))
      ];
      for (const marker of markers) {
        const x = marker.x * 16 + 8, y = marker.y * 16 + 8;
        if (x < 0 || y < 0 || x >= descriptor.width || y >= descriptor.height)
          throw new Error(`${game.id}: ${version} marker ${marker.id} falls outside ${areaId} area map override.`);
      }
      declaredAreaMaps.push(descriptor.image);
    }
  }
  if (!areaById.has(game.defaultAreaId)) throw new Error(`${game.id}: default area '${game.defaultAreaId}' does not exist.`);
  if (!worldById.has(game.defaultWorldId)) throw new Error(`${game.id}: default world '${game.defaultWorldId}' does not exist.`);
  for (const region of game.regions ?? []) if (!worldById.has(region.worldId)) throw new Error(`${game.id}: region '${region.id}' targets missing world ${region.worldId}.`);

  assertAllAreasReachWorld(game, [...areaById.values()], worlds, manifest.areaAliases, 'final');

  const normalizeAreaId = id => manifest.areaAliases?.[id] ?? id;
  const resolveRelevantTarget = (sourceId, targetId) => {
    const pending = targetId ? [targetId] : [], visited = new Set([sourceId]);
    while (pending.length) {
      const id = pending.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const normalizedId = normalizeAreaId(id), area = areaById.get(normalizedId);
      if (!area || placed.has(normalizedId)) continue;
      if (relevant(area)) return area;
      for (const entrance of area.entrances ?? []) if (!visited.has(entrance.targetId)) pending.push(entrance.targetId);
    }
    return null;
  };
  const navigableInteriors = new Set();
  const addInteriorComponent = targetId => {
    const pending = [targetId], visited = new Set();
    while (pending.length) {
      const id = pending.shift(), normalizedId = normalizeAreaId(id);
      if (visited.has(normalizedId) || placed.has(normalizedId)) continue;
      visited.add(normalizedId);
      const area = areaById.get(normalizedId);
      if (!area) continue;
      if (relevant(area)) navigableInteriors.add(area.id);
      for (const exit of area.entrances ?? []) if (exit.targetId && !visited.has(normalizeAreaId(exit.targetId))) pending.push(exit.targetId);
    }
  };
  for (const outdoorId of placed) for (const entrance of areaById.get(outdoorId)?.entrances ?? []) {
    const target = resolveRelevantTarget(outdoorId, entrance.targetId);
    if (target) addInteriorComponent(target.id);
  }
  for (const area of areaById.values()) for (const transport of area.transports ?? [])
    for (const destination of transport.destinations) if (!placed.has(normalizeAreaId(destination.targetId)))
      addInteriorComponent(destination.targetId);
  const unnavigable = [...areaById.values()].filter(area => relevant(area) && !placed.has(area.id) && !navigableInteriors.has(area.id));
  if (unnavigable.length)
    throw new Error(`${game.id}: relevant interior areas are not navigable from world markers: ${unnavigable.map(area => area.id).join(', ')}.`);

  const dexSpecies = new Set();
  const declaredPokemonSprites = Object.fromEntries(Object.entries(manifest.pokemonSprites ?? {})
    .map(([speciesId, fileName]) => [speciesId, assetFileName(game.id, 'Pokémon sprite', fileName)]));
  const declaredVersionSprites = {};
  for (const [version, sprites] of Object.entries(manifest.pokemonSpritesByVersion ?? {})) {
    if (!versions.has(version)) throw new Error(`${game.id}: manifest contains unknown Pokémon sprite version '${version}'.`);
    declaredVersionSprites[version] = Object.fromEntries(Object.entries(sprites)
      .map(([speciesId, fileName]) => [speciesId, assetFileName(game.id, `${version} Pokémon sprite`, fileName)]));
  }
  for (const entry of pokedex) {
    if (!entry.speciesId || dexSpecies.has(entry.speciesId)) throw new Error(`${game.id}: duplicate or empty Pokédex species ID '${entry.speciesId}'.`);
    dexSpecies.add(entry.speciesId);
    for (const version of versions) if (!(version in (entry.availability ?? {}))) throw new Error(`${game.id}: ${entry.speciesId} lacks availability for ${version}.`);
    if (!(entry.speciesId in declaredPokemonSprites))
      throw new Error(`${game.id}: ${entry.speciesId} lacks a Pokémon sprite declaration.`);
  }

  const expectedMaps = new Set([
    ...[...areaById.values()].filter(area => area.mapImage).map(area => path.join(packageRoot, relativeInsidePackage(game, area.mapImage))),
    ...worlds.map(world => path.join(packageRoot, relativeInsidePackage(game, world.image))),
    ...declaredAreaMaps.map(image => path.join(packageRoot, relativeInsidePackage(game, image)))
  ]);
  const pokemonDirectory = path.join(packageRoot, relativeInsidePackage(game, game.pokemonSpritePath));
  const itemDirectory = path.join(packageRoot, relativeInsidePackage(game, game.itemSpritePath));
  const mapDirectories = new Set([...expectedMaps].map(file => path.dirname(file)));
  const expectedPokemon = new Set([
    path.join(pokemonDirectory, 'question_mark.png'),
    ...Object.values(declaredPokemonSprites).map(file => path.join(pokemonDirectory, file)),
    ...Object.values(declaredVersionSprites).flatMap(sprites => Object.values(sprites)).map(file => path.join(pokemonDirectory, file))
  ]);
  const expectedItems = new Set([path.join(itemDirectory, 'question_mark.png'), ...[...areaById.values()].flatMap(area => area.items ?? [])
    .map(item => path.join(itemDirectory, assetFileName(game.id, 'item sprite', item.icon)))]);
  for (const [kind, expected, actual] of [
    ['map', expectedMaps, (await Promise.all([...mapDirectories].map(pngFiles))).flat()],
    ['Pokémon sprite', expectedPokemon, await pngFiles(pokemonDirectory)],
    ['item sprite', expectedItems, await pngFiles(itemDirectory)]
  ]) {
    for (const file of expected) if (!(await fs.stat(file).catch(() => null))?.isFile()) throw new Error(`${game.id}: missing referenced ${kind}: ${path.relative(packageRoot, file)}.`);
    const unused = actual.filter(file => !expected.has(file));
    if (unused.length) throw new Error(`${game.id}: unreferenced ${kind} assets: ${unused.map(file => path.relative(packageRoot, file)).join(', ')}.`);
  }

  return {
    gameId: game.id,
    gameName: game.name,
    areaCount: areaById.size,
    encounterCount: [...areaById.values()].reduce((sum, area) => sum + area.encounters.length, 0),
    itemCount: [...areaById.values()].reduce((sum, area) => sum + area.items.length, 0),
    specialPokemonCount: [...areaById.values()].reduce((sum, area) => sum + area.specialPokemon.length, 0)
  };
}

export const packageRelativePaths = game => ({
  fieldGuide: relativeInsidePackage(game, game.dataPath),
  pokedex: relativeInsidePackage(game, game.pokedexPath),
  worlds: relativeInsidePackage(game, game.worldsPath),
  manifest: path.posix.join(path.posix.dirname(relativeInsidePackage(game, game.dataPath)), 'package-manifest.json'),
  mapDirectory: 'maps',
  pokemonDirectory: relativeInsidePackage(game, game.pokemonSpritePath),
  itemDirectory: relativeInsidePackage(game, game.itemSpritePath)
});
