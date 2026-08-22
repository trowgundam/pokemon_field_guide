import fs from 'node:fs';
import path from 'node:path';

import { displayName } from './display-names.mjs';

const tmCount = 50;

const emeraldMoves = source => {
  const file = path.join(source, 'include/constants/tms_hms.h');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('#define FOREACH_TM(F)');
  const end = text.indexOf('\n\n', start);
  if (start < 0 || end < 0) throw new Error('Gen 3 TM audit could not isolate FOREACH_TM.');
  return [...text.slice(start, end).matchAll(/F\(([A-Z0-9_]+)\)/g)].map(match => match[1]);
};

const rubySapphireMoves = source => {
  const text = fs.readFileSync(path.join(source, 'src/party_menu.c'), 'utf8');
  const start = text.indexOf('const u16 TMHMMoves[]');
  const end = text.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('Gen 3 TM audit could not isolate TMHMMoves.');
  return [...text.slice(start, end).matchAll(/\bMOVE_([A-Z0-9_]+)/g)]
    .slice(0, tmCount).map(match => match[1]);
};

export function readTechnicalMachines(source) {
  const moves = emeraldMoves(source) ?? rubySapphireMoves(source);
  if (moves.length !== tmCount)
    throw new Error(`Gen 3 TM audit found ${moves.length}; expected ${tmCount}.`);

  const itemText = fs.readFileSync(path.join(source, 'include/constants/items.h'), 'utf8');
  const sourceIds = new Map([...itemText.matchAll(/^#define\s+(ITEM_TM(\d{2})(?:_[A-Z0-9_]+)?)\s+/gm)]
    .map(match => [Number(match[2]), match[1]]));
  if (sourceIds.size !== tmCount)
    throw new Error(`Gen 3 TM item audit found ${sourceIds.size}; expected ${tmCount}.`);

  const technicalMachines = new Map();
  moves.forEach((move, index) => {
    const number = index + 1;
    const suffix = String(number).padStart(2, '0');
    const numberedId = `ITEM_TM${suffix}`;
    const entry = {
      numberedId,
      name: `TM${suffix} - ${displayName(`ITEM_${move}`)}`
    };
    for (const id of [numberedId, `ITEM_TM_${move}`, `ITEM_TM${suffix}_${move}`, sourceIds.get(number)])
      technicalMachines.set(id, entry);
  });
  return technicalMachines;
}

export function readMachineItemIds(source, technicalMachines) {
  const itemIds = new Map([...technicalMachines].map(([id, entry]) => [id, entry.numberedId]));
  const file = path.join(source, 'include/constants/tms_hms.h');
  if (!fs.existsSync(file)) return itemIds;
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('#define FOREACH_HM(F)');
  const end = text.indexOf('\n\n', start);
  if (start < 0 || end < 0) throw new Error('Gen 3 HM audit could not isolate FOREACH_HM.');
  const moves = [...text.slice(start, end).matchAll(/F\(([A-Z0-9_]+)\)/g)].map(match => match[1]);
  if (moves.length !== 8) throw new Error(`Gen 3 HM audit found ${moves.length}; expected 8.`);
  moves.forEach((move, index) => itemIds.set(`ITEM_HM_${move}`, `ITEM_HM${String(index + 1).padStart(2, '0')}`));
  return itemIds;
}

export const gen3ItemName = (work, itemId) =>
  work.technicalMachines.get(itemId)?.name ?? displayName(itemId);
