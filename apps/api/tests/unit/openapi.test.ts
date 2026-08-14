/**
 * The generated OpenAPI document, checked without a database.
 *
 * Generating walks the router and converts schemas — no connection is opened —
 * but `config/env.ts` parses the environment at import time and refuses to load
 * without these. CI's `check` job has no Postgres to point at, so they are
 * stubbed here for the same reason the generate script stubs them.
 *
 * The app is pulled in with `await import` rather than a static import because
 * `import` statements are hoisted: written as one, `config/env.ts` would be
 * evaluated *before* the assignments below and this file would only pass on a
 * machine that happens to have a `.env`.
 */
process.env.DATABASE_URL ??= 'postgres://openapi:openapi@localhost:5432/openapi_not_connected';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-placeholder-secret';
process.env.JWT_REFRESH_SECRET ??= 'openapi-generation-placeholder-secret';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const { createApp } = await import('../../src/app.js');
const { buildDocument } = await import('../../src/openapi/document.js');
const { walkRoutes } = await import('../../src/openapi/walk.js');

const app = createApp();
const routes = walkRoutes(app);
const document = buildDocument(app) as {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown>; responses: Record<string, unknown> };
  tags: { name: string }[];
};

interface Operation {
  operationId: string;
  tags: string[];
  security: { bearerAuth?: unknown[] }[];
  parameters?: { name: string; in: string; required?: boolean; schema: Record<string, unknown> }[];
  requestBody?: { content: { 'application/json': { schema: Record<string, unknown> } } };
  responses: Record<string, unknown>;
}

const operations = Object.entries(document.paths).flatMap(([routePath, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ routePath, method, operation })),
);

