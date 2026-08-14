/**
 * Writes `docs/openapi.json` from the app that actually boots.
 *
 * `--check` regenerates and compares instead of writing, exiting non-zero when
 * the committed file is stale. That is the step CI runs: a spec nobody verifies
 * rots quietly, and the whole value of generating it is that it cannot.
 *
 * Generating the document walks the router and converts schemas — it opens no
 * connection and reads no row — so the variables below are stubbed rather than
 * required. Without them `config/env.ts` refuses to load at import time, and CI's
 * `check` job deliberately has no database to point at.
 */
process.env.DATABASE_URL ??= 'postgres://openapi:openapi@localhost:5432/openapi_not_connected';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-placeholder-secret';
process.env.JWT_REFRESH_SECRET ??= 'openapi-generation-placeholder-secret';
process.env.LOG_LEVEL ??= 'silent';

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// scripts -> apps/api -> apps -> repo root
const target = path.resolve(here, '../../../docs/openapi.json');

const { createApp } = await import('../src/app.js');
const { buildDocument } = await import('../src/openapi/document.js');

const document = `${JSON.stringify(buildDocument(createApp()), null, 2)}\n`;
const check = process.argv.includes('--check');

if (check) {
  const committed = await readFile(target, 'utf8').catch(() => null);

  if (committed === null) {
    console.error(`docs/openapi.json is missing. Run \`npm run generate:openapi\` and commit the result.`);
    process.exit(1);
  }

  if (committed !== document) {
    console.error(
      'docs/openapi.json is out of date: the API has changed since it was generated.\n' +
        'Run `npm run generate:openapi` and commit the result.',
    );
    process.exit(1);
  }

  console.log('docs/openapi.json is up to date.');
} else {
  await writeFile(target, document, 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), target)}`);
}

process.exit(0);
