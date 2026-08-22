import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(repositoryRoot, 'tools/source-lock.sh');

function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

function sourceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldguide-source-lock-'));
  const remote = path.join(root, 'pokered-origin');
  fs.mkdirSync(remote);
  git(remote, 'init', '--quiet');
  git(remote, 'config', 'commit.gpgSign', 'false');
  git(remote, 'config', 'user.email', 'source-lock@example.test');
  git(remote, 'config', 'user.name', 'Source Lock Test');
  fs.writeFileSync(path.join(remote, 'revision.txt'), 'first\n');
  git(remote, 'add', 'revision.txt');
  git(remote, 'commit', '--quiet', '-m', 'first');
  const lockedRevision = git(remote, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(remote, 'revision.txt'), 'second\n');
  git(remote, 'commit', '--quiet', '-am', 'second');
  const currentRevision = git(remote, 'rev-parse', 'HEAD');
  const lock = path.join(root, 'sources.lock');
  fs.writeFileSync(lock, `pokered ${lockedRevision}\n`);
  return { root, remoteUrl: pathToFileURL(remote).href, lock, lockedRevision, currentRevision };
}

test('source lock covers every clone and generation recipe', () => {
  const lockEntries = fs.readFileSync(path.join(repositoryRoot, 'sources.lock'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(/\s+/));
  assert(lockEntries.every(entry => entry.length === 2 && /^[0-9a-f]{40}$/.test(entry[1])));
  const lockedRepositories = lockEntries.map(entry => entry[0]).sort();
  assert.equal(new Set(lockedRepositories).size, lockedRepositories.length);

  const justfile = fs.readFileSync(path.join(repositoryRoot, 'justfile'), 'utf8');
  const cloneRepositories = [...justfile.matchAll(/just _clone-source "\{\{root\}\}" ([a-z]+)/g)]
    .map(match => match[1]).sort();
  const generationRepositories = [...justfile.matchAll(/source-lock\.sh check sources\.lock ([a-z]+)/g)]
    .map(match => match[1]).sort();
  assert.deepEqual(lockedRepositories, cloneRepositories);
  assert.deepEqual(lockedRepositories, generationRepositories);
});

test('clones only the locked source revision', t => {
  const fixture = sourceFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const checkout = path.join(fixture.root, 'checkout');

  execFileSync('sh', [helper, 'clone', fixture.lock, 'pokered', checkout, fixture.remoteUrl]);

  assert.equal(git(checkout, 'rev-parse', 'HEAD'), fixture.lockedRevision);
  assert.equal(git(checkout, 'rev-list', '--count', 'HEAD'), '1');
  assert.equal(git(checkout, 'rev-parse', '--is-shallow-repository'), 'true');
});

test('rejects an existing checkout at a different revision without changing it', t => {
  const fixture = sourceFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const checkout = path.join(fixture.root, 'checkout');
  execFileSync('git', ['clone', '--quiet', fixture.remoteUrl, checkout]);

  const result = spawnSync('sh', [helper, 'clone', fixture.lock, 'pokered', checkout, fixture.remoteUrl], {
    encoding: 'utf8'
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /locked at .* but checkout HEAD is/);
  assert.equal(git(checkout, 'rev-parse', 'HEAD'), fixture.currentRevision);
});

test('rejects uncommitted changes at the locked revision', t => {
  const fixture = sourceFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const checkout = path.join(fixture.root, 'checkout');
  execFileSync('sh', [helper, 'clone', fixture.lock, 'pokered', checkout, fixture.remoteUrl]);
  fs.writeFileSync(path.join(checkout, 'revision.txt'), 'modified\n');

  const result = spawnSync('sh', [helper, 'check', fixture.lock, 'pokered', checkout, fixture.remoteUrl], {
    encoding: 'utf8'
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /has uncommitted source changes/);
});
