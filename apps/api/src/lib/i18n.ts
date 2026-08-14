import { readFileSync } from 'node:fs';
import { validationResources } from '@finance/schemas';
import i18next from 'i18next';

export const SUPPORTED_LOCALES = ['en', 'pt-BR', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

function loadCatalogue(locale: Locale): Record<string, unknown> {
  // `readFileSync` + `import.meta.url` sidesteps NodeNext's JSON import-attribute
  // rules entirely, and resolves correctly both against `src` under `tsx` and
  // against `dist` once built — see `scripts/copy-assets.mjs`, which is what
  // puts the catalogues next to the compiled output in the first place.
  const url = new URL(`../i18n/locales/${locale}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf-8')) as Record<string, unknown>;
}

const instance = i18next.createInstance();
void instance.init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  // The `validation` namespace comes from `@finance/schemas` rather than from
  // the JSON files: the web client rejects a field with the same key this API
  // does, so the sentence behind that key is shared rather than kept in two
  // catalogues that can be corrected separately.
  resources: Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      { translation: { ...loadCatalogue(locale), ...validationResources(locale) } },
    ]),
  ),
  interpolation: { escapeValue: false },
  returnNull: false,
  initImmediate: false,
});

/** Exact match first, then the primary subtag (`pt` -> `pt-BR`), then English. */
export function resolveLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === input.toLowerCase());
  if (exact) return exact;
  const primary = input.split('-')[0]?.toLowerCase();
  const byPrimary = SUPPORTED_LOCALES.find((locale) => locale.split('-')[0]!.toLowerCase() === primary);
  return byPrimary ?? DEFAULT_LOCALE;
}

/** Picks the first tag from an `Accept-Language` header this app has a catalogue for. */
export function resolveAcceptLanguage(header: string | undefined | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim())
    .filter((tag): tag is string => Boolean(tag));

  for (const tag of tags) {
    if (tag === '*') continue;
    const resolved = resolveLocale(tag);
    if (resolved !== DEFAULT_LOCALE) return resolved;
  }
  return DEFAULT_LOCALE;
}

/**
 * Params whose name ends in `Key` hold a translation key rather than a literal
 * value (e.g. `{ roleKey: 'common.role.editor' }`); that key is resolved in the
 * target locale first, and the result is exposed to the template under the name
 * without the `Key` suffix (`{{role}}`). This is what lets a factory like
 * `notFound('resources.account')` defer the noun's own translation until the
 * response locale is known, instead of baking in English at throw time.
 */
function resolveParams(locale: Locale, params?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!params) return params;
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.endsWith('Key') && typeof value === 'string') {
      resolved[key.slice(0, -3)] = t(locale, value);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

export function t(locale: Locale, key: string, params?: Record<string, unknown>): string {
  return instance.getFixedT(locale)(key, resolveParams(locale, params)) as string;
}
