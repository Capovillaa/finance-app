import type { RequestHandler } from 'express';
import { resolveAcceptLanguage } from '../lib/i18n.js';

/**
 * Resolves `req.locale` from the client's `Accept-Language` header before
 * anything else runs, so even a pre-auth error (a bad login, a malformed
 * register request) comes back in the language the client's own picker is
 * set to. `requireAuth` overwrites this with the signed-in user's stored
 * `locale` once it loads the account, which takes precedence because it
 * survives a client that forgets to send the header.
 */
export const resolveRequestLocale: RequestHandler = (req, _res, next) => {
  req.locale = resolveAcceptLanguage(req.header('accept-language'));
  next();
};
