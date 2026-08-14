/**
 * The languages the app ships.
 *
 * `code` is what goes in `user.locale` and in `localStorage`, and it is also
 * what every `Intl` formatter is handed — so it has to be a real BCP-47 tag,
 * not an invented key. That is why Portuguese is `pt-BR` rather than `pt`: the
 * translations are Brazilian, and the date and currency formats that come with
 * the tag should be Brazilian too.
 *
 * `label` is deliberately written in the language it names. Someone who has
 * landed in a language they cannot read needs to find their own in the list,
 * and "Portuguese" is no help to them.
 */
export interface Language {
  code: string;
  label: string;
  /** The region flag is decoration; the label is what carries the meaning. */
  short: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'pt-BR', label: 'Português (Brasil)', short: 'PT' },
  { code: 'es', label: 'Español', short: 'ES' },
] as const;

export const DEFAULT_LANGUAGE = 'en';

/**
 * Maps any locale tag onto one of the shipped languages.
 *
 * The match is on the primary subtag, so `pt`, `pt-PT` and `pt-BR` all resolve
 * to the Brazilian catalogue rather than falling back to English — a European
 * Portuguese speaker is much better served by Brazilian Portuguese than by a
 * language they may not read at all. An exact tag match wins first, which is
 * what keeps this honest if `pt-PT` is ever added.
 */
export function resolveLanguage(tag: string | null | undefined): string | undefined {
  if (!tag) return undefined;

  const wanted = tag.trim();
  if (!wanted) return undefined;

  const exact = LANGUAGES.find((language) => language.code.toLowerCase() === wanted.toLowerCase());
  if (exact) return exact.code;

  const primary = wanted.split('-')[0]?.toLowerCase();
  if (!primary) return undefined;

  return LANGUAGES.find((language) => language.code.split('-')[0]?.toLowerCase() === primary)?.code;
}
