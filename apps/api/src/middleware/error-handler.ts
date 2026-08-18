import { VALIDATION_NAMESPACE, validationParamsFor } from '@finance/schemas';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod/v4';
import {
  AppError,
  fromDatabaseError,
  isAppError,
  routeNotFound,
  validationFailed,
  type FieldIssue,
} from '../lib/errors.js';
import { DEFAULT_LOCALE, t, type Locale } from '../lib/i18n.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(routeNotFound(req.method, req.path));
};

/**
 * The one place an error becomes a response body, and therefore the one place
 * that decides what a caller learns about the inside of this process.
 *
 * The answer is: the taxonomy code, a sentence from the catalogue, the rejected
 * fields when there are any, and the request id. Nothing else — no stack (it
 * used to be sent outside production, which included staging and preview
 * deployments, and it carried absolute filesystem paths and the module
 * structure), and no text written by Postgres or by a trigger. All of it is in
 * the log line below, correlated by the same `requestId` the caller can quote.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalize(err);
  const locale = req.locale ?? DEFAULT_LOCALE;

  const logPayload = {
    err,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
    status: appError.status,
  };

  if (appError.status >= 500) {
    logger.error(logPayload, appError.message);
  } else {
    logger.warn(logPayload, appError.message);
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      // Two layers, and both matter. Internal failures return a fixed message
      // rather than the thrown one; and `localize()` always renders from the
      // catalogue, so even an exposed error says only what this codebase chose
      // to say. Anything a driver or a trigger wrote stays in `logPayload.err`
      // above, correlated by `requestId`.
      message: appError.expose ? appError.localize(locale) : t(locale, 'common.internal'),
      ...(appError.details ? { details: localizeIssues(appError.details, locale) } : {}),
      // The one thing a caller gets to correlate with. Everything else about
      // this failure — the stack, the driver's `detail`, the SQLSTATE, the
      // originating query — is in the log line above under this same id.
      requestId: req.requestId,
    },
  });
};

/**
 * Renders each rejected field in the caller's language.
 *
 * A schema from `@finance/schemas` names its rejection with a catalogue key
 * (`validation.amountPositive`), because the schema is built once at import and
 * cannot know what language this particular request wants. Anything that is not
 * such a key is passed through untouched: Zod's own built-in wording for a bare
 * `.max()` is English, deliberately, since the client validates and translates
 * before a request is ever sent and the server's copy is the bypassed-validation
 * edge case rather than the golden path.
 */
function localizeIssues(issues: FieldIssue[], locale: Locale): FieldIssue[] {
  return issues.map((issue) =>
    issue.message.startsWith(`${VALIDATION_NAMESPACE}.`)
      ? { ...issue, message: t(locale, issue.message, validationParamsFor(issue.message)) }
      : issue,
  );
}

function normalize(err: unknown): AppError {
  if (isAppError(err)) return err;

  if (err instanceof ZodError) {
    return validationFailed(
      'common.validationFailed',
      undefined,
      err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    );
  }

  const dbError = fromDatabaseError(err);
  if (dbError) return dbError;

  // Malformed JSON bodies surface as SyntaxError from body-parser.
  if (err instanceof SyntaxError && 'body' in err) {
    return new AppError('bad_request', 'common.malformedJson');
  }

  return new AppError(
    'internal_error',
    'common.internal',
    undefined,
    undefined,
    err instanceof Error ? err.message : 'Unknown error',
  );
}
