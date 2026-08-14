import { uuidField } from '@finance/schemas';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { validationFailed, type FieldIssue } from '../lib/errors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Parses and *replaces* the request parts with their validated output, so
 * handlers work with typed, coerced data and never re-read raw input.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const issues: FieldIssue[] = [];

    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (result.success) {
        // Express 4 defines `query` as a getter on some versions; assigning via
        // defineProperty keeps the parsed value regardless.
        Object.defineProperty(req, key, {
          value: result.data,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        issues.push(...toIssues(result.error).map((i) => ({ ...i, path: `${key}.${i.path}` })));
      }
    }

    if (issues.length > 0) {
      next(validationFailed('common.validationFailed', undefined, issues));
      return;
    }
    next();
  };
}

/** Typed accessors, since Express's own generics do not flow through `validate`. */
export const body = <T>(req: Request): T => req.body as T;
export const query = <T>(req: Request): T => req.query as unknown as T;
export const params = <T>(req: Request): T => req.params as unknown as T;

export const uuidSchema = uuidField;
export const idParamSchema = z.object({ id: uuidSchema });
