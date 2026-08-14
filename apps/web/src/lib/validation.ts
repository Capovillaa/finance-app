import i18n from '../i18n';

/**
 * Renders the message attached to a form field.
 *
 * Two kinds of message end up in the same place, and they need opposite
 * treatment. The client's own Zod schemas are plain modules evaluated once at
 * import time, so they cannot hold translated text — freezing the language at
 * whatever it was when the bundle loaded. They carry catalogue *keys* instead
 * (`validation.nameRequired`), resolved here at render. The server's field
 * rejections, which arrive through `getFieldErrors` and are set with
 * `setError`, are already sentences — in English, because the API has no i18n
 * layer — and must be shown as they are.
 *
 * `i18n.exists` is what tells the two apart, so neither needs to know about the
 * other, and a key that has not been added to the catalogue yet shows up as its
 * own key rather than as a blank field.
 */
export function fieldMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return i18n.exists(message) ? i18n.t(message) : message;
}
