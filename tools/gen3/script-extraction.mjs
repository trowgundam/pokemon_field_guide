import { displayName } from './display-names.mjs';

export function preprocessRubySapphire(text, sapphire) {
  const output = [], stack = [];
  let active = true;
  for (const line of text.split(/\r?\n/)) {
    const directive = line.match(/^\s*\.if(n?)def\s+SAPPHIRE/);
    if (directive) {
      const matches = directive[1] ? !sapphire : sapphire;
      stack.push({ parent: active, matched: matches }); active = active && matches; continue;
    }
    if (/^\s*\.else\b/.test(line) && stack.length) {
      const frame = stack.at(-1); active = frame.parent && !frame.matched; frame.matched = true; continue;
    }
    if (/^\s*\.endif\b/.test(line) && stack.length) { active = stack.pop().parent; continue; }
    if (active) output.push(line);
  }
  return output.join('\n');
}

const mergeRows = (rows, versions, identity) => {
  if (versions.length !== 2) return rows;
  const [first, second] = versions.map(version => version.id), secondRows = rows.filter(row => row.version === second);
  const used = new Set(), output = [];
  for (const row of rows.filter(candidate => candidate.version === first)) {
    const match = secondRows.findIndex((candidate, index) => !used.has(index) && identity(candidate) === identity(row));
    if (match >= 0) { used.add(match); output.push({ ...row, version: 'Both' }); } else output.push(row);
  }
  secondRows.forEach((row, index) => { if (!used.has(index)) output.push(row); });
  return output;
};

export function extractScriptAcquisitions(work, { rubySapphire = false } = {}) {
  for (const area of work.areas.values()) {
    const versions = work.versions.map(version => ({
      id: version.id,
      text: rubySapphire ? preprocessRubySapphire(area.scripts, version.id === 'Sapphire') : area.scripts
    }));
    const specials = [], items = [];
    for (const version of versions) {
      for (const match of version.text.matchAll(/\b(givemon|setwildbattle|seteventmon)\s+(SPECIES_[A-Z0-9_]+),\s*(\d+)/g)) {
        specials.push({
          species: displayName(match[2]), speciesId: match[2], level: Number(match[3]),
          kind: match[1] === 'givemon' ? 'Gift' : 'Static', version: version.id,
          requestedSpecies: null
        });
      }
      for (const match of version.text.matchAll(/\bgiveegg\s+(SPECIES_[A-Z0-9_]+)/g)) specials.push({
        species: displayName(match[1]), speciesId: match[1], level: 5, kind: 'Egg', version: version.id,
        requestedSpecies: null
      });
      for (const match of version.text.matchAll(/\b(?:giveitem|additem)\s+(ITEM_[A-Z0-9_]+)(?:,\s*(\d+))?/g)) items.push({
        name: displayName(match[1]), kind: 'Event', version: version.id, icon: 'question_mark.png',
        x: -1, y: -1, quantity: Number(match[2] ?? 1)
      });
    }
    area.specialPokemon.push(...mergeRows(specials, work.versions,
      row => [row.speciesId, row.level, row.kind].join('|')));
    area.items.push(...mergeRows(items, work.versions,
      row => [row.name, row.quantity, row.kind].join('|')));
    area.specialPokemon = [...new Map(area.specialPokemon.map((row, index) => {
      const key = [row.kind, row.speciesId, row.level, row.version].join('|');
      return [key, { ...row, id: `${area.id}:${row.kind}:${row.speciesId}:${row.version}:${index}` }];
    })).values()];
    area.items = [...new Map(area.items.map((row, index) => {
      const key = [row.kind, row.name, row.x, row.y, row.version].join('|');
      return [key, { ...row, id: row.id ?? `${area.id}:${row.kind.toLowerCase()}:${row.name.replaceAll(' ', '_')}:${row.version}:${index}` }];
    })).values()];
  }
}

export function addSpecial(area, speciesId, level, kind = 'Gift', version = 'Both', requestedSpecies = null) {
  area.specialPokemon.push({
    id: `${area.id}:${kind}:${speciesId}:${version}`,
    species: displayName(speciesId), speciesId, level, kind, version, requestedSpecies
  });
}
