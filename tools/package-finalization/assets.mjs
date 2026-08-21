import fs from 'node:fs/promises';
import path from 'node:path';

const assetBrand = Symbol('package asset');

export const isPackageFileName = fileName => typeof fileName === 'string'
  && fileName !== '' && path.basename(fileName) === fileName && fileName !== '.' && fileName !== '..';

const safeFileName = fileName => {
  if (!isPackageFileName(fileName))
    throw new Error(`Invalid package asset filename '${fileName}'.`);
  return fileName;
};

export const isAsset = (value, kind) => Boolean(value?.[assetBrand] && (!kind || value.kind === kind));

export function createAssetWorkspace(stageRoot, directories) {
  const registered = new Map();

  const register = async (kind, fileName, write) => {
    safeFileName(fileName);
    if (typeof write !== 'function') throw new Error(`${kind} asset '${fileName}' requires a writer.`);
    const key = `${kind}:${fileName}`;
    if (registered.has(key)) throw new Error(`Duplicate ${kind} asset '${fileName}'.`);
    const directory = directories[kind];
    const target = path.join(stageRoot, directory, fileName);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await write(target);
    const stat = await fs.stat(target).catch(() => null);
    if (!stat?.isFile()) throw new Error(`${kind} asset writer did not create '${fileName}'.`);
    const reference = Object.freeze({ [assetBrand]: true, kind, fileName, localPath: target });
    registered.set(key, reference);
    return reference;
  };

  return Object.freeze({
    map: (fileName, write) => register('map', fileName, write),
    pokemonSprite: (fileName, write) => register('pokemon', fileName, write),
    itemSprite: (fileName, write) => register('item', fileName, write)
  });
}

export async function registerQuestionMarkSprites(assets, sharp) {
  const fallback = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#ffffff00' } })
    .composite([{ input: Buffer.from('<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="#eee" stroke="#333" stroke-width="2"/><text x="16" y="23" text-anchor="middle" font-size="22">?</text></svg>') }])
    .png().toBuffer();
  const pokemonFallback = await assets.pokemonSprite('question_mark.png', target => fs.writeFile(target, fallback));
  await assets.itemSprite('question_mark.png', target => fs.writeFile(target, fallback));
  return pokemonFallback;
}
