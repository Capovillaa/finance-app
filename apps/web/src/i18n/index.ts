import { validationResources } from '@finance/schemas';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import ptBR from './locales/pt-BR.json';
import { DEFAULT_LANGUAGE, LANGUAGES, resolveLanguage } from './languages';

/** Where an explicit choice is remembered between visits, and before sign-in. */
export const LANGUAGE_STORAGE_KEY = 'finance.language';

/**
 * Reads the language to start in.
 *
 * The order matters and is the whole design:
 *
 *  1. an explicit choice this browser has made, which must win over everything
 *     — a user who picked English on a Portuguese machine meant it;
 *  2. the browser's own languages, in the order the user ranked them;
 *  3. English.
 *
 * The signed-in user's `locale` is *not* consulted here, because at first paint
 * there is no session yet. It is applied later by `adoptProfileLanguage`, once
 * the silent refresh has resolved — see the note there about why that is not a
 * flash of the wrong language in practice.
 */
export function detectLanguage(): string {
  const stored = resolveLanguage(safeRead(LANGUAGE_STORAGE_KEY));
  if (stored) return stored;

  for (const tag of navigator.languages ?? [navigator.language]) {
    const match = resolveLanguage(tag);
    if (match) return match;
  }

  return DEFAULT_LANGUAGE;
}

function safeRead(key: string): string | null {
  // Private-mode Safari and a few enterprise policies throw on access rather
  // than returning null, and a language preference is not worth a blank page.
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Not being able to remember the choice is survivable; failing is not. */
  }
}

void i18n.use(initReactI18next).init({
  // The `validation` namespace is merged in from `@finance/schemas` rather than
  // living in the JSON beside it: the API rejects a field with the very same
  // key, so its wording is shared instead of being maintained in two catalogues.
  resources: {
    en: { translation: { ...en, ...validationResources('en') } },
    'pt-BR': { translation: { ...ptBR, ...validationResources('pt-BR') } },
    es: { translation: { ...es, ...validationResources('es') } },
  },
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGES.map((language) => language.code),
  interpolation: {
    // React escapes for us; letting i18next escape as well double-encodes any
    // interpolated name that happens to contain an apostrophe or an ampersand.
    escapeValue: false,
  },
  returnNull: false,
});

/**
 * Switches the app's language and remembers the choice in this browser.
 *
 * Persisting the choice to the user's profile is deliberately *not* done here —
 * that is a network call, and this function is also used before anyone is
 * signed in. `useLanguage` owns that half.
 */
export async function setLanguage(code: string): Promise<void> {
  const resolved = resolveLanguage(code) ?? DEFAULT_LANGUAGE;
  safeWrite(LANGUAGE_STORAGE_KEY, resolved);
  await i18n.changeLanguage(resolved);
}

/**
 * Applies the language stored on the signed-in profile, unless this browser has
 * an explicit choice of its own.
 *
 * The precedence is what stops a saved profile from silently overriding the
 * picker on a shared machine. Called once, after the session resolves.
 */
export async function adoptProfileLanguage(locale: string | null | undefined): Promise<void> {
  if (safeRead(LANGUAGE_STORAGE_KEY)) return;

  const resolved = resolveLanguage(locale);
  if (!resolved || resolved === i18n.language) return;

  await i18n.changeLanguage(resolved);
}

/** True once the user has made a deliberate choice in this browser. */
export function hasExplicitLanguage(): boolean {
  return safeRead(LANGUAGE_STORAGE_KEY) !== null;
}

export default i18n;
