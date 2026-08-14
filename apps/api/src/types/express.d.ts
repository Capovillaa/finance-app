import type { Locale } from '../lib/i18n.js';
import type { AuthenticatedUser, WorkspaceContext } from './context.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      user?: AuthenticatedUser;
      /** Set by `withWorkspace`; carries the caller's role in that workspace. */
      workspace?: WorkspaceContext;
      /** Correlation id echoed back on the response and attached to every log line. */
      requestId?: string;
      /**
       * Set by `resolveRequestLocale` from `Accept-Language`, then overwritten by
       * `requireAuth` with the signed-in user's stored preference. Always present
       * by the time a route handler runs.
       */
      locale: Locale;
    }
  }
}

export {};
