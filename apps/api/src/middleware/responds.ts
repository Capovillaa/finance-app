import type { Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod/v4';
import { env } from '../config/env.js';
import { stampRoute } from '../lib/route-metadata.js';

/**
 * What a route sends back, declared beside the route that sends it.
 *
 * `validate()` describes the request; this describes the response. It is the
 * same trick — an anonymous handler stamped with what it knows — so the OpenAPI
 * generator can read a route's success shape the same way it already reads the
 * request's.
 *
 * Two things make this more than documentation:
 *
 * 1. **A response schema describes the JSON that leaves the process**, not the
 *    object the handler passed to `res.json()`. Those differ: a `timestamp`
 *    column arrives from `pg` as a JS `Date` and only becomes an ISO string when
 *    Express serialises it. Checking the serialised form is what lets the schema
 *    say `string, format: date-time` and mean it — which is exactly what the
 *    generated client types need it to mean.
 * 2. **Under `NODE_ENV=test` the declaration is enforced.** Every response goes
 *    through its own schema before it is sent, and a mismatch fails the request
 *    loudly. Authoring a response schema by hand is guesswork otherwise, and a
 *    spec that describes a shape the API does not return is worse than one that
 *    describes nothing: the integration suite is what keeps this one honest.
 *    Outside tests `responds()` is a `next()` and costs nothing.
 */

/** A response with no body at all — a 204, or a 304. */
export const NO_BODY = { kind: 'none' } as const;

export interface MediaResponse {
  kind: 'media';
  /** The `content` key the operation publishes, e.g. `text/csv`. */
  contentType: string;
  description: string;
}

/**
 * A body this generator does not describe with a schema — a CSV export, or
 * anything else that is not modelled JSON. The content type is published; the
 * bytes are not.
 */
export function media(contentType: string, description: string): MediaResponse {
  return { kind: 'media', contentType, description };
}

export type ResponseBody = ZodType | typeof NO_BODY | MediaResponse;

/** Status code to what that status returns. Numeric keys, as OpenAPI spells them. */
export type ResponseDeclarations = Record<number, ResponseBody>;

export function isSchemaBody(body: ResponseBody): body is ZodType {
  return typeof (body as { safeParse?: unknown }).safeParse === 'function';
}

export function isNoBody(body: ResponseBody): body is typeof NO_BODY {
  return !isSchemaBody(body) && body.kind === 'none';
}

/**
 * Declares what a route returns, and — under test — proves it.
 *
 * ```ts
 * accountRouter.get('/', requireViewer, responds({ 200: accountListResponse }), handler)
 * accountRouter.delete('/:id', requireAdmin, responds({ 204: NO_BODY }), handler)
 * ```
 */
export function responds(declarations: ResponseDeclarations): RequestHandler {
  const handler: RequestHandler = env.isTest
    ? (req, res, next) => {
        enforce(req, res, declarations);
        next();
      }
    : (_req, _res, next) => {
        next();
      };

  return stampRoute(handler, { responses: declarations });
}

/**
 * Wraps `res.json` and `res.send` for the life of one request.
 *
 * Both are wrapped because a route can answer either way, and `res.json`
 * delegates to `res.send` internally — hence the latch, so one response is not
 * checked twice, the second time against its own serialised text.
 */
function enforce(req: Request, res: Response, declarations: ResponseDeclarations): void {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let sentAsJson = false;

  res.json = (body?: unknown) => {
    sentAsJson = true;
    check(req, res, declarations, body, true);
    return originalJson(body);
  };

  res.send = (body?: unknown) => {
    if (!sentAsJson) check(req, res, declarations, body, false);
    return originalSend(body);
  };
}

function check(
  req: Request,
  res: Response,
  declarations: ResponseDeclarations,
  body: unknown,
  asJson: boolean,
): void {
  const status = res.statusCode;
  const declared = declarations[status];

  if (!declared) {
    // The error envelope is described once, in components, and is the same for
    // every route — there is nothing per-route to check. An *undeclared success*
    // is a different matter: it means the route and its declaration disagree
    // about what happens when things go right, which is precisely the drift this
    // whole mechanism exists to catch.
    if (status >= 400) return;
    fail(req, status, `returned ${status}, which it does not declare.`);
  }

  // `RESPONSE_REACH=1 npx vitest run 2>&1 | grep -o "REACH .*" | sort -u`
  // lists every declaration the suite actually exercises. Strictness is only
  // half the guarantee: a schema no test ever reaches has been asserted by
  // nobody, and the difference between this list and the declared set is the
  // gap that `tests/integration/response-contracts.test.ts` exists to close.
  if (process.env.RESPONSE_REACH) {
    process.stderr.write(`REACH ${req.method} ${req.baseUrl}${req.route?.path ?? ''} ${status}\n`);
  }

  if (isNoBody(declared)) {
    if (body !== undefined && body !== null && body !== '') {
      fail(req, status, `declares no body for ${status} but sent one.`);
    }
    return;
  }

  if (!isSchemaBody(declared)) return; // A media response: the bytes are not modelled.

  if (!asJson) {
    fail(req, status, `declares a JSON schema for ${status} but answered with res.send().`);
  }

  // The schema describes the wire, so it is checked against the wire: the same
  // round trip Express is about to perform, with Dates already ISO strings.
  const result = declared.safeParse(JSON.parse(JSON.stringify(body)));
  if (!result.success) {
    fail(
      req,
      status,
      `returned a ${status} body that does not match its declared schema:\n` +
        result.error.issues
          .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('\n'),
    );
  }
}

function fail(req: Request, status: number, detail: string): never {
  const message = `${req.method} ${req.originalUrl} ${detail}`;
  // Written straight to stderr as well as thrown: the throw becomes a 500 whose
  // stack the test can read, but a banner in the runner's output is what makes
  // the cause obvious at a glance rather than after unpicking an unexpected 500.
  process.stderr.write(`\n[response contract] ${message}\n\n`);
  throw new Error(`Response contract violated — ${message} (status ${status})`);
}
