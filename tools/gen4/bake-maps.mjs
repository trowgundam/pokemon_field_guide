import * as THREE from './vendor/three.module.min.mjs';
import { GLTFLoader } from './vendor/GLTFLoader.mjs';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.mjs';

const CELL_SIZE = 512;
const PADDING = 512;
const PITCH = THREE.MathUtils.degToRad(59.051513671875);
const manifest = await fetch('./render.json').then(response => response.json());
const loader = new GLTFLoader();
const templates = new Map();
const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(1);
renderer.setClearColor(0, 0);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xf5fff7, 0x26302d, 2.3));
const sunlight = new THREE.DirectionalLight(0xffffff, 2.2);
sunlight.position.set(-600, 1000, 450);
scene.add(sunlight);

const camera = new THREE.OrthographicCamera(-PADDING, PADDING, PADDING, -PADDING, -10000, 10000);
camera.up.set(0, 1, 0);

const staging = document.createElement('canvas');
const stagingContext = staging.getContext('2d', { willReadFrequently: true });

function configureModel(root) {
  root.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.map) {
        material.map.magFilter = THREE.NearestFilter;
        material.map.minFilter = THREE.NearestMipmapNearestFilter;
        material.map.colorSpace = THREE.SRGBColorSpace;
      }
      material.roughness = 1;
      material.metalness = 0;
      material.needsUpdate = true;
    }
  });
  return root;
}

async function loadInBatches(uris, concurrency = 12) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, uris.length) }, async () => {
    while (cursor < uris.length) {
      const uri = uris[cursor++];
      const gltf = await loader.loadAsync(uri);
      templates.set(uri, configureModel(gltf.scene));
    }
  }));
}

function instantiate(cell, layout) {
  const group = new THREE.Group();
  const terrain = cloneSkeleton(templates.get(cell.terrain));
  terrain.userData.isTerrain = true;
  group.add(terrain);
  for (const prop of cell.props) {
    const instance = cloneSkeleton(templates.get(prop.uri));
    instance.position.fromArray(prop.position);
    instance.scale.fromArray(prop.scale);
    group.add(instance);
  }
  group.position.set((cell.x - layout.minCellX) * CELL_SIZE, 0, (cell.z - layout.minCellZ) * CELL_SIZE);
  return { group, terrain };
}

function alphaBounds(imageData, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (imageData.data[(y * width + x) * 4 + 3] === 0) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < minX) throw new Error('Rendered tile was empty');
  const padding = 2;
  const x = Math.max(minX - padding, 0), y = Math.max(minY - padding, 0);
  return { x, y, width: Math.min(maxX + padding, width - 1) - x + 1, height: Math.min(maxY + padding, height - 1) - y + 1 };
}

function projectAnchors(instances, group, bounds, width, height) {
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3(0, -1, 0);
  return Object.fromEntries(instances.flatMap(({ terrain }, index) => group.cells[index].anchorCoordinates.map(coordinate => {
    const cell = group.cells[index];
    const localX = (cell.x - group.minCellX) * CELL_SIZE + (coordinate.x + 0.5) * 16 - 256;
    const localZ = (cell.z - group.minCellZ) * CELL_SIZE + (coordinate.z + 0.5) * 16 - 256;
    raycaster.set(new THREE.Vector3(localX, 4096, localZ), direction);
    const hit = raycaster.intersectObject(terrain, true)[0];
    const world = hit?.point ?? new THREE.Vector3(localX, 0, localZ);
    const projected = world.clone().project(camera);
    return [coordinate.id, {
      x: (projected.x + 1) * width / 2 - bounds.x,
      y: (1 - projected.y) * height / 2 - bounds.y,
      elevation: world.y
    }];
  })));
}

async function renderGroup(group) {
  const width = (group.maxCellX - group.minCellX) * CELL_SIZE + PADDING * 2;
  const height = Math.ceil((group.maxCellZ - group.minCellZ) * CELL_SIZE * Math.sin(PITCH)) + PADDING * 2;
  renderer.setSize(width, height, false);
  staging.width = width;
  staging.height = height;
  camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2;
  const centerX = (group.maxCellX - group.minCellX) * CELL_SIZE / 2;
  const centerZ = (group.maxCellZ - group.minCellZ) * CELL_SIZE / 2;
  camera.position.set(centerX, Math.sin(PITCH) * 5000, centerZ + Math.cos(PITCH) * 5000);
  camera.lookAt(centerX, 0, centerZ);
  camera.updateProjectionMatrix();
  const instances = group.cells.map(cell => instantiate(cell, group));
  for (const instance of instances) scene.add(instance.group);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  stagingContext.clearRect(0, 0, width, height);
  stagingContext.drawImage(canvas, 0, 0);
  const bounds = alphaBounds(stagingContext.getImageData(0, 0, width, height), width, height);
  const anchors = projectAnchors(instances, group, bounds, width, height);
  const cropped = document.createElement('canvas');
  cropped.width = bounds.width;
  cropped.height = bounds.height;
  cropped.getContext('2d').drawImage(staging, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  const blob = await new Promise(resolve => cropped.toBlob(resolve, 'image/png'));
  const response = await fetch(`/write-tile?name=${encodeURIComponent(group.id)}.png`, { method: 'POST', body: blob });
  if (!response.ok) throw new Error(`Could not write ${group.id}: ${response.status}`);
  for (const instance of instances) scene.remove(instance.group);
  return { id: group.id, bounds, canvasWidth: width, canvasHeight: height, width: bounds.width, height: bounds.height, anchors };
}

try {
  const uris = [...new Set(manifest.groups.flatMap(group => group.cells.flatMap(cell => [cell.terrain, ...cell.props.map(prop => prop.uri)])))];
  await loadInBatches(uris);
  const tiles = [];
  for (let index = 0; index < manifest.groups.length; index++) {
    document.querySelector('output').textContent = `Baking ${index + 1} / ${manifest.groups.length}`;
    tiles.push(await renderGroup(manifest.groups[index]));
  }
  const response = await fetch('/complete', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pitch: THREE.MathUtils.radToDeg(PITCH), tiles })
  });
  if (!response.ok) throw new Error(`Could not save render manifest: ${response.status}`);
} catch (error) {
  await fetch('/failed', { method: 'POST', body: error.stack ?? error.message ?? String(error) });
  throw error;
}