describe('the generated document', () => {
  it('is OpenAPI 3.1 with the pieces a 3.1 document must have', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.title).toBeTruthy();
    // A version of `undefined` would mean the package.json read silently failed.
    expect(document.info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(document.paths).toBeTypeOf('object');
    expect(document.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('serialises to JSON, which is how it is committed and served', () => {
    expect(() => JSON.parse(JSON.stringify(document))).not.toThrow();
  });
});

describe('coverage of the real router', () => {
  it('publishes every route the app has, exactly once', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(operations).toHaveLength(routes.length);

    for (const route of routes) {
      expect(document.paths[route.path], `${route.method} ${route.path} is missing`).toBeDefined();
      expect(document.paths[route.path]![route.method]).toBeDefined();
    }
  });

  it('gives every operation a unique operationId, usable as an identifier', () => {
    const ids = operations.map(({ operation }) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });

  it('tags every operation with a module that the document also declares', () => {
    const declared = new Set(document.tags.map((tag) => tag.name));
    for (const { operation, routePath, method } of operations) {
      expect(operation.tags, `${method} ${routePath}`).toHaveLength(1);
      expect(declared).toContain(operation.tags[0]);
    }
  });
});

describe('paths and parameters', () => {
  it('declares a parameter object for every placeholder in every path', () => {
    for (const { routePath, method, operation } of operations) {
      const placeholders = [...routePath.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      const declared = (operation.parameters ?? [])
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name);

      expect(declared.sort(), `${method} ${routePath}`).toEqual([...placeholders].sort());
    }
  });

  it('marks every path parameter required, as OpenAPI demands', () => {
    for (const { operation } of operations) {
      for (const parameter of operation.parameters ?? []) {
        if (parameter.in === 'path') expect(parameter.required).toBe(true);
      }
    }
  });

  it('describes a workspace id as a uuid rather than a bare string', () => {
    const operation = document.paths['/api/v1/workspaces/{workspaceId}/accounts']!.get!;
    const parameter = operation.parameters!.find((candidate) => candidate.name === 'workspaceId');
    expect(parameter!.schema).toMatchObject({ type: 'string', format: 'uuid' });
  });
});

describe('security', () => {
  it('requires a bearer token on an authenticated route and not on a public one', () => {
    const authenticated = document.paths['/api/v1/workspaces/{workspaceId}/accounts']!.get!;
    expect(authenticated.security).toEqual([{ bearerAuth: [] }]);

    expect(document.paths['/api/v1/auth/login']!.post!.security).toEqual([]);
    expect(document.paths['/health']!.get!.security).toEqual([]);
  });

  it('carries the security requirement and a 403 on a route behind requireEditor', () => {
    // POST /accounts is `requireEditor` in modules/accounts/routes.ts.
    const operation = document.paths['/api/v1/workspaces/{workspaceId}/accounts']!.post!;
    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation.responses['403']).toEqual({ $ref: '#/components/responses/Forbidden' });
    expect(operation).toMatchObject({ description: expect.stringContaining('editor') });
  });

  it('agrees with the walker about which routes are public', () => {
    for (const route of routes) {
      const operation = document.paths[route.path]![route.method]!;
      expect(operation.security, `${route.method} ${route.path}`).toEqual(
        route.authenticated ? [{ bearerAuth: [] }] : [],
      );
    }
  });
});

describe('errors', () => {
  it('describes the envelope once and refers to it from every error response', () => {
    expect(document.components.schemas.Error).toMatchObject({ type: 'object', required: ['error'] });

    for (const { operation } of operations) {
      for (const [status, response] of Object.entries(operation.responses)) {
        if (status === '2XX') continue;
        expect(response).toMatchObject({ $ref: expect.stringMatching(/^#\/components\/responses\//) });
        const name = (response as { $ref: string }).$ref.split('/').pop()!;
        expect(document.components.responses[name], `${name} is referenced but not defined`).toBeDefined();
      }
    }
  });

  it('gives a 429 only to routes that a rate limiter actually guards', () => {
    expect(document.paths['/api/v1/auth/login']!.post!.responses['429']).toBeDefined();
    // `/health` sits outside `/api/v1`, where the global limiter is mounted.
    expect(document.paths['/health']!.get!.responses['429']).toBeUndefined();
  });
});

describe('the rules that JSON Schema would otherwise drop', () => {
  /**
   * The regression test for the trap this generator was designed around: a
   * `.refine()` is invisible to `toJSONSchema`, so a money field left alone
   * publishes as "a string or a number" with no mention of the decimal format.
   */
  it('keeps the money pattern in a request body', () => {
    const body = document.paths['/api/v1/workspaces/{workspaceId}/accounts']!.post!.requestBody!.content[
      'application/json'
    ].schema as { properties: Record<string, { pattern?: string; description?: string }> };

    expect(body.properties.initialBalance!.pattern).toBe('^-?\\d{1,15}(\\.\\d{1,4})?$');
    expect(body.properties.initialBalance!.description).toContain('NUMERIC(19,4)');
  });

  it('keeps the date pattern, and says in prose what the pattern cannot', () => {
    const body = document.paths['/api/v1/workspaces/{workspaceId}/transactions']!.post!.requestBody!.content[
      'application/json'
    ].schema as { properties: Record<string, { pattern?: string; description?: string }> };

    expect(body.properties.occurredOn!.pattern).toBe('^\\d{4}-\\d{2}-\\d{2}$');
    expect(body.properties.occurredOn!.description).toContain('2025-02-30');
  });

  it('describes an input, not an output — a transform cannot be represented at all', () => {
    // `moneySchema` ends in `.transform(money)`; the body still converts, which
    // is the whole reason the generator asks for `io: 'input'`.
    const body = document.paths['/api/v1/workspaces/{workspaceId}/accounts']!.post!.requestBody!.content[
      'application/json'
    ].schema as { properties: Record<string, { anyOf?: unknown[] }> };

    expect(body.properties.initialBalance!.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
  });
});

describe('the committed copy', () => {
  it('matches what the app generates right now', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const committed = await readFile(path.resolve(here, '../../../../docs/openapi.json'), 'utf8');

    expect(
      JSON.parse(committed),
      'docs/openapi.json is stale — run `npm run generate:openapi` and commit the result',
    ).toEqual(JSON.parse(JSON.stringify(document)));
  });
});
