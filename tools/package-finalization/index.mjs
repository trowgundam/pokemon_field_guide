import fs from 'node:fs/promises';
import path from 'node:path';
import { createAssetWorkspace } from './assets.mjs';
import { checkPackage, finalizeDraft, packageRelativePaths, parseCatalog } from './contract.mjs';

const defaultWebRoot = path.resolve('PokemonFieldGuide/wwwroot');

const loadCatalog = async webRoot => parseCatalog(JSON.parse(await fs.readFile(path.join(webRoot, 'games/catalog.json'), 'utf8')));

const writeJson = async (root, relative, value) => {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value));
};

const prunePngs = async (directory, expected) => {
  for (const file of await fs.readdir(directory))
    if (file.endsWith('.png') && !expected.has(file)) await fs.rm(path.join(directory, file));
};

const pruneUnreferencedAssets = async (stageRoot, relative, finalized) => {
  const maps = new Set([
    ...finalized.fieldGuide.areas.filter(area => area.mapImage).map(area => path.posix.basename(area.mapImage)),
    ...finalized.worlds.map(world => path.posix.basename(world.image))
  ]);
  const pokemon = new Set(['question_mark.png', ...Object.values(finalized.manifest.pokemonSprites)]);
  const items = new Set(['question_mark.png', ...finalized.fieldGuide.areas.flatMap(area => area.items.map(item => item.icon))]);
  await Promise.all([
    prunePngs(path.join(stageRoot, relative.mapDirectory), maps),
    prunePngs(path.join(stageRoot, relative.pokemonDirectory), pokemon),
    prunePngs(path.join(stageRoot, relative.itemDirectory), items)
  ]);
};

const replacePackage = async (target, staged) => {
  const parent = path.dirname(target);
  const backup = path.join(parent, `.${path.basename(target)}-backup-${process.pid}-${Date.now()}`);
  const exists = await fs.stat(target).then(() => true, () => false);
  if (exists) await fs.rename(target, backup);
  try {
    await fs.rename(staged, target);
  } catch (error) {
    if (exists) await fs.rename(backup, target).catch(rollback => {
      throw new AggregateError([error, rollback], `Package replacement and rollback both failed. Backup remains at ${backup}.`);
    });
    throw error;
  }
  if (exists) await fs.rm(backup, { recursive: true, force: true });
};

export async function generatePackage({ gameId, build, webRoot = defaultWebRoot }) {
  if (typeof build !== 'function') throw new Error(`${gameId}: package generation requires a build callback.`);
  webRoot = path.resolve(webRoot);
  const catalog = await loadCatalog(webRoot);
  const game = catalog.games.find(candidate => candidate.id === gameId);
  if (!game) throw new Error(`Game package '${gameId}' is not registered.`);
  const packageRoot = path.join(webRoot, 'games', game.id);
  const stageRoot = await fs.mkdtemp(path.join(path.dirname(packageRoot), `.${game.id}-stage-`));
  const relative = packageRelativePaths(game);
  const assets = createAssetWorkspace(stageRoot, {
    map: relative.mapDirectory,
    pokemon: relative.pokemonDirectory,
    item: relative.itemDirectory
  });

  try {
    const draft = await build({ definition: game, assets });
    const finalized = finalizeDraft(game, draft);
    await Promise.all([
      writeJson(stageRoot, relative.fieldGuide, finalized.fieldGuide),
      writeJson(stageRoot, relative.pokedex, finalized.pokedex),
      writeJson(stageRoot, relative.worlds, finalized.worlds),
      writeJson(stageRoot, relative.manifest, finalized.manifest)
    ]);
    await pruneUnreferencedAssets(stageRoot, relative, finalized);
    const report = await checkPackage(game, stageRoot);
    await replacePackage(packageRoot, stageRoot);
    return report;
  } finally {
    await fs.rm(stageRoot, { recursive: true, force: true });
  }
}

export async function checkPackages({ webRoot = defaultWebRoot } = {}) {
  webRoot = path.resolve(webRoot);
  const catalog = await loadCatalog(webRoot);
  const reports = [];
  for (const game of catalog.games) reports.push(await checkPackage(game, path.join(webRoot, 'games', game.id)));
  return reports;
}

const formatCount = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export const formatPackageReport = report => `Generated ${report.gameName}: ${formatCount(report.areaCount, 'area')}, ${formatCount(report.encounterCount, 'encounter')}, ${formatCount(report.itemCount, 'item')}, and ${formatCount(report.specialPokemonCount, 'special Pokémon', 'special Pokémon')}.`;
