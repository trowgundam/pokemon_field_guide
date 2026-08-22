import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('PokemonFieldGuide/wwwroot/games/yellow/data');
const fieldguide = JSON.parse(fs.readFileSync(path.join(root, 'fieldguide.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package-manifest.json')));

test('Yellow uses the current package format and standardized TM names', () => {
  assert.equal(manifest.formatVersion, 3);
  const tms = fieldguide.areas.flatMap(area => area.items).filter(item => item.name.startsWith('TM'));
  assert(tms.length > 0);
  for (const item of tms) assert.match(item.name, /^TM\d{2} - .+$/);
  assert(tms.some(item => item.name === 'TM24 - Thunderbolt'));
});
