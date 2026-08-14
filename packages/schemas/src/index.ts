/**
 * `@finance/schemas` — the validation rules `apps/api` and `apps/web` agree on.
 *
 * The API is still the authority: nothing here runs in place of a server-side
 * check, and the client's copy only exists so a user is told about a rule while
 * typing rather than after a failed round trip. What this package removes is
 * the *second declaration* of that rule, which is what drifted.
 *
 * Read `patterns.ts` for the shapes, `limits.ts` for the bounds, `enums.ts` for
 * the closed sets, `messages.ts` for how a rejection names itself, and
 * `fields.ts` for the API's own JSON request fields.
 */
export * from './limits.js';
export * from './enums.js';
export * from './patterns.js';
export * from './messages.js';
export * from './translations.js';
export * from './fields.js';
