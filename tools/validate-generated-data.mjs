import { checkPackages } from './package-finalization/index.mjs';

const reports = await checkPackages({ webRoot: process.argv[2] ?? 'PokemonFieldGuide/wwwroot' });
console.log(`Validated generated JSON for ${reports.length} packages.`);
