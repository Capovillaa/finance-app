import type { Express } from 'express';
import { createRequire } from 'node:module';
import { globalRegistry, type ZodType } from 'zod/v4';
import { env } from '../config/env.js';
import { ERROR_CODES, STATUS_BY_CODE, type ErrorCode } from '../lib/errors.js';
import { isNoBody, isSchemaBody, type ResponseDeclarations } from '../middleware/responds.js';
import { mergeObjectShapes, toJsonSchema, toResponseJsonSchema, type JsonSchema } from './schema.js';
import { walkRoutes, type RouteRecord } from './walk.js';

/**
 * Builds the OpenAPI 3.1 document from the running app.
 *
 * Requests were always describable: every rule in this API is a Zod schema
 * already, so paths, parameters, bodies, security and the error envelope come
 * out of code that runs. **Responses had no schemas at all** — services return
 * Kysely rows and routes `res.json()` them — so each one had to be authored, and
 * is, beside the service that produces it in `modules/<domain>/responses.ts`.
 *
 * A route that has been given a `responds()` publishes its real success shape. A
 * route that has not still publishes the `2XX` placeholder, which says what is
 * known rather than guessing; `responseCoverage()` reports how many of each
 * there are, so the gap is a number rather than an impression.
 */

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

const SECURITY_SCHEME = 'bearerAuth';

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/** Status codes that any authenticated, validating or rate-limited route can return. */
const ERROR_RESPONSE_NAMES: Partial<Record<ErrorCode, string>> = {
  bad_request: 'BadRequest',
  unauthorized: 'Unauthorized',
  forbidden: 'Forbidden',
  not_found: 'NotFound',
  conflict: 'Conflict',
  validation_failed: 'ValidationFailed',
  rate_limited: 'RateLimited',
  internal_error: 'InternalError',
};

const ERROR_DESCRIPTIONS: Record<string, string> = {
  BadRequest: 'The request was malformed — unparseable JSON, or a value the database refused outright.',
  Unauthorized: 'No bearer token was sent, or it has expired or belongs to an inactive account.',
  Forbidden: 'The caller is authenticated but lacks the required role in this workspace.',
  NotFound: 'No such resource, or none the caller is allowed to know exists.',
  Conflict: 'The write collided with an existing row, such as a duplicate name.',
  ValidationFailed:
    'One or more fields were rejected. `error.details` names each one, already translated into the ' +
    'language resolved for the request.',
  RateLimited: 'Too many requests; the caller has exceeded the rate limit for this window.',
  InternalError: 'Something failed inside the API. The message is fixed and the detail stays in the logs.',
};

function errorSchema(): JsonSchema {
  return {
    type: 'object',
    required: ['error'],
    additionalProperties: false,
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: {
            type: 'string',
            enum: [...ERROR_CODES],
            description: 'The stable, machine-readable member of the error taxonomy.',
          },
          message: {
            type: 'string',
            description:
              'A sentence for a person, rendered in the locale resolved from the profile or `Accept-Language`. ' +
              'Match on `code`, never on this.',
          },
          details: {
            type: 'array',
            description: 'Present on a field-validation failure: one entry per rejected field.',
            items: {
              type: 'object',
              required: ['path', 'message'],
              properties: {
                path: { type: 'string', description: 'Dotted path, prefixed by the request part: `body.name`.' },
                message: { type: 'string' },
              },
            },
          },
          requestId: {
            type: 'string',
            description: 'Correlates the response with the server log line; also sent as `x-request-id`.',
          },
        },
      },
    },
  };
}

/** `/api/v1/workspaces/{workspaceId}/accounts/{id}` -> `getWorkspacesByWorkspaceIdAccountsById`. */
function operationId(route: RouteRecord): string {
  const segments = route.path
    .split('/')
    .filter((segment) => segment && segment !== 'api' && segment !== 'v1')
    .map((segment) => {
      const parameter = segment.match(/^\{(.+)\}$/);
      return parameter ? `by-${parameter[1]}` : segment;
    });

  const name = segments
    .join('-')
    // `/openapi.json` is a path segment with a dot in it; an operationId is a
    // name, so anything that is not a word character becomes a word boundary.
    .split(/[^A-Za-z0-9]/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join('');

  return `${route.method}${name[0]!.toUpperCase()}${name.slice(1)}`;
}

/** Operations are grouped the way the codebase is: one tag per API module. */
function tagFor(route: RouteRecord): string {
  return route.module;
}

function parametersFor(route: RouteRecord): JsonSchema[] {
  const parameters: JsonSchema[] = [];
  const pathShape = mergeObjectShapes(route.params);

  for (const match of route.path.matchAll(/\{(\w+)\}/g)) {
    const name = match[1]!;
    const schema = pathShape.properties[name] ?? { type: 'string' };
    const { description, ...rest } = schema;
    parameters.push({
      name,
      in: 'path',
      required: true,
      ...(description ? { description } : {}),
      schema: rest,
    });
  }

  const queryShape = mergeObjectShapes(route.query);
  for (const [name, schema] of Object.entries(queryShape.properties)) {
    const { description, ...rest } = schema;
    parameters.push({
      name,
      in: 'query',
      required: queryShape.required.has(name),
      ...(description ? { description } : {}),
      schema: rest,
    });
  }

  return parameters;
}

/** What a status means when the schema does not say something better. */
const STATUS_TEXT: Record<string, string> = {
  '200': 'Success.',
  '201': 'Created.',
  '202': 'Accepted.',
  '204': 'No content.',
  '503': 'Service unavailable.',
};

/**
 * The success half of an operation's responses.
 *
 * Named schemas reached on the way are merged into `components`, which the
 * caller owns: `Account` is authored once and referenced from the five
 * operations that return one, so it has to be collected across the whole walk
 * rather than per operation.
 */
function successResponses(
  declarations: ResponseDeclarations | undefined,
  components: Record<string, JsonSchema>,
): Record<string, JsonSchema> {
  if (!declarations) {
    return {
      '2XX': {
        description:
          'The request succeeded. This route has no response schema yet, so its shape is not described ' +
          'here — read `docs/api.md` for it.',
      },
    };
  }

  const responses: Record<string, JsonSchema> = {};

  for (const [status, body] of Object.entries(declarations)) {
    const fallback = STATUS_TEXT[status] ?? 'Success.';

    if (isNoBody(body)) {
      responses[status] = { description: fallback };
      continue;
    }

    if (!isSchemaBody(body)) {
      responses[status] = {
        description: body.description,
        content: { [body.contentType]: { schema: { type: 'string' } } },
      };
      continue;
    }

    const { schema, components: reached } = toResponseJsonSchema(body);

    for (const [id, definition] of Object.entries(reached)) {
      const existing = components[id];
      if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) {
        throw new Error(`Two different response schemas were published as component "${id}".`);
      }
      components[id] = definition;
    }

    // An envelope's own `.describe()` becomes the response's description, where
    // OpenAPI wants it; leaving a copy on the schema too would print it twice.
    const described = descriptionOf(body);
    if (described !== undefined && schema.description === described) delete schema.description;

    responses[status] = {
      description: described ?? fallback,
      content: { 'application/json': { schema } },
    };
  }

  return responses;
}

