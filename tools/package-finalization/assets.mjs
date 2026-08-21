import fs from 'node:fs/promises';
import path from 'node:path';

const assetBrand = Symbol('package asset');

const safeFileName = fileName => {
  if (typeof fileName !== 'string' || !fileName || path.basename(fileName) !== fileName || fileName === '.' || fileName === '..')
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
    itemSprite: (fileName, write) => register('item', fileName, write),
    inventory: () => new Map(registered)
  });
}

