import { z, type ZodType } from 'zod/v4';

/**
 * The Zod-to-JSON-Schema half of the generator, in both directions.
 *
 * **Requests convert as `io: 'input'`**, which is not a preference but the whole
 * trick. An OpenAPI request body describes what a caller *sends*, and the API's
 * money fields end in `.transform(money)` — so their output type is not their
 * input type, and asking for the output throws `Transforms cannot be
 * represented in JSON Schema`. Describing the input is both what OpenAPI wants
 * and the only thing that converts.
 *
 * **Responses convert as `io: 'output'`** and additionally have to be lifted
 * into `components/schemas`, because a response schema is written once and
 * returned by several operations. See `toResponseJsonSchema` below.
 */

export type JsonSchema = Record<string, unknown>;

export interface ObjectShape {
  properties: Record<string, JsonSchema>;
  required: Set<string>;
}

/** Converts one schema, dropping the `$schema` dialect marker OpenAPI supplies itself. */
export function toJsonSchema(schema: ZodType): JsonSchema {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io: 'input' }) as JsonSchema;
  return rest;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const DEFS_PREFIX = '#/$defs/';
const COMPONENTS_PREFIX = '#/components/schemas/';

export interface ConvertedResponse {
  /** The schema to publish under the operation, usually a `$ref`. */
  schema: JsonSchema;
  /** Named schemas it reached, to be merged into `components/schemas`. */
  components: Record<string, JsonSchema>;
}

/**
 * Converts a response schema, hoisting every named piece into components.
 *
 * A schema given an `id` through `component()` is extracted by Zod into `$defs`
 * and referenced, which is exactly the shape OpenAPI wants one level up — so the
 * work here is moving those definitions from `$defs` to `components/schemas` and
 * repointing the references. Doing it this way means `Account` is written once
 * and appears once in the document however many operations return it.
 *
 * `io: 'output'` rather than the request side's `'input'`: this describes what
 * the caller receives.
 */
export function toResponseJsonSchema(schema: ZodType): ConvertedResponse {
  const { $schema: _dialect, $defs, ...root } = z.toJSONSchema(schema, { io: 'output' }) as JsonSchema & {
    $defs?: Record<string, JsonSchema>;
  };

  const { id: rootId, ...rootRest } = root;
  const self = typeof rootId === 'string' ? `${COMPONENTS_PREFIX}${rootId}` : undefined;
  const components: Record<string, JsonSchema> = {};

  for (const [id, definition] of Object.entries($defs ?? {})) {
    const { id: _named, ...rest } = definition;
    components[id] = repoint(rest, `${COMPONENTS_PREFIX}${id}`) as JsonSchema;
  }

  if (self && typeof rootId === 'string') {
    components[rootId] = repoint(rootRest, self) as JsonSchema;
    return { schema: { $ref: self }, components };
  }

  return { schema: repoint(rootRest, self) as JsonSchema, components };
}

/**
 * Rewrites the references Zod emits into the ones OpenAPI reads.
 *
 * Two forms occur. `#/$defs/Account` is a named schema, and becomes a component
 * reference. A bare `#` is a schema that refers to itself — a category and its
 * children — and only appears when that schema is the root of the conversion, so
 * it becomes a reference to wherever the root is about to live. A self-reference
 * with nowhere to point is a schema that was made recursive without being named,
 * and there is no honest way to publish it.
 */
function repoint(node: unknown, self: string | undefined): unknown {
  if (Array.isArray(node)) return node.map((item) => repoint(item, self));
  if (node === null || typeof node !== 'object') return node;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string') {
      if (value.startsWith(DEFS_PREFIX)) {
        result[key] = `${COMPONENTS_PREFIX}${value.slice(DEFS_PREFIX.length)}`;
        continue;
      }
      if (value === '#') {
        if (!self) {
          throw new Error(
            'A recursive response schema must be named with component(): ' +
              'an anonymous one can only refer to itself as "#", which points at the whole document.',
          );
        }
        result[key] = self;
        continue;
      }
    }
    result[key] = repoint(value, self);
  }
  return result;
}

/**
 * Flattens a list of object schemas into one set of properties.
 *
 * A route's `:workspaceId` is validated by the parent mount and again by the
 * route itself, so the same property legitimately arrives twice; the innermost
 * declaration wins, which is the one closest to the handler.
 */
export function mergeObjectShapes(schemas: ZodType[]): ObjectShape {
  const merged: ObjectShape = { properties: {}, required: new Set() };

  for (const schema of schemas) {
    const converted = toJsonSchema(schema);
    const properties = converted.properties as Record<string, JsonSchema> | undefined;
    if (!properties) continue;

    for (const [name, property] of Object.entries(properties)) merged.properties[name] = property;
    for (const name of (converted.required as string[] | undefined) ?? []) merged.required.add(name);
  }

  return merged;
}
