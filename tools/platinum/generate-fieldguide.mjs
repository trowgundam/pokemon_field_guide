import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

import { formatPackageReport, generatePackage } from '../package-finalization/index.mjs';
import { buildPlatinumSource } from './source.mjs';
import { sinnohRockRoofDecorations } from '../gen4/layered-world.mjs';
import { renderPlatinumMaps } from './render-maps.mjs';
import { addPlatinumNavigation, buildPlatinumPackage } from './build-package.mjs';

const source = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node tools/platinum/generate-fieldguide.mjs /path/to/pokeplatinum /path/to/apicula');
const apicula = path.resolve(process.argv[3]);

const persistentRenderRoot = process.env.GEN4_RENDER_ROOT ? path.resolve(process.env.GEN4_RENDER_ROOT) : null;
const renderRoot = persistentRenderRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), 'platinum-render-'));
try {
  const sourceWork = buildPlatinumSource(source); addPlatinumNavigation(sourceWork);
  const renderedMaps = await renderPlatinumMaps({
    work: sourceWork, areaIds: [...sourceWork.areas.keys()], apicula, output: renderRoot,
    decorativeMainCells: sinnohRockRoofDecorations
  });
  const report = await generatePackage({
    gameId: 'platinum', formatVersion: 3,
    build: ({ assets }) => buildPlatinumPackage({
      source,
      renderedMaps,
      assets
    })
  });
  console.log(formatPackageReport(report));
} finally {
  if (renderRoot && !persistentRenderRoot) await fs.rm(renderRoot, { recursive: true, force: true });
}
