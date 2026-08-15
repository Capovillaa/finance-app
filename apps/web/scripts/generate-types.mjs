/**
 * Writes `src/api/schema.d.ts` from `docs/openapi.json`.
 *
 * `--check` regenerates and compares instead of writing, exiting non-zero when
 * the committed file is stale — the same bargain `apps/api`'s
 * `generate-openapi.ts` makes, and for the same reason: a generated file that
 * nobody verifies is a hand-written file with extra steps.
 *
 * The chain is: the app defines the responses, `generate:openapi` writes the
 * specification from the app, and this writes the client's types from the
 * specification. Run them in that order; `npm run generate:openapi` at the root
 * does both.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
// scripts -> apps/web -> apps -> repo root
const spec = path.resolve(here, '../../../docs/openapi.json');
const target = path.resolve(here, '../src/api/schema.d.ts');

const banner =
  '/**\n' +
  ' * GENERATED FILE — do not edit.\n' +
  ' *\n' +
  ' * Written by `npm run generate:openapi` (at the repository root) from\n' +
  ' * `docs/openapi.json`, which is itself generated from the running API. Every\n' +
  ' * response shape the client knows about starts life as a Zod schema beside the\n' +
  ' * service that produces it, in `apps/api/src/modules/<domain>/responses.ts`.\n' +
  ' *\n' +
  ' * `src/api/types.ts` is the file to read: it gives the shapes here the names\n' +
  ' * the app uses. Nothing should import this one directly.\n' +
  ' */\n\n';

const generated = banner + astToString(await openapiTS(new URL(`file://${spec.replace(/\\/g, '/')}`)));

if (process.argv.includes('--check')) {
  const committed = await readFile(target, 'utf8').catch(() => null);

  if (committed === null) {
    console.error('src/api/schema.d.ts is missing. Run `npm run generate:openapi` and commit the result.');
    process.exit(1);
  }

  if (committed.replace(/\r\n/g, '\n') !== generated.replace(/\r\n/g, '\n')) {
    console.error(
      'src/api/schema.d.ts is out of date: the API contract has changed since it was generated.\n' +
        'Run `npm run generate:openapi` and commit the result.',
    );
    process.exit(1);
  }

  console.log('src/api/schema.d.ts is up to date.');
} else {
  await writeFile(target, generated, 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), target)}`);
}
