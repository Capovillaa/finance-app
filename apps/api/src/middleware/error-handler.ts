import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError, fromDatabaseError, isAppError, routeNotFound, validationFailed } from '../lib/errors.js';
import { DEFAULT_LOCALE, t } from '../lib/i18n.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(routeNotFound(req.method, req.path));
};

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
      // Internal failures return a fixed message; the real one stays in the logs.
      message: appError.expose ? appError.localize(locale) : t(locale, 'common.internal'),
      ...(appError.details ? { details: appError.details } : {}),
      requestId: req.requestId,
      ...(env.isProduction || appError.expose ? {} : { stack: (err as Error)?.stack }),
    },
  });
};

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
