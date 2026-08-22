import path from 'node:path';
import sharp from 'sharp';

import { buildGoldSilverPackage } from './build-package.mjs';
import { formatPackageReport, generatePackage } from '../package-finalization/index.mjs';

const source = path.resolve(process.argv[2] ?? '/tmp/pokegold-fieldguide');
const report = await generatePackage({
  gameId: 'gs',
  formatVersion: 3,
  build: ({ assets }) => buildGoldSilverPackage({ source, assets, sharp })
});
console.log(formatPackageReport(report));
