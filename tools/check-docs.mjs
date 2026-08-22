import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ignoredDirectories = new Set(['.git', 'bin', 'node_modules', 'obj', 'release']);
const packageCountMarker = '<!-- check:package-resource-counts -->';
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

async function markdownFiles(root, directory = root) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(root, entryPath));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(entryPath);
  }
  return files.sort();
}

function markdownLinks(contents) {
  return [...contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(match => {
    const raw = match[1].trim();
    const destination = raw.startsWith('<') ? raw.slice(1, raw.indexOf('>')) : raw.split(/\s+/, 1)[0];
    const line = contents.slice(0, match.index).split('\n').length;
    return { destination, line };
  });
}

function headingAnchors(contents) {
  const anchors = new Set();
  const duplicates = new Map();
  let fenced = false;
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/)?.[1];
    if (!heading) continue;
    const base = heading.toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    const duplicate = duplicates.get(base) ?? 0;
    duplicates.set(base, duplicate + 1);
    anchors.add(duplicate === 0 ? base : `${base}-${duplicate}`);
  }
  return anchors;
}

function isExternal(destination) {
  return /^[a-z][a-z+.-]*:/i.test(destination) || destination.startsWith('//');
}

async function checkLinks(root, files, contentsByFile) {
  const errors = [];
  for (const file of files) {
    const relativeFile = path.relative(root, file);
    for (const { destination, line } of markdownLinks(contentsByFile.get(file))) {
      if (isExternal(destination)) continue;
      const [rawTarget, rawAnchor] = destination.split('#', 2);
      const target = rawTarget ? path.resolve(path.dirname(file), decodeURIComponent(rawTarget)) : file;
      let targetContents;
      try {
        targetContents = contentsByFile.get(target) ?? await fs.readFile(target, 'utf8');
      }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        errors.push(`${relativeFile}:${line}: link target '${rawTarget}' does not exist`);
        continue;
      }
      if (rawAnchor && !headingAnchors(targetContents).has(decodeURIComponent(rawAnchor).toLowerCase())) {
        errors.push(`${relativeFile}:${line}: anchor '#${rawAnchor}' does not exist in ${path.relative(root, target)}`);
      }
    }
  }
  return errors;
}

function checkIndex(root, files, contentsByFile) {
  const indexPath = path.join(root, 'docs/README.md');
  const indexed = new Set(markdownLinks(contentsByFile.get(indexPath) ?? '')
    .map(link => link.destination.split('#', 1)[0])
    .filter(destination => destination && !isExternal(destination))
    .map(destination => path.resolve(path.dirname(indexPath), decodeURIComponent(destination))));
  return files
    .filter(file => file.startsWith(`${path.join(root, 'docs')}${path.sep}`) && file !== indexPath && !indexed.has(file))
    .map(file => `${path.relative(root, file)} is not linked from docs/README.md`);
}

function justRecipes(justfile) {
  return new Set(justfile.split(/\r?\n/)
    .map(line => line.match(/^([a-zA-Z_][\w-]*)(?:\s+[^:]*)?:/)?.[1])
    .filter(Boolean));
}

function checkDocumentedRecipes(root, files, contentsByFile, justfile) {
  const recipes = justRecipes(justfile);
  const errors = [];
  for (const file of files) {
    const contents = contentsByFile.get(file);
    for (const match of contents.matchAll(/\bjust\s+([a-zA-Z][\w-]*)/g)) {
      if (!recipes.has(match[1])) {
        const line = contents.slice(0, match.index).split('\n').length;
        errors.push(`${path.relative(root, file)}:${line}: just recipe '${match[1]}' does not exist`);
      }
    }
  }
  return errors;
}

async function checkPackageResourceCounts(root, files, contentsByFile) {
  const errors = [];
  for (const file of files) {
    const contents = contentsByFile.get(file);
    const markerIndex = contents.indexOf(packageCountMarker);
    if (markerIndex < 0) continue;
    const countRows = contents.slice(markerIndex + packageCountMarker.length)
      .matchAll(/^\|[^|]+\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|/gm);
    for (const row of countRows) {
      const gameId = row[1];
      const documentedCount = Number(row[2]);
      const fieldGuidePath = path.join(root, `PokemonFieldGuide/wwwroot/games/${gameId}/data/fieldguide.json`);
      let fieldGuide;
      try {
        fieldGuide = JSON.parse(await fs.readFile(fieldGuidePath, 'utf8'));
      }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        errors.push(`${path.relative(root, file)}: package '${gameId}' has no installed fieldguide.json`);
        continue;
      }
      const actualCount = fieldGuide.areas.reduce((count, area) => count + (area.resources?.length ?? 0), 0);
      if (documentedCount !== actualCount) {
        errors.push(`${path.relative(root, file)}: package '${gameId}' documents ${documentedCount} resources but contains ${actualCount}`);
      }
    }
  }
  return errors;
}

export async function checkDocumentation(root = path.resolve(moduleDirectory, '..')) {
  const files = await markdownFiles(root);
  const contentsByFile = new Map(await Promise.all(files.map(async file => [file, await fs.readFile(file, 'utf8')])));
  const justfile = await fs.readFile(path.join(root, 'justfile'), 'utf8');
  return [
    ...await checkLinks(root, files, contentsByFile),
    ...checkIndex(root, files, contentsByFile),
    ...checkDocumentedRecipes(root, files, contentsByFile, justfile),
    ...await checkPackageResourceCounts(root, files, contentsByFile)
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await checkDocumentation();
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
  else {
    console.log('Documentation checks passed.');
  }
}
