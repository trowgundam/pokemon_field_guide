import path from 'node:path';
import sharp from 'sharp';

import { buildRubySapphirePackage } from './build-package.mjs';
import { formatPackageReport, generatePackage } from '../package-finalization/index.mjs';

const source = path.resolve(process.argv[2] ?? '/tmp/pokeruby-fieldguide');
const report = await generatePackage({
  gameId: 'rs',
  formatVersion: 3,
  build: ({ assets }) => buildRubySapphirePackage({ source, assets, sharp })
});
console.log(formatPackageReport(report));