/** A response schema's own `.describe()`, used as the response object's description. */
function descriptionOf(schema: ZodType): string | undefined {
  const meta = globalRegistry.get(schema) as { description?: string } | undefined;
  return meta?.description;
}

function responsesFor(route: RouteRecord, components: Record<string, JsonSchema>): Record<string, JsonSchema> {
  const named = ['InternalError'];
  if (route.rateLimited) named.push('RateLimited');
  if (route.authenticated) named.push('Unauthorized');
  if (route.role) named.push('Forbidden');
  if (route.path.includes('{')) named.push('NotFound');
  if (route.params.length > 0 || route.query.length > 0 || route.body) {
    named.push('ValidationFailed', 'BadRequest');
  }
  // A unique violation is mapped to 409 wherever it surfaces, so the signal is
  // the method writing at all rather than the request carrying a body.
  if (WRITE_METHODS.has(route.method)) named.push('Conflict');

  const responses = successResponses(route.responses, components);

  const statusFor = (name: string): string => {
    const code = (Object.keys(ERROR_RESPONSE_NAMES) as ErrorCode[]).find(
      (candidate) => ERROR_RESPONSE_NAMES[candidate] === name,
    )!;
    return String(STATUS_BY_CODE[code]);
  };

  for (const name of named) responses[statusFor(name)] = { $ref: `#/components/responses/${name}` };

  return responses;
}

function operationFor(route: RouteRecord, components: Record<string, JsonSchema>): JsonSchema {
  const parameters = parametersFor(route);

  return {
    operationId: operationId(route),
    tags: [tagFor(route)],
    ...(route.role
      ? { description: `Requires the \`${route.role}\` role or higher in the workspace.` }
      : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: toJsonSchema(route.body) } },
          },
        }
      : {}),
    responses: responsesFor(route, components),
    ...(route.authenticated ? { security: [{ [SECURITY_SCHEME]: [] }] } : { security: [] }),
  };
}

/** How much of the router describes what it returns. Reported by the generate script. */
export function responseCoverage(app: Express): { described: number; total: number } {
  const routes = walkRoutes(app);
  return { described: routes.filter((route) => route.responses).length, total: routes.length };
}

export function buildDocument(app: Express): JsonSchema {
  const routes = walkRoutes(app);
  const paths: Record<string, Record<string, JsonSchema>> = {};
  const schemas: Record<string, JsonSchema> = {};

  for (const route of routes) {
    paths[route.path] ??= {};
    paths[route.path]![route.method] = operationFor(route, schemas);
  }

  const responses: Record<string, JsonSchema> = {};
  for (const name of Object.values(ERROR_RESPONSE_NAMES)) {
    responses[name] = {
      description: ERROR_DESCRIPTIONS[name] ?? 'Error.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
  }

  const tags = [...new Set(routes.map(tagFor))].sort().map((name) => ({ name }));

  return {
    openapi: '3.1.0',
    info: {
      title: 'Finance App API',
      version,
      description:
        'Personal finance management platform.\n\n' +
        'This document is **generated from the running Express app** by `npm run generate:openapi`, ' +
        'so the paths, parameters and request bodies below are the ones the server actually enforces. ' +
        'It is committed to the repository and checked in CI, which is what stops it from drifting.\n\n' +
        'Money crosses this API as a **decimal string**, never a JSON number. Every amount is stored as ' +
        '`NUMERIC(19,4)`.\n\n' +
        'Response schemas are authored beside the service that produces the row, and are checked against ' +
        'real responses by the test suite. An operation that still answers `2XX` with no content is one ' +
        'whose shape has not been described yet.',
    },
    servers: [{ url: env.API_BASE_URL }],
    tags,
    components: {
      securitySchemes: {
        [SECURITY_SCHEME]: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'A short-lived access token from `POST /api/v1/auth/login` or `/auth/refresh`. ' +
            'Refresh tokens are opaque, rotate on every use, and are tracked in families.',
        },
      },
      // Sorted so the component list is stable whatever order the walk reached
      // them in; a reordered file would otherwise look like a contract change.
      schemas: Object.fromEntries(
        [['Error', errorSchema()] as const, ...Object.entries(schemas)].sort(([a], [b]) => a.localeCompare(b)),
      ),
      responses,
    },
    security: [],
    paths,
  };
}
