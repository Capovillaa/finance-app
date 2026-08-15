import { z } from 'zod/v4';

/**
 * The three routes the app declares about itself, rather than about the domain.
 *
 * They live here rather than in a `modules/<domain>/responses.ts` because they
 * have no module: `app.ts` mounts them directly, outside `/api/v1`, and the
 * walker groups them under the synthetic `service` tag. Nothing here is a
 * `component()` — a health payload is not a concept a caller models, it is a
 * thing they read once.
 */

export const healthResponse = z
  .object({
    status: z.literal('ok'),
    uptime: z.number().describe('Seconds since this process started.'),
    env: z.enum(['development', 'test', 'production']),
  })
  .describe('Liveness. Deliberately dependency-free, so a database blip cannot get a healthy container restarted.');

export const readinessResponse = z
  .object({
    status: z.enum(['ready', 'degraded']),
    database: z.enum(['ok', 'down']),
    redis: z.enum(['ok', 'down']),
  })
  .describe('Readiness: whether this instance can actually serve traffic. Answers 503 when it cannot.');

/**
 * This document. Described loosely on purpose — publishing an OpenAPI schema for
 * OpenAPI itself would be circular and would have to be maintained by hand
 * against a specification nobody here owns.
 */
export const openApiDocumentResponse = z
  .looseObject({ openapi: z.string() })
  .describe('This document, built from the live app. Byte-identical to the committed `docs/openapi.json`.');
