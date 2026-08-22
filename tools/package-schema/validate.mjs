import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaRoot = path.join(repositoryRoot, 'schemas');
const ajv = new Ajv2020({ allErrors: true, strict: true });
const schemaNames = [
  'catalog.schema.json',
  'fieldguide.schema.json',
  'pokedex.schema.json',
  'worlds.schema.json',
  'package-manifest-v2.schema.json',
  'local-guide-state-v1.schema.json',
  'checklist-profile-v1.schema.json',
  'checklist-profile-v2.schema.json',
  'portable-backup-v1.schema.json',
  'portable-backup-v2.schema.json'
];
const validators = new Map(schemaNames.map(name => {
  const schema = JSON.parse(fs.readFileSync(path.join(schemaRoot, name), 'utf8'));
  return [name, ajv.compile(schema)];
}));

export function validateJson(schemaName, value, documentName) {
  const validate = validators.get(schemaName);
  if (!validate) throw new Error(`Unknown JSON Schema '${schemaName}'.`);
  if (validate(value)) return;
  const errors = validate.errors.map(error => {
    const location = error.instancePath || '/';
    const detail = error.keyword === 'additionalProperties'
      ? `${error.message}: ${error.params.additionalProperty}`
      : error.message;
    return `${documentName} ${location} ${detail}`;
  });
  throw new Error(`JSON Schema validation failed:\n${errors.join('\n')}`);
}
