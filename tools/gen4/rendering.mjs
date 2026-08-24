import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));

export { sharp };

export const markerCoordinates = area => [...new Map([
  ...area.items, ...area.resources, ...area.transports,
  ...area.entrances.filter(entrance => entrance.showMarker !== false && entrance.targetId)
].filter(value => value.x >= 0 && value.y >= 0).map(value => [`${value.x},${value.y}`, { x: value.x, y: value.y }])).values()];

export function renderCacheKey({ game, source, areas, rendererFiles, configuration = {} }) {
  const hash = createHash('sha256');
  hash.update('gen4-render-cache-v2\0');
  hash.update(game);
  hash.update(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim());
  for (const file of rendererFiles) hash.update(fs.readFileSync(file));
  hash.update(JSON.stringify(configuration));
  for (const area of [...areas].sort((left, right) => left.id.localeCompare(right.id))) {
    hash.update(JSON.stringify({ id: area.id, mapMatrixId: area.mapMatrixId, markers: markerCoordinates(area) }));
  }
  return hash.digest('hex');
}

export function modelNames(apicula, inputs) {
  const output = execFileSync(apicula, ['info', ...inputs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return new Map([...output.matchAll(/Model \d+:\n  Name: ([^\n]+)\n  Found In: ([^\n]+)/g)].map(match => [path.resolve(match[2]), match[1]]));
}

export function convert(apicula, inputs, texture, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const names = modelNames(apicula, inputs);
  execFileSync(apicula, ['convert', '-f=glb', ...inputs, ...(texture ? [texture] : []), '-o', output], { stdio: 'inherit', maxBuffer: 64 * 1024 * 1024 });
  return inputs.map(input => path.join(output, `${names.get(path.resolve(input))}.glb`));
}

export function installBrowserFiles(root) {
  const threeRoot = path.join(toolRoot, 'node_modules/three'), vendor = path.join(root, 'vendor');
  fs.mkdirSync(vendor, { recursive: true });
  fs.writeFileSync(path.join(vendor, 'three.module.min.mjs'), fs.readFileSync(path.join(threeRoot, 'build/three.module.min.js'), 'utf8').replaceAll('./three.core.min.js', './three.core.min.mjs'));
  fs.copyFileSync(path.join(threeRoot, 'build/three.core.min.js'), path.join(vendor, 'three.core.min.mjs'));
  for (const addon of ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js']) {
    const name = path.basename(addon).replace(/\.js$/, '.mjs');
    const contents = fs.readFileSync(path.join(threeRoot, 'examples/jsm', addon), 'utf8')
      .replaceAll(`from 'three';`, `from './three.module.min.mjs';`)
      .replaceAll(`from '../utils/BufferGeometryUtils.js';`, `from './BufferGeometryUtils.mjs';`)
      .replaceAll(`from '../utils/SkeletonUtils.js';`, `from './SkeletonUtils.mjs';`);
    fs.writeFileSync(path.join(vendor, name), contents);
  }
  fs.copyFileSync(path.join(toolRoot, 'bake-maps.mjs'), path.join(root, 'bake-maps.mjs'));
  fs.writeFileSync(path.join(root, 'bake.html'), '<!doctype html><meta charset="utf-8"><canvas width="1024" height="1024"></canvas><output></output><script type="module" src="./bake-maps.mjs"></script>');
}

export async function bake(root, chrome) {
  fs.mkdirSync(path.join(root, 'tiles'), { recursive: true });
  let resolveResult, rejectResult;
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'POST' && url.pathname === '/write-tile') {
      const name = path.basename(url.searchParams.get('name') ?? '');
      if (!/^matrix-\d+-group-\d+\.png$/.test(name)) return void response.writeHead(400).end();
      const chunks = []; request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => { fs.writeFileSync(path.join(root, 'tiles', name), Buffer.concat(chunks)); response.writeHead(204).end(); });
      return;
    }
    if (request.method === 'POST' && (url.pathname === '/complete' || url.pathname === '/failed')) {
      const chunks = []; request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => { const body = Buffer.concat(chunks).toString(); url.pathname === '/complete' ? resolveResult(JSON.parse(body)) : rejectResult(new Error(body)); response.writeHead(204).end(); });
      return;
    }
    const requested = url.pathname === '/' ? 'bake.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, requested);
    if (!file.startsWith(`${path.resolve(root)}/`) || !fs.existsSync(file)) return void response.writeHead(404).end();
    response.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream'); response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = spawn(chrome, ['--headless=new', '--disable-dev-shm-usage', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', `http://127.0.0.1:${server.address().port}/bake.html`], { stdio: ['ignore', 'ignore', 'inherit'] });
  browser.on('error', rejectResult); browser.on('exit', code => { if (code) rejectResult(new Error(`Chrome exited with status ${code}.`)); });
  try { return await result; } finally { browser.kill('SIGTERM'); await new Promise(resolve => server.close(resolve)); }
}
