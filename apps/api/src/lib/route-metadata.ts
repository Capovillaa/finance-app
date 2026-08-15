import type { RequestHandler, Router } from 'express';
import type { MemberRole } from '../db/types.js';
import type { ResponseDeclarations } from '../middleware/responds.js';
import type { ValidationSchemas } from '../middleware/validate.js';

/**
 * What the app records about its own shape, so the OpenAPI document can be
 * generated from the router that actually boots rather than from a list someone
 * maintains by hand.
 *
 * Two things have to be recorded, because neither can be recovered by
 * inspection:
 *
 * 1. **What a middleware knows.** `validate(...)` and `requireRole(...)` are
 *    arrow functions returned from factories, so every one of them reaches the
 *    router as an anonymous handler — the request schema and the required role
 *    are closed over and invisible. They are stamped on the way out instead.
 * 2. **Where a router is mounted.** Express keeps only a compiled `RegExp`, and
 *    a mounted parameter arrives as `/workspaces(?:/([^/]+?))/accounts`.
 *    Unescaping that is a heuristic waiting to break, and there is no need to
 *    try: `mount()` remembers the literal string it was handed.
 *
 * A `WeakMap` is used rather than assigning properties onto the handlers so the
 * running app is not carrying documentation fields on objects Express also
 * inspects; the entries live exactly as long as the handlers do.
 */

export interface RouteMetadata {
  /** The schemas a `validate()` handler will parse `body` / `query` / `params` with. */
  schemas?: ValidationSchemas;
  /** What a `responds()` handler declares — and, under test, enforces — the route returns. */
  responses?: ResponseDeclarations;
  /** The minimum workspace role a `requireRole()` handler enforces. */
  role?: MemberRole;
  /** Set by `requireAuth`: everything at or below this point needs a bearer token. */
  authenticated?: true;
  /** Set by a rate limiter: everything at or below this point can be refused with a 429. */
  rateLimited?: true;
}

export interface MountInfo {
  /** The literal path the router was mounted at, exactly as written. */
  prefix: string;
  /** What the middleware guarding this mount enforces on everything inside it. */
  inherited: RouteMetadata;
  /**
   * The guards themselves, in the order Express will hold them, so the walker
   * can recognise their layers by position. They cannot be recognised by
   * identity alone: `requireAuth` is a single shared object that also serves as
   * ordinary middleware inside several routers, and treating every occurrence of
   * it as a mount guard would drop authentication from those routes.
   */
  guards: RequestHandler[];
}

const ROUTE_METADATA = new WeakMap<RequestHandler, RouteMetadata>();
const MOUNTS = new WeakMap<object, MountInfo>();

/** Records what a handler enforces, and returns it unchanged for direct export. */
export function stampRoute<T extends RequestHandler>(handler: T, metadata: RouteMetadata): T {
  ROUTE_METADATA.set(handler, { ...ROUTE_METADATA.get(handler), ...metadata });
  return handler;
}

export function routeMetadata(handler: unknown): RouteMetadata | undefined {
  return typeof handler === 'function' ? ROUTE_METADATA.get(handler as RequestHandler) : undefined;
}

/** An Express router carries the stack of layers it will dispatch through. */
function isRouter(handler: unknown): handler is Router {
  return typeof handler === 'function' && Array.isArray((handler as { stack?: unknown }).stack);
}

type MountTarget = { use: (path: string, ...handlers: RequestHandler[]) => unknown };

/**
 * `parent.use(prefix, ...handlers)`, remembering `prefix` for any router among
 * the handlers. Every mount in this app goes through here — the sixteen in
 * `routes.ts` and the `/api/v1` one in `app.ts` — which is what lets the walker
 * assemble an exact path with nothing inferred.
 *
 * Middleware passed alongside a router (`mount(apiRouter, '/workspaces',
 * requireAuth, workspaceScoped)`) is recorded *against that router* rather than
 * left to be picked up positionally. Express applies such a guard to every
 * later sibling under the same prefix, so a walker that accumulated it while
 * scanning the stack would mark whatever gets mounted next as authenticated
 * too — right today only because nothing follows it.
 */
export function mount(parent: MountTarget, prefix: string, ...handlers: RequestHandler[]): void {
  const routers = handlers.filter(isRouter);
  const guards = handlers.filter((handler) => !isRouter(handler));

  const inherited = guards.reduce<RouteMetadata>(
    (merged, guard) => ({ ...merged, ...ROUTE_METADATA.get(guard) }),
    {},
  );

  for (const router of routers) MOUNTS.set(router, { prefix, inherited, guards });

  parent.use(prefix, ...handlers);
}

export function mountInfo(router: unknown): MountInfo | undefined {
  return typeof router === 'function' || (typeof router === 'object' && router !== null)
    ? MOUNTS.get(router as object)
    : undefined;
}
