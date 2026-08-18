import { DEFAULT_LOCALE, t, type Locale } from './i18n.js';

/**
 * Every error surfaced to a client goes through this taxonomy so the HTTP layer
 * never has to guess a status code and internal details never leak.
 */
export const ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthorized',
  'invalid_credentials',
  'token_expired',
  'forbidden',
  'not_found',
  'conflict',
  'unprocessable',
  'rate_limited',
  'internal_error',
  'service_unavailable',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Exported so the generated OpenAPI document describes the real taxonomy. */
export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  invalid_credentials: 401,
  token_expired: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
};

export interface FieldIssue {
  path: string;
  message: string;
}

/**
 * Carries a translation key rather than a literal message, so the same error can
 * be rendered in whichever locale the request resolves to (see `middleware/locale.ts`)
 * without the throw site knowing anything about languages. `.message` (from the
 * base `Error`) is always the English rendering, for logs and stack traces.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: FieldIssue[] | undefined;
  readonly expose: boolean;
  readonly messageKey: string;
  readonly messageParams: Record<string, unknown> | undefined;
  /**
   * Text this app did not write, kept for the log line and **never sent to a
   * client**. It is `Error.message` — which is what the error handler logs —
   * and `localize()` deliberately ignores it.
   *
   * It used to be the response message whenever it was present, on the
   * reasoning that a Postgres `detail` is already English and not meaningfully
   * translatable. What that overlooked is *what* Postgres puts in it: a unique
   * violation reads `Key (email)=(someone@example.com) already exists.` and a
   * foreign-key violation names the table it looked in. Since `expose` is
   * `status < 500` and these map to 409, 422 and 400, the API was handing every
   * caller its column names, its constraint names, and values belonging to rows
   * they cannot otherwise see. There is no version of that which is worth the
   * extra specificity, so the generic `database.*` message goes out instead and
   * the detail stays in the log, correlated by `requestId`.
   */
  readonly internalDetail: string | undefined;

  constructor(
    code: ErrorCode,
    messageKey: string,
    messageParams?: Record<string, unknown>,
    details?: FieldIssue[],
    internalDetail?: string,
  ) {
    super(internalDetail ?? t(DEFAULT_LOCALE, messageKey, messageParams));
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
    this.expose = this.status < 500;
    this.messageKey = messageKey;
    this.messageParams = messageParams;
    this.internalDetail = internalDetail;
    Error.captureStackTrace?.(this, AppError);
  }

  /**
   * Renders this error's message in `locale`, for the HTTP response body.
   *
   * Always from the catalogue. Anything a client reads is wording this codebase
   * chose and translated; `internalDetail` never reaches here.
   */
  localize(locale: Locale): string {
    return t(locale, this.messageKey, this.messageParams);
  }
}

export const badRequest = (key: string, params?: Record<string, unknown>, details?: FieldIssue[]) =>
  new AppError('bad_request', key, params, details);
export const validationFailed = (
  key = 'common.validationFailed',
  params?: Record<string, unknown>,
  details?: FieldIssue[],
) => new AppError('validation_failed', key, params, details);
export const unauthorized = (key = 'common.unauthorized', params?: Record<string, unknown>) =>
  new AppError('unauthorized', key, params);
export const invalidCredentials = (key = 'auth.invalidCredentials', params?: Record<string, unknown>) =>
  new AppError('invalid_credentials', key, params);
export const forbidden = (key = 'common.forbidden', params?: Record<string, unknown>) =>
  new AppError('forbidden', key, params);
/** `resourceKey` is a translation key for the noun, e.g. `resources.account`. */
export const notFound = (resourceKey = 'resources.resource') =>
  new AppError('not_found', 'common.notFound', { resourceKey });
export const routeNotFound = (method: string, path: string) =>
  new AppError('not_found', 'common.routeNotFound', { method, path });
export const conflict = (key: string, params?: Record<string, unknown>) =>
  new AppError('conflict', key, params);
export const unprocessable = (key: string, params?: Record<string, unknown>, details?: FieldIssue[]) =>
  new AppError('unprocessable', key, params, details);
export const rateLimited = (key = 'common.rateLimited', params?: Record<string, unknown>) =>
  new AppError('rate_limited', key, params);

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Maps well-known Postgres error codes onto the taxonomy above.
 *
 * The driver's `detail` is carried as `internalDetail`, which means it reaches
 * the log line and nothing else — see the field's own comment for why that is
 * not a lost opportunity. The `P0001` branch is our own trigger text rather than
 * Postgres's, and it is treated the same way on purpose: every case those
 * triggers catch is already rejected earlier, in the service, with a translated
 * message (`categories.depthLimit` and friends), so the trigger is a backstop
 * against a race or a hand-written statement and the caller has no use for its
 * developer-facing wording.
 */
export function fromDatabaseError(err: unknown): AppError | null {
  if (typeof err !== 'object' || err === null || !('code' in err)) return null;
  const pgCode = String((err as { code: unknown }).code);
  const detail = 'detail' in err ? String((err as { detail: unknown }).detail ?? '') : '';

  switch (pgCode) {
    case '23505': // unique_violation
      return detail
        ? new AppError('conflict', 'database.conflict', undefined, undefined, detail)
        : conflict('database.conflict');
    case '23503': // foreign_key_violation
      return detail
        ? new AppError('unprocessable', 'database.foreignKey', undefined, undefined, detail)
        : unprocessable('database.foreignKey');
    case '23514': // check_violation
      return detail
        ? new AppError('unprocessable', 'database.constraint', undefined, undefined, detail)
        : unprocessable('database.constraint');
    case '23502': // not_null_violation
      return detail
        ? new AppError('bad_request', 'database.notNull', undefined, undefined, detail)
        : badRequest('database.notNull');
    case '22P02': // invalid_text_representation
      return badRequest('database.malformed');
    case '40001': // serialization_failure
      return conflict('database.serialization');
    case 'P0001': // raise_exception from our trigger functions
      return new AppError(
        'unprocessable',
        'database.rejected',
        undefined,
        undefined,
        'message' in err ? String((err as { message: unknown }).message) : undefined,
      );
    default:
      return null;
  }
}
