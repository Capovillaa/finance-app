import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { SerializedError } from '@reduxjs/toolkit';
import i18n from '../i18n';
import type { ApiErrorBody, ApiErrorDetail } from '../api/types';

export type QueryError = FetchBaseQueryError | SerializedError | undefined;

function isFetchError(error: QueryError): error is FetchBaseQueryError {
  return typeof error === 'object' && error !== null && 'status' in error;
}

function errorBody(error: QueryError): ApiErrorBody['error'] | undefined {
  if (!isFetchError(error) || !('data' in error)) return undefined;

  const data = error.data as Partial<ApiErrorBody> | undefined;
  return data && typeof data === 'object' && data.error ? data.error : undefined;
}

/**
 * A message worth showing a user.
 *
 * Every endpoint answers with the same envelope, so the server's own wording is
 * preferred — it is the only text that knows *why* the request failed. That
 * wording is English regardless of the app's language: translating it would mean
 * an i18n layer in the API, which is a separate decision (see `docs/decisions.md`).
 *
 * The messages below are the client's own, and they are translated. They cover
 * the cases where no envelope arrived at all — a dropped connection, a proxy
 * returning HTML — plus the two status codes whose meaning is entirely generic.
 *
 * `i18n.t` rather than the hook: this is a plain function called from event
 * handlers and effects, and it must not force its callers to become components.
 */
export function getApiErrorMessage(error: QueryError, fallback?: string): string {
  const body = errorBody(error);
  if (body?.message) return body.message;

  if (isFetchError(error)) {
    if (error.status === 'FETCH_ERROR') return i18n.t('errors.unreachable');
    if (error.status === 'TIMEOUT_ERROR') return i18n.t('errors.timeout');
    if (error.status === 'PARSING_ERROR') return i18n.t('errors.parsing');
    if (error.status === 429) return i18n.t('errors.tooMany');
    if (error.status === 403) return i18n.t('errors.forbidden');
  }

  if (error && 'message' in error && error.message) return error.message;

  return fallback ?? i18n.t('common.somethingWentWrong');
}

export function getApiErrorCode(error: QueryError): string | undefined {
  return errorBody(error)?.code;
}

/**
 * Field-level validation messages, keyed by form field name.
 *
 * The API reports paths as `body.amount` or `query.from`; the prefix is dropped
 * so the keys line up with React Hook Form's field names.
 */
export function getFieldErrors(error: QueryError): Record<string, string> {
  const details: ApiErrorDetail[] = errorBody(error)?.details ?? [];
  const fields: Record<string, string> = {};

  for (const detail of details) {
    const field = detail.path.replace(/^(body|query|params)\./, '');
    if (field && !fields[field]) fields[field] = detail.message;
  }

  return fields;
}
