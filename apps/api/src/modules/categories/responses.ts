import { z } from 'zod/v4';
import { component, integer, uuid } from '../shared/responses.js';

/**
 * What this module returns, beside the queries that build it.
 *
 * Two things here are worth reading before changing them.
 *
 * **`kind` has three members, not two.** A category may be `transfer`, which
 * the client's hand-written types never admitted — nothing renders one today,
 * but the API has always been able to return one, and a generated type that
 * said otherwise would be a lie the compiler enforced.
 *
 * **The list endpoint really does return two shapes.** `?shape=tree` nests each
 * category's children; `?shape=flat` returns the same rows with a `depth` and no
 * `children` key at all. That is a union, and it is published as one rather than
 * flattened into an optional field, because "children is sometimes missing" and
 * "children is missing exactly when you asked for flat" are different promises
 * and only the second one is true.
 */

const categoryFields = {
  id: uuid,
  parentId: uuid.nullable(),
  name: z.string(),
  kind: z.enum(['income', 'expense', 'transfer']),
  depth: integer.describe('0 for a top-level category, 2 at the deepest the schema allows.'),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  isSystem: z.boolean().describe('Seeded from the default template when the workspace was created.'),
  isArchived: z.boolean(),
  sortOrder: integer,
};

export const categorySchema = component('Category', z.object(categoryFields));

type CategoryNodeBody = z.infer<typeof categorySchema> & { children: CategoryNodeBody[] };

/**
 * The same row with its subtree attached. `children` is always present in the
 * tree shape, empty at a leaf.
 *
 * The getter is how Zod 4 expresses recursion: it defers evaluating the
 * self-reference until the schema is used, which is also what lets
 * `toJSONSchema` emit a `$ref` back to the component rather than looping.
 */
export const categoryNodeSchema: z.ZodType<CategoryNodeBody> = component(
  'CategoryNode',
  z.object({
    ...categoryFields,
    get children() {
      return z.array(categoryNodeSchema);
    },
  }),
);

export const categoryListResponse = z
  .union([
    z.object({ categories: z.array(categoryNodeSchema) }),
    z.object({ categories: z.array(categorySchema) }),
  ])
  .describe('Nested when `shape=tree`, which is the default; flat rows carrying `depth` when `shape=flat`.');

export const categoryResponse = z.object({ category: categorySchema });

/**
 * The starter hierarchy a new workspace is seeded from, offered so a client can
 * show what it will get. These are template nodes, not stored rows: they have no
 * id, and they carry both language's labels because the workspace's locale
 * decides which is written in.
 */
export const categoryTemplateNodeSchema: z.ZodType<CategoryTemplateNodeBody> = component(
  'CategoryTemplateNode',
  z.object({
    name: z.string(),
    namePtBr: z.string(),
    kind: z.enum(['income', 'expense', 'transfer']),
    color: z.string(),
    icon: z.string().optional(),
    get children() {
      return z.array(categoryTemplateNodeSchema).optional();
    },
  }),
);

interface CategoryTemplateNodeBody {
  name: string;
  namePtBr: string;
  kind: 'income' | 'expense' | 'transfer';
  color: string;
  icon?: string;
  children?: CategoryTemplateNodeBody[];
}

export const categoryTemplateResponse = z.object({ template: z.array(categoryTemplateNodeSchema) });
