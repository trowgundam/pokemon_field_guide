import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLayerDecision, intersectsExpandedViewport, layerResidency, worldViewport } from '../PokemonFieldGuide/wwwroot/js/world-layer-residency.mjs';

test('converts the transformed screen viewport back to world coordinates', () => {
  assert.deepEqual(worldViewport({ viewportWidth: 400, viewportHeight: 300, scale: 2, translateX: -100, translateY: -40 }), {
    left: 50, top: 20, width: 200, height: 150
  });
});

test('preloads one viewport beyond the edge and retains through two viewports', () => {
  const viewport = { left: 100, top: 100, width: 200, height: 100 };
  const nearby = { x: 450, y: 100, width: 20, height: 20, minScale: 0.5 };
  const distant = { x: 720, y: 100, width: 20, height: 20, minScale: 0.5 };

  assert.equal(intersectsExpandedViewport(nearby, viewport, 1), true);
  assert.equal(layerResidency(nearby, viewport, 1, false), 'load');
  assert.equal(layerResidency(nearby, viewport, 1, true), 'retain');
  assert.equal(layerResidency(distant, viewport, 1, true), 'evict');
});

test('uses the portrait viewport width for horizontal preload', () => {
  const viewport = { left: 0, top: 0, width: 100, height: 300 };
  const severalScreensRight = { x: 250, y: 100, width: 20, height: 20, minScale: 0.5 };

  assert.equal(intersectsExpandedViewport(severalScreensRight, viewport, 1), false);
  assert.equal(layerResidency(severalScreensRight, viewport, 1, false), 'idle');
});

test('keeps detail unloaded below its scale threshold', () => {
  const viewport = { left: 0, top: 0, width: 100, height: 100 };
  const visible = { x: 0, y: 0, width: 50, height: 50, minScale: 0.75 };

  assert.equal(layerResidency(visible, viewport, 0.5, false), 'evict');
  assert.equal(layerResidency(visible, viewport, 0.5, true), 'evict');
});

test('drops a queued layer after a gesture moves it outside preload range', () => {
  const layer = {};
  const queue = new Set([layer]);

  assert.equal(applyLayerDecision(queue, layer, 'idle'), false);
  assert.equal(queue.size, 0);
});
