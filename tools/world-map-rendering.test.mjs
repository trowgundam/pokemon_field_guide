import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('../PokemonFieldGuide/wwwroot/css/app.css', import.meta.url), 'utf8');
const component = fs.readFileSync(new URL('../PokemonFieldGuide/Components/WorldMap.razor', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../PokemonFieldGuide/Pages/Home.razor', import.meta.url), 'utf8');

test('layered world markers remain visible above lazy detail images', () => {
  assert.match(css, /\.layered-world>\.world-hit-regions\{z-index:1000\}/);
  assert.match(css, /\.layered-world>\.map-marker\{z-index:1001;transition:none\}/);
});

test('multi-region areas share one interactive outline', () => {
  assert.match(component, /<g class="world-area-group/);
  assert.match(component, /<path class="world-area-outline" d="@OutlinePath\(area\.Regions\)"/);
  assert.doesNotMatch(component, /<polygon class="world-area-hotspot @\(/);
  assert.match(css, /\.world-area-group:hover>\.world-area-outline/);
});

test('world transport labels use the source area name', () => {
  assert.match(component, /ContextName="@travel\.Area\.Name"/);
  assert.doesNotMatch(component, /ContextName="travel\.Area\.Name"/);
});

test('switching packages replaces layered map browser state', () => {
  assert.match(home, /<WorldMap @key="CurrentWorldMapKey"/);
  assert.match(home, /CurrentWorldMapKey=>\$"\{game!\.Id\}:\{currentWorld!\.Id\}"/);
});
