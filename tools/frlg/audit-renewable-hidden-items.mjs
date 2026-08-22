import path from 'node:path';
import { readRenewableHiddenItems } from './renewable-hidden-items.mjs';

const source = path.resolve(process.argv[2] ?? '/tmp/pokefirered');
const { mapCount, resourceCount, maps } = readRenewableHiddenItems(source);
console.log(JSON.stringify({ mapCount, resourceCount, maps }, null, 2));
