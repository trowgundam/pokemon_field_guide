import path from 'node:path';
import sharp from 'sharp';

import { buildCrystalPackage } from './build-package.mjs';
import { formatPackageReport, generatePackage } from '../package-finalization/index.mjs';

const source = path.resolve(process.argv[2] ?? '/tmp/pokecrystal-fieldguide');
const report = await generatePackage({
  gameId: 'crystal',
  formatVersion: 3,
  build: ({ assets }) => buildCrystalPackage({ source, assets, sharp })
});
console.log(formatPackageReport(report));
