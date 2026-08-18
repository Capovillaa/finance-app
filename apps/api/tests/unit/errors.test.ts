import { describe, expect, it } from 'vitest';
import { AppError, fromDatabaseError } from '../../src/lib/errors.js';

/**
 * What an error says to a client, versus what it says to the log.
 *
 * The distinction is the whole point of this file. A Postgres `detail` is
 * genuinely useful in a log line and is a disclosure in a response body: it
 * carries column names, constraint names, and *another row's values*. Since
 * `expose` is `status < 500` and the violations below map to 409, 422 and 400,
 * getting this wrong is not caught by anything else — the response looks helpful.
 */

/** A stand-in for the shape `pg` throws. */
const pgError = (code: string, detail: string, message = 'database error') => ({
  code,
  detail,
  message,
});

const LEAKY_DETAILS = {
  unique: 'Key (email)=(someone@example.com) already exists.',
  foreignKey: 'Key (account_id)=(2f1c…)=is not present in table "accounts".',
  check: 'Failing row contains (…, -412.9900, …).',
  notNull: 'Failing row contains (null).',
};

describe('fromDatabaseError', () => {
  it('translates the class of failure and never repeats what Postgres said', () => {
    const cases: [string, string, string][] = [
      ['23505', LEAKY_DETAILS.unique, 'A record with these values already exists'],
      ['23503', LEAKY_DETAILS.foreignKey, 'Referenced record does not exist'],
      ['23514', LEAKY_DETAILS.check, 'Value violates a database constraint'],
      ['23502', LEAKY_DETAILS.notNull, 'A required field is missing'],
    ];

    for (const [code, detail, expected] of cases) {
      const appError = fromDatabaseError(pgError(code, detail));

      expect(appError).toBeInstanceOf(AppError);
      expect(appError!.localize('en')).toBe(expected);
      expect(appError!.localize('en')).not.toContain(detail);
    }
  });

  it('keeps the detail on the error itself, which is what gets logged', () => {
    const appError = fromDatabaseError(pgError('23505', LEAKY_DETAILS.unique))!;

    // `error-handler.ts` logs the whole error and prints `appError.message`.
    expect(appError.message).toBe(LEAKY_DETAILS.unique);
    expect(appError.internalDetail).toBe(LEAKY_DETAILS.unique);
  });

  it('answers in the caller’s language, which a raw detail could never do', () => {
    const appError = fromDatabaseError(pgError('23505', LEAKY_DETAILS.unique))!;

    expect(appError.localize('pt-BR')).toBe('Já existe um registro com esses valores');
    expect(appError.localize('es')).toBe('Ya existe un registro con estos valores');
  });

  it('withholds our own trigger wording too', () => {
    // P0001 is `RAISE EXCEPTION` from a migration's trigger. Every case those
    // triggers catch is rejected earlier by the service with a translated
    // message, so this is a backstop and its wording is for us, not the caller.
    const appError = fromDatabaseError({
      code: 'P0001',
      message: 'category hierarchy is limited to three levels',
    })!;

    expect(appError.localize('en')).toBe('Operation rejected');
    expect(appError.message).toBe('category hierarchy is limited to three levels');
  });

  it('maps each code to the status its class deserves', () => {
    expect(fromDatabaseError(pgError('23505', ''))!.status).toBe(409);
    expect(fromDatabaseError(pgError('23503', ''))!.status).toBe(422);
    expect(fromDatabaseError(pgError('23514', ''))!.status).toBe(422);
    expect(fromDatabaseError(pgError('23502', ''))!.status).toBe(400);
    expect(fromDatabaseError(pgError('22P02', ''))!.status).toBe(400);
    expect(fromDatabaseError(pgError('40001', ''))!.status).toBe(409);
  });

  it('leaves anything it does not recognise to the generic 500 path', () => {
    expect(fromDatabaseError(pgError('08006', 'connection failure'))).toBeNull();
    expect(fromDatabaseError(new Error('not a database error'))).toBeNull();
    expect(fromDatabaseError(null)).toBeNull();
  });
});

describe('AppError.localize', () => {
  it('renders from the catalogue even when an internal detail is present', () => {
    const appError = new AppError(
      'conflict',
      'database.conflict',
      undefined,
      undefined,
      'Key (email)=(someone@example.com) already exists.',
    );

    expect(appError.localize('en')).toBe('A record with these values already exists');
    expect(appError.expose).toBe(true);
  });
});
