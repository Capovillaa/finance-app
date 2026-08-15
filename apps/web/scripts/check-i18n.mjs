#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Two checks over the client's catalogues, both of which have caught a real bug.
 *
 * 1. **Parity.** Every key and every `{{placeholder}}` in `en.json` exists in
 *    `pt-BR.json` and `es.json`, and neither has keys English does not. A missing
 *    key falls back to English *silently*, and a translation that drops a
 *    placeholder loses a number rather than a word.
 *
 * 2. **Resolution.** Every literal `t('some.key')` in `src/` resolves against a
 *    catalogue. This is the failure parity structurally cannot see: a key missing
 *    from *all three* files is consistent, so parity passes, and i18next renders
 *    the raw key — a button reading `common.apply`. That shipped once and was
 *    only caught by a browser driving the button by its accessible name.
 *
 * The `validation.*` namespace lives in `packages/schemas/src/translations.ts`
 * and is merged in at init, so its keys are read from there. Keys built at
 * runtime from a template literal or a variable cannot be checked here.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../src');
const REPO = path.resolve(here, '../../..');
const LOCALES = path.join(SRC, 'i18n/locales');
const TRANSLATED = ['pt-BR', 'es'];
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const problems = [];

const load = (code) => JSON.parse(readFileSync(path.join(LOCALES, `${code}.json`), 'utf8'));

function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') flatten(value, `${prefix}${key}.`, out);
    else out.set(`${prefix}${key}`, String(value));
  }
  return out;
}

const placeholders = (text) => [...text.matchAll(/{{\s*([\w]+)\s*}}/g)].map((m) => m[1]).sort().join(',');

// --- 1. parity ---------------------------------------------------------------

const en = flatten(load('en'));

for (const code of TRANSLATED) {
  const other = flatten(load(code));

  for (const key of en.keys()) {
    if (!other.has(key)) problems.push(`${code}: missing key ${key}`);
    else if (placeholders(en.get(key)) !== placeholders(other.get(key))) {
      problems.push(
        `${code}: ${key} interpolates {${placeholders(other.get(key))}}, English has {${placeholders(en.get(key))}}`,
      );
    }
  }
  for (const key of other.keys()) {
    if (!en.has(key)) problems.push(`${code}: key ${key} has no English original`);
  }
}

// --- 2. every literal key resolves -------------------------------------------

const known = new Set(en.keys());
// i18next resolves `t('x')` against `x_one` / `x_other` when a count is passed.
for (const key of en.keys()) known.add(key.replace(PLURAL_SUFFIX, ''));

const sharedCatalogue = readFileSync(path.join(REPO, 'packages/schemas/src/translations.ts'), 'utf8');
for (const match of sharedCatalogue.matchAll(/'(validation\.[A-Za-z]\w*)'/g)) known.add(match[1]);

const sources = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry) && !full.includes(`i18n${path.sep}locales`)) sources.push(full);
  }
})(SRC);

for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bt\(\s*['"]([a-zA-Z][\w.]*)['"]/g)) {
    if (!known.has(match[1])) {
      problems.push(`${path.relative(REPO, file)}: t('${match[1]}') is in no catalogue`);
    }
  }
}

// -----------------------------------------------------------------------------

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`i18n ok: ${en.size} keys across en, ${TRANSLATED.join(', ')}; every literal t() key resolves.`);
