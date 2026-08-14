import type { Express, RequestHandler } from 'express';
import type { ZodType } from 'zod/v4';
import type { MemberRole } from '../db/types.js';
import { mountInfo, routeMetadata, type RouteMetadata } from '../lib/route-metadata.js';

/**
 * Turns the Express app into a list of routes.
 *
 * The app is the only description of itself that cannot drift, so the document
 * is generated from the router that actually boots rather than from a
 * hand-kept list. Everything the walker needs beyond the raw stack — the
 * schemas, the required role, the literal mount prefixes — was stamped on the
 * way in by `lib/route-metadata.ts`.
 */

export interface RouteRecord {
  /** Lowercase HTTP method, as OpenAPI spells it. */
  method: string;
  /** OpenAPI-style path: `/api/v1/workspaces/{workspaceId}/accounts/{id}`. */
  path: string;
  /** Whether a bearer token is required to reach the handler. */
  authenticated: boolean;
  /** Whether a rate limiter sits in front of the handler. */
  rateLimited: boolean;
  /** The minimum workspace role, when the route is behind one. */
  role?: MemberRole;
  /**
   * The API module that owns the route, taken from the prefix its router was
   * mounted at. Reading it from the mount rather than from the path is what
   * keeps `/workspaces/{workspaceId}/members` grouped under `workspaces`, where
   * the code for it lives, instead of under a `members` module that
   * does not exist.
   */
  module: string;
  /**
   * Schemas gathered from every `validate()` on the way down, outermost first.
   * They are kept as a list rather than merged: `:workspaceId` is validated by
   * the parent mount and again by most routes, and merging Zod objects across a
   * `.refine()` wrapper is not something Zod offers.
   */
  params: ZodType[];
  query: ZodType[];
  body?: ZodType;
}

/** Express's internals, named. None of this is in `@types/express`. */
interface Layer {
  name: string;
  handle: RequestHandler & { stack?: Layer[] };
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { method?: string; handle: RequestHandler }[];
  };
}

interface Context {
  path: string;
  module: string;
  authenticated: boolean;
  rateLimited: boolean;
  role?: MemberRole;
  params: ZodType[];
  query: ZodType[];
  body?: ZodType;
}

/**
 * The owning module's name from a mount prefix: its last literal segment.
 * `/api/v1` names no module, so a mount like that leaves the current one alone.
 */
function moduleFromPrefix(prefix: string, current: string): string {
  const segments = prefix
    .split('/')
    .filter((segment) => segment && !segment.startsWith(':') && segment !== 'api' && segment !== 'v1');

  return segments[segments.length - 1] ?? current;
}

function absorb(context: Context, metadata: RouteMetadata | undefined): Context {
  if (!metadata) return context;
  const { schemas, role, authenticated, rateLimited } = metadata;
  return {
    ...context,
    authenticated: context.authenticated || authenticated === true,
    rateLimited: context.rateLimited || rateLimited === true,
    role: role ?? context.role,
    params: schemas?.params ? [...context.params, schemas.params] : context.params,
    query: schemas?.query ? [...context.query, schemas.query] : context.query,
    body: schemas?.body ?? context.body,
  };
}

/** `/workspaces/:workspaceId/accounts` -> `/workspaces/{workspaceId}/accounts`. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function joinPath(base: string, segment: string): string {
  const joined = `${base}${segment}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function isRouterLayer(layer: Layer): boolean {
  return Array.isArray(layer.handle.stack);
}

/**
 * Finds the layers that are mount guards *in this stack*.
 *
 * `mount(parent, prefix, ...guards, router)` makes Express create one layer per
 * handler, in order, so a mount's guards are the layers immediately preceding
 * its router. Matching that way rather than by handler identity is what keeps a
 * shared middleware honest: `requireAuth` guards the `/workspaces` mount and is
 * *also* ordinary middleware inside `userRouter` and others, and skipping every
 * occurrence of it published two dozen authenticated routes as public.
 */
function findMountGuardLayers(stack: Layer[]): Set<Layer> {
  const guards = new Set<Layer>();

  stack.forEach((layer, index) => {
    if (!isRouterLayer(layer)) return;
    const mounted = mountInfo(layer.handle)?.guards ?? [];

    mounted.forEach((guard, position) => {
      const candidate = stack[index - (mounted.length - position)];
      if (candidate && candidate.handle === guard) guards.add(candidate);
    });
  });

  return guards;
}

export function walkRoutes(app: Express): RouteRecord[] {
  const root = (app as unknown as { _router?: { stack: Layer[] } })._router;
  if (!root) throw new Error('Express app has no router to walk; did createApp() change?');

  const routes: RouteRecord[] = [];

  const walk = (stack: Layer[], inherited: Context): void => {
    // Express applies `use`-mounted middleware to every later sibling, so the
    // context accumulates as the stack is scanned rather than being fixed up front.
    let context = inherited;
    const guardLayers = findMountGuardLayers(stack);

    for (const layer of stack) {
      if (layer.route) {
        const routeContext = layer.route.stack.reduce(
          (acc, entry) => absorb(acc, routeMetadata(entry.handle)),
          context,
        );
        const path = joinPath(context.path, toOpenApiPath(layer.route.path));

        for (const method of Object.keys(layer.route.methods)) {
          if (method === '_all') continue;
          routes.push({
            method,
            path,
            authenticated: routeContext.authenticated,
            rateLimited: routeContext.rateLimited,
            ...(routeContext.role ? { role: routeContext.role } : {}),
            module: routeContext.module,
            params: routeContext.params,
            query: routeContext.query,
            ...(routeContext.body ? { body: routeContext.body } : {}),
          });
        }
        continue;
      }

      if (isRouterLayer(layer)) {
        const info = mountInfo(layer.handle);
        if (!info) {
          // Better to stop than to publish a path assembled from a guess.
          throw new Error(
            'Found a router mounted without mount(): its path cannot be recovered. ' +
              'Use mount() from lib/route-metadata.ts for every router mount.',
          );
        }
        walk(
          layer.handle.stack ?? [],
          absorb(
            {
              ...context,
              path: joinPath(context.path, toOpenApiPath(info.prefix)),
              module: moduleFromPrefix(info.prefix, context.module),
            },
            info.inherited,
          ),
        );
        continue;
      }

      // A guard passed to mount() is already recorded against the router it
      // guards; absorbing it here as well would apply it to later siblings.
      if (!guardLayers.has(layer)) context = absorb(context, routeMetadata(layer.handle));
    }
  };

  // `/health`, `/health/ready` and `/openapi.json` are declared on the app
  // itself rather than in a module, and sit outside the versioned API.
  walk(root.stack, {
    path: '',
    module: 'service',
    authenticated: false,
    rateLimited: false,
    params: [],
    query: [],
  });

  return routes;
}
