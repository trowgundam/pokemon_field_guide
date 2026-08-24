import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { formatPackageReport, generatePackage } from '../package-finalization/index.mjs';
import { buildDpSource } from './source.mjs';
import { sinnohRockRoofDecorations } from '../gen4/layered-world.mjs';
import { renderDpMaps } from './render-maps.mjs';
import { addDpNavigation, buildDpPackage } from './build-package.mjs';

if (!process.argv[2] || !process.argv[3] || !process.argv[4]) throw new Error('Usage: node tools/dp/generate-fieldguide.mjs /path/to/pokediamond /path/to/pokeplatinum /path/to/apicula');
const source = path.resolve(process.argv[2]), platinumSource = path.resolve(process.argv[3]), apicula = path.resolve(process.argv[4]);
const persistentRenderRoot = process.env.GEN4_RENDER_ROOT ? path.resolve(process.env.GEN4_RENDER_ROOT) : null;
const renderRoot = persistentRenderRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), 'dp-render-'));
try {
  const work = buildDpSource(source, platinumSource); addDpNavigation(work);
  const renderedMaps = await renderDpMaps({
    work, areaIds: [...work.areas.keys()], apicula, output: renderRoot,
    decorativeMainCells: sinnohRockRoofDecorations
  });
  const report = await generatePackage({ gameId: 'dp', formatVersion: 3, build: ({ assets }) => buildDpPackage({ source, platinumSource, renderedMaps, assets }) });
  console.log(formatPackageReport(report));
} finally {
  if (!persistentRenderRoot) await fs.rm(renderRoot, { recursive: true, force: true });
}
