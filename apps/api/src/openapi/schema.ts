import { z, type ZodType } from 'zod/v4';

/**
 * The Zod-to-JSON-Schema half of the generator.
 *
 * `io: 'input'` is not a preference, it is the whole trick. An OpenAPI request
 * body describes what a caller *sends*, and the API's money fields end in
 * `.transform(money)` — so their output type is not their input type, and
 * asking for the output throws `Transforms cannot be represented in JSON
 * Schema`. Describing the input is both what OpenAPI wants and the only thing
 * that converts.
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
