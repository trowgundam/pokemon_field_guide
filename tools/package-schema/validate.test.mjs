import assert from 'node:assert/strict';
import test from 'node:test';
import { validateJson } from './validate.mjs';

const encounter = {
  species: 'Pikachu', speciesId: 'SPECIES_PIKACHU', minLevel: 3, maxLevel: 5,
  chance: 100, method: 'Grass / cave', type: 'Random', version: 'Both'
};
const fieldGuide = {
  source: 'fixture', generated: '2026-08-21',
  areas: [{
    id: 'AREA', name: 'Area', region: 'Test', encounters: [encounter], items: [],
    specialPokemon: [], entrances: [], mapImage: null, mapWidth: 16, mapHeight: 16
  }]
};

test('accepts a normalized encounter type', () => {
  assert.doesNotThrow(() => validateJson('fieldguide.schema.json', fieldGuide, 'fixture fieldguide.json'));
});

test('rejects a missing encounter type', () => {
  const invalid = structuredClone(fieldGuide);
  delete invalid.areas[0].encounters[0].type;
  assert.throws(() => validateJson('fieldguide.schema.json', invalid, 'fixture fieldguide.json'), /required property 'type'/);
});

test('rejects an unknown encounter type', () => {
  const invalid = structuredClone(fieldGuide);
  invalid.areas[0].encounters[0].type = 'Unknown';
  assert.throws(() => validateJson('fieldguide.schema.json', invalid, 'fixture fieldguide.json'), /allowed values|enum/);
});

test('rejects invalid resource and reward scalars', () => {
  const invalid = structuredClone(fieldGuide);
  invalid.areas[0].resources = [{
    name: '', kind: 'Repeatable prize', x: 0, y: 0,
    rewards: [{ name: 'Potion', quantity: 0, weight: 0 }]
  }];
  assert.throws(() => validateJson('fieldguide.schema.json', invalid, 'fixture fieldguide.json'), /minLength|must NOT have fewer|minimum/);
});

test('rejects manifest v1 and removed properties', () => {
  const manifest = { formatVersion: 1, pokemonSprites: {}, areaAliases: {}, embeddedPokemon: [] };
  assert.throws(() => validateJson('package-manifest-v2.schema.json', manifest, 'fixture package-manifest.json'), /formatVersion|embeddedPokemon/);
});

const profileV1 = { caught: ['SPECIES_PIKACHU'], collected: [], completedSpecial: ['gift:pikachu'] };
const profileV2 = {
  caught: ['SPECIES_PIKACHU'], collected: [],
  completedSpecial: [{ id: 'gift:pikachu', speciesId: 'SPECIES_PIKACHU' }]
};

test('accepts every versioned state document', () => {
  const localState = {
    formatVersion: 1,
    profiles: { 'test:Red': profileV2 },
    profileVersions: { 'test:Red': 2 }
  };
  const backupV1 = {
    format: 'pokemon-field-guide-backup', formatVersion: 1,
    games: { test: { profiles: { Red: profileV1 }, profileVersions: { Red: 1 } } }
  };
  const backupV2 = {
    format: 'pokemon-field-guide-backup', formatVersion: 2,
    games: { test: { profiles: { Red: profileV2 }, profileVersions: { Red: 2 } } }
  };

  assert.doesNotThrow(() => validateJson('checklist-profile-v1.schema.json', profileV1, 'fixture profile v1.json'));
  assert.doesNotThrow(() => validateJson('checklist-profile-v2.schema.json', profileV2, 'fixture profile v2.json'));
  assert.doesNotThrow(() => validateJson('local-guide-state-v1.schema.json', localState, 'fixture local state.json'));
  assert.doesNotThrow(() => validateJson('portable-backup-v1.schema.json', backupV1, 'fixture backup v1.json'));
  assert.doesNotThrow(() => validateJson('portable-backup-v2.schema.json', backupV2, 'fixture backup v2.json'));
});

test('rejects an unrecognized profile payload in state documents', () => {
  const localState = {
    formatVersion: 1,
    profiles: { 'test:Red': { arbitrary: true } },
    profileVersions: { 'test:Red': 2 }
  };

  assert.throws(
    () => validateJson('local-guide-state-v1.schema.json', localState, 'fixture local state.json'),
    /additional properties|must match/
  );
});
