import fs from 'node:fs';
import path from 'node:path';

import { displayName } from './display-names.mjs';
import { gen3ItemName } from './technical-machines.mjs';

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
        name: gen3ItemName(work, match[1]), kind: 'Event', version: version.id, icon: 'question_mark.png', sourceItemId: match[1],
        x: -1, y: -1, quantity: Number(match[2] ?? 1)
      });
    }
    area.specialPokemon.push(...mergeRows(specials, work.versions,
      row => [row.speciesId, row.level, row.kind].join('|')));
    area.items.push(...mergeRows(items, work.versions,
      row => [row.name, row.quantity, row.kind].join('|')));
    area.specialPokemon = area.specialPokemon.map((row, index) => ({
      ...row,
      id: row.id ?? `${area.id}:${row.kind}:${row.speciesId}:${row.version}:${index}`
    }));
    area.items = [...new Map(area.items.map((row, index) => {
      const key = [row.kind, row.name, row.x, row.y, row.version].join('|');
      return [key, { ...row, id: row.id ?? `${area.id}:${row.kind.toLowerCase()}:${row.name.replaceAll(' ', '_')}:${row.version}:${index}` }];
    })).values()];
  }
}

const scriptBlock = (text, label) => {
  const match = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}::[^\\n]*\\n([\\s\\S]*?)(?=^[A-Za-z0-9_]+::|^__END__::)`, 'm')
    .exec(`${text}\n__END__::\n`);
  return match?.[1] ?? null;
};

export function addDeclaredStaticPokemon(work, declaration) {
  const area = work.areas.get(declaration.areaId), sourceMap = work.sourceMaps.get(declaration.areaId);
  if (!area || !sourceMap) throw new Error(`Declared static Pokémon targets missing area ${declaration.areaId}.`);
  const sourceEvent = (sourceMap.object_events ?? []).find(event => event.script === declaration.objectScriptLabel);
  if (!sourceEvent) throw new Error(`${declaration.areaId} lacks object script ${declaration.objectScriptLabel}.`);
  const sourceText = fs.readFileSync(path.join(work.source, declaration.sourceFile), 'utf8');
  if (!scriptBlock(sourceText, declaration.objectScriptLabel))
    throw new Error(`${declaration.sourceFile} lacks ${declaration.objectScriptLabel}.`);
  const battleLabel = declaration.battleScriptLabel ?? declaration.objectScriptLabel;
  const battle = scriptBlock(sourceText, battleLabel);
  const command = battle?.match(/\bsetwildbattle\s+(SPECIES_[A-Z0-9_]+),\s*(\d+)/);
  if (!command || command[1] !== declaration.speciesId || Number(command[2]) !== declaration.level)
    throw new Error(`${declaration.sourceFile} ${battleLabel} does not declare ${declaration.speciesId} at level ${declaration.level}.`);
  const version = declaration.version ?? 'Both';
  area.specialPokemon.push({
    id: `${area.id}:Static:${declaration.speciesId}:${version}:${declaration.objectScriptLabel}`,
    species: displayName(declaration.speciesId), speciesId: declaration.speciesId,
    level: declaration.level, kind: 'Static', version, requestedSpecies: null
  });
}

export function addSpecial(area, speciesId, level, kind = 'Gift', version = 'Both', requestedSpecies = null) {
  area.specialPokemon.push({
    id: `${area.id}:${kind}:${speciesId}:${version}`,
    species: displayName(speciesId), speciesId, level, kind, version, requestedSpecies
  });
}
