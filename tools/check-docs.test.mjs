import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkDocumentation } from './check-docs.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'field-guide-docs-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.mkdir(path.join(root, 'PokemonFieldGuide/wwwroot/games/test/data'), { recursive: true });
  await fs.writeFile(path.join(root, 'README.md'), '# Project\n\nSee [contributor docs](docs/README.md).\n');
  await fs.writeFile(path.join(root, 'docs/README.md'), [
    '# Documentation',
    '',
    '- [Guide](guide.md)',
    '- [Resource audit](resource-audit.md)',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(root, 'docs/guide.md'), [
    '# Guide',
    '',
    'See [Details](#details).',
    '',
    '## Details',
    '',
    'Run `just check`.',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(root, 'docs/resource-audit.md'), [
    '# Resource audit',
    '',
    '<!-- check:package-resource-counts -->',
    '| Package | Package ID | Resources |',
    '| --- | --- | ---: |',
    '| Test | `test` | 1 |',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(root, 'justfile'), 'check:\n    true\n');
  await fs.writeFile(
    path.join(root, 'PokemonFieldGuide/wwwroot/games/test/data/fieldguide.json'),
    JSON.stringify({ areas: [{ resources: [{ name: 'Berry' }] }] })
  );
  return root;
}

test('accepts indexed documentation with valid links, recipes, and package counts', async t => {
  const root = await fixture(t);
  assert.deepEqual(await checkDocumentation(root), []);
});

test('reports missing local link targets and anchors', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'docs/guide.md'), [
    '# Guide',
    '',
    'See [missing file](missing.md) and [missing section](#missing-section).',
    '',
    'Run `just check`.',
    ''
  ].join('\n'));

  const errors = await checkDocumentation(root);
  assert(errors.some(error => error.includes("link target 'missing.md' does not exist")));
  assert(errors.some(error => error.includes("anchor '#missing-section' does not exist")));
});

test('reports contributor pages omitted from the documentation index', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'docs/orphan.md'), '# Orphan\n');

  assert((await checkDocumentation(root)).some(error => error.includes("docs/orphan.md is not linked from docs/README.md")));
});

test('reports documented just recipes that do not exist', async t => {
  const root = await fixture(t);
  await fs.appendFile(path.join(root, 'docs/guide.md'), '\nRun `just missing-recipe`.\n');

  assert((await checkDocumentation(root)).some(error => error.includes("just recipe 'missing-recipe' does not exist")));
});

test('reports package resource counts that differ from installed data', async t => {
  const root = await fixture(t);
  const auditPath = path.join(root, 'docs/resource-audit.md');
  await fs.writeFile(auditPath, (await fs.readFile(auditPath, 'utf8')).replace('| Test | `test` | 1 |', '| Test | `test` | 2 |'));

  assert((await checkDocumentation(root)).some(error => error.includes("package 'test' documents 2 resources but contains 1")));
});
