import path from 'node:path';
import sharp from 'sharp';

import { buildEmeraldPackage } from './build-package.mjs';
import { formatPackageReport, generatePackage } from '../package-finalization/index.mjs';

const source = path.resolve(process.argv[2] ?? '/tmp/pokeemerald-fieldguide');
const report = await generatePackage({
  gameId: 'emerald',
  formatVersion: 3,
  build: ({ assets }) => buildEmeraldPackage({ source, assets, sharp })
});
console.log(formatPackageReport(report));
