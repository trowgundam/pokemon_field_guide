const fishingTypes = new Set(['OldRod', 'GoodRod', 'SuperRod']);

function sourceLandTable(area, version) {
  const rows = area.encounters.filter(row => row.type === 'Random'
    && row.method === 'Grass / cave'
    && row.condition == null
    && (row.version === 'Both' || row.version === version));
  if (rows.length !== 12) throw new Error(`${area.id} has ${rows.length} source land slots for ${version}; expected 12.`);
  return rows;
}

export function addFeebasFishing(area, versions, speciesName, minLevel = 10, maxLevel = 20) {
  if (!area) throw new Error('The Feebas encounter area is missing.');
  for (const version of versions) {
    const fishing = area.encounters.filter(row => fishingTypes.has(row.type)
      && row.condition == null
      && (row.version === 'Both' || row.version === version));
    const groups = new Map(fishing.map(row => [`${row.type}|${row.method}`, row]));
    if (groups.size !== 3) throw new Error(`${area.id} does not expose all three fishing tables for ${version}.`);
    area.encounters.push(...fishing.map(row => ({
      ...row,
      chance: row.chance / 2,
      condition: 'Four daily save-dependent Feebas tiles',
      version
    })));
    for (const row of groups.values()) area.encounters.push({
      species: speciesName('SPECIES_FEEBAS'), speciesId: 'SPECIES_FEEBAS',
      minLevel, maxLevel, chance: 50, method: row.method,
      condition: 'Four daily save-dependent Feebas tiles', type: row.type, version
    });
  }
}

export function addDailyLandPool(area, versions, pool, speciesName, method, condition) {
  if (!area) throw new Error(`${method} encounter area is missing.`);
  if (pool.length === 0) throw new Error(`${method} source pool is empty.`);
  const weights = new Map();
  for (const speciesId of pool) weights.set(speciesId, (weights.get(speciesId) ?? 0) + 10 / pool.length);
  for (const version of versions) {
    const base = sourceLandTable(area, version);
    area.encounters.push(...base.filter((_, index) => index !== 6 && index !== 7)
      .map(row => ({ ...row, condition, version })));
    for (const [speciesId, chance] of weights) area.encounters.push({
      species: speciesName(speciesId), speciesId,
      minLevel: base[6].minLevel, maxLevel: base[7].maxLevel,
      chance, method, condition, type: 'Random', version
    });
  }
}
