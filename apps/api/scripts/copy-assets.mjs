import { cpSync } from 'node:fs';

// `tsc` only emits compiled `.js`; the locale catalogues are read at runtime via
// `fs.readFileSync` (see `lib/i18n.ts`) rather than imported as modules, so they
// need to be copied into `dist` by hand as part of the build.
cpSync('src/i18n/locales', 'dist/i18n/locales', { recursive: true });
