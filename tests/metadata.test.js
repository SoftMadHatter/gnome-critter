// Garde-fou pour la publication sur extensions.gnome.org : les règles de revue
// (gjs.guide/extensions/review-guidelines) exigent un uuid valide, une url
// réelle, un shell-version de versions stables, et pas de champ `version`
// (attribué par le site). Voir docs/publishing.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const metadata = JSON.parse(read('extension/metadata.json'));

test('metadata.json : uuid au format extension-id@namespace, sans gnome.org', () => {
  assert.equal(metadata.uuid, 'gnome-critter@beedi.xyz');
  const [id, namespace] = metadata.uuid.split('@');
  assert.ok(id && namespace, 'uuid doit contenir exactement un « @ »');
  const validPart = /^[A-Za-z0-9._-]+$/;
  assert.match(id, validPart);
  assert.match(namespace, validPart);
  assert.notEqual(namespace, 'gnome.org');
});

test('metadata.json : url réelle (pas de placeholder), en https', () => {
  assert.match(metadata.url, /^https:\/\//);
  assert.doesNotMatch(metadata.url, /example\.invalid/);
});

test('metadata.json : shell-version = entiers stables ≥ 48', () => {
  assert.ok(Array.isArray(metadata['shell-version']) && metadata['shell-version'].length > 0);
  for (const v of metadata['shell-version']) {
    assert.match(v, /^\d+$/, `version non stable ou mal formée : ${v}`);
    assert.ok(Number(v) >= 48, `version trop ancienne : ${v}`);
  }
});

test('metadata.json : pas de champ version (attribué par le site), version-name valide', () => {
  assert.equal(metadata.version, undefined);
  assert.match(metadata['version-name'], /^[A-Za-z0-9. ]{1,16}$/);
});

test('metadata.json : settings-schema sous org.gnome.shell.extensions., schéma présent', () => {
  assert.match(metadata['settings-schema'], /^org\.gnome\.shell\.extensions\./);
  const schemaPath = `extension/schemas/${metadata['settings-schema']}.gschema.xml`;
  assert.ok(existsSync(join(ROOT, schemaPath)), `schéma manquant : ${schemaPath}`);
  assert.match(read(schemaPath), new RegExp(`id="${metadata['settings-schema']}"`));
});

test('metadata.json : gettext-domain correspond au catalogue .pot', () => {
  assert.ok(existsSync(join(ROOT, `po/${metadata['gettext-domain']}.pot`)), `catalogue manquant pour le domaine "${metadata['gettext-domain']}"`);
});
