import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const serviceWorkerSource = await fs.readFile(new URL('../PokemonFieldGuide/wwwroot/service-worker.published.js', import.meta.url), 'utf8');

const harness = () => {
  const listeners = new Map(), cacheContents = new Map(), added = [];
  const cache = {
    addAll: async requests => added.push(...requests.map(request => request.url)),
    match: async request => cacheContents.get(request.url ?? request),
    put: async (request, response) => cacheContents.set(request.url, response)
  };
  const context = {
    URL,
    Request: class { constructor(url, options) { this.url = url; this.options = options; } },
    console: { info() {} },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async request => new Response(`network:${request.url}`, { status: 200 }),
    self: {
      origin: 'https://field-guide.test',
      assetsManifest: {
        version: 'test',
        assets: [
          { url: 'js/world-layer-residency.mjs', hash: 'module' },
          { url: 'games/platinum/maps/overview.png', hash: 'overview' },
          { url: 'games/platinum/maps/world-layers/route-201.png', hash: 'detail' },
          { url: 'favicon.svg', hash: 'icon' }
        ]
      },
      importScripts() {},
      addEventListener: (name, listener) => listeners.set(name, listener)
    },
    Response
  };
  vm.runInNewContext(serviceWorkerSource, context);
  return { listeners, cacheContents, added };
};

test('published service worker precaches every manifest asset', async () => {
  const { listeners, added } = harness();
  let installation;
  listeners.get('install')({ waitUntil: promise => { installation = promise; } });
  await installation;

  assert.deepEqual(added, [
    'js/world-layer-residency.mjs',
    'games/platinum/maps/overview.png',
    'games/platinum/maps/world-layers/route-201.png',
    'favicon.svg'
  ]);
});
