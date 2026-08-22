export function readRgbdsTechnicalMachines(itemConstants, displayName) {
  const moves = [...itemConstants.matchAll(/^\s*add_tm\s+([A-Z0-9_]+)/gm)].map(match => match[1]);
  if (moves.length !== 50)
    throw new Error(`TM source audit failed: expected 50 moves, found ${moves.length}.`);
  return new Map(moves.map((move, index) => [
    `TM_${move}`,
    `TM${String(index + 1).padStart(2, '0')} - ${move === 'PSYCHIC_M' ? 'Psychic' : displayName(move)}`
  ]));
}
