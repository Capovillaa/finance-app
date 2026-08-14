import { db, type Executor } from '../../db/client.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import type { CategoryKind } from '../../db/types.js';
import {
  DEFAULT_CATEGORY_TEMPLATE,
  templateLabel,
  type CategoryTemplateNode,
} from './defaults.js';

export interface CategoryRecord {
  id: string;
  parentId: string | null;
  name: string;
  kind: CategoryKind;
  depth: number;
  color: string | null;
  icon: string | null;
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
}

export interface CategoryNode extends CategoryRecord {
  children: CategoryNode[];
}

/** Seeds the default hierarchy into a freshly created workspace. */
export async function seedDefaultCategories(
  workspaceId: string,
  locale: string,
  executor: Executor = db,
): Promise<number> {
  let created = 0;

  const insertLevel = async (nodes: CategoryTemplateNode[], parentId: string | null): Promise<void> => {
    for (const [index, node] of nodes.entries()) {
      const row = await executor
        .insertInto('categories')
        .values({
          workspace_id: workspaceId,
          parent_id: parentId,
          name: templateLabel(node, locale),
          kind: node.kind,
          color: node.color,
          icon: node.icon ?? null,
          is_system: true,
          sort_order: index,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      created += 1;

      if (node.children?.length) await insertLevel(node.children, row.id);
    }
  };

  await insertLevel(DEFAULT_CATEGORY_TEMPLATE, null);
  return created;
}

export async function listCategories(
  workspaceId: string,
  options: { includeArchived?: boolean; kind?: CategoryKind } = {},
): Promise<CategoryRecord[]> {
  let query = db.selectFrom('categories').selectAll().where('workspace_id', '=', workspaceId);
  if (!options.includeArchived) query = query.where('is_archived', '=', false);
  if (options.kind) query = query.where('kind', '=', options.kind);

  const rows = await query.orderBy('depth', 'asc').orderBy('sort_order', 'asc').orderBy('name', 'asc').execute();

  return rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    depth: row.depth,
    color: row.color,
    icon: row.icon,
    isSystem: row.is_system,
    isArchived: row.is_archived,
    sortOrder: row.sort_order,
  }));
}

/** Assembles the flat rows into the nested tree the UI renders. */
export function buildTree(records: CategoryRecord[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const record of records) nodes.set(record.id, { ...record, children: [] });

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId) {
      const parent = nodes.get(node.parentId);
      // A parent filtered out by the query (archived) leaves its child at the
      // top level rather than dropping it from the response entirely.
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: CategoryNode[]): void => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const node of list) sortNodes(node.children);
  };
  sortNodes(roots);

  return roots;
}

export async function getCategory(workspaceId: string, categoryId: string): Promise<CategoryRecord> {
  const row = await db
    .selectFrom('categories')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', categoryId)
    .executeTakeFirst();

  if (!row) throw notFound('resources.category');

  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    depth: row.depth,
    color: row.color,
    icon: row.icon,
    isSystem: row.is_system,
    isArchived: row.is_archived,
    sortOrder: row.sort_order,
  };
}

/**
 * Every descendant id of a category, inclusive. Budgets and reports use this to
 * roll spending on `Food > Groceries > Supermarket` up into `Food`.
 */
export async function descendantIds(
  workspaceId: string,
  categoryId: string,
  executor: Executor = db,
): Promise<string[]> {
  const rows = await executor
    .withRecursive('tree', (qb) =>
      qb
        .selectFrom('categories')
        .select(['id'])
        .where('id', '=', categoryId)
        .where('workspace_id', '=', workspaceId)
        .unionAll((inner) =>
          inner
            .selectFrom('categories as c')
            .select(['c.id'])
            .innerJoin('tree', 'tree.id', 'c.parent_id'),
        ),
    )
    .selectFrom('tree')
    .select('id')
    .execute();

  return rows.map((r) => r.id);
}

export interface CreateCategoryInput {
  workspaceId: string;
  parentId?: string | null;
  name: string;
  kind?: CategoryKind;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export async function createCategory(input: CreateCategoryInput): Promise<CategoryRecord> {
  const parent = input.parentId ? await getCategory(input.workspaceId, input.parentId) : null;

  if (parent) {
    if (parent.depth >= 2) throw unprocessable('categories.depthLimit');
    // A child of an income category must also be income, or reports double-count.
    if (input.kind && input.kind !== parent.kind) {
      throw unprocessable('categories.childKindMismatch', { kindKey: `common.transactionKind.${parent.kind}` });
    }
  }

  const parentKind = parent?.kind;

  const row = await db
    .insertInto('categories')
    .values({
      workspace_id: input.workspaceId,
      parent_id: input.parentId ?? null,
      name: input.name.trim(),
      kind: parentKind ?? input.kind ?? 'expense',
      color: input.color ?? null,
      icon: input.icon ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    depth: row.depth,
    color: row.color,
    icon: row.icon,
    isSystem: row.is_system,
    isArchived: row.is_archived,
    sortOrder: row.sort_order,
  };
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string | null;
  icon?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isArchived?: boolean;
}

export async function updateCategory(
  workspaceId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<CategoryRecord> {
  await getCategory(workspaceId, categoryId);

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === categoryId) throw unprocessable('categories.selfParent');
    // Re-parenting into your own subtree would create a cycle the database
    // trigger cannot see (it only checks the immediate parent).
    const subtree = await descendantIds(workspaceId, categoryId);
    if (subtree.includes(input.parentId)) {
      throw unprocessable('categories.cyclicParent');
    }
    const parent = await getCategory(workspaceId, input.parentId);
    if (parent.depth >= 2) throw unprocessable('categories.depthLimit');
  }

  const row = await db
    .updateTable('categories')
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.parentId !== undefined ? { parent_id: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      ...(input.isArchived !== undefined ? { is_archived: input.isArchived } : {}),
    })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', categoryId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    depth: row.depth,
    color: row.color,
    icon: row.icon,
    isSystem: row.is_system,
    isArchived: row.is_archived,
    sortOrder: row.sort_order,
  };
}

/**
 * Deletes a category outright only when nothing references it; otherwise the
 * caller is told to archive instead, so historical reports keep their labels.
 */
export async function deleteCategory(workspaceId: string, categoryId: string): Promise<void> {
  await getCategory(workspaceId, categoryId);
  const ids = await descendantIds(workspaceId, categoryId);

  const [transactionCount, budgetCount] = await Promise.all([
    db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('workspace_id', '=', workspaceId)
      .where('category_id', 'in', ids)
      .executeTakeFirst(),
    db
      .selectFrom('budget_lines')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('workspace_id', '=', workspaceId)
      .where('category_id', 'in', ids)
      .executeTakeFirst(),
  ]);

  if (Number(transactionCount?.count ?? 0) > 0) {
    throw conflict('categories.inUseTransactions');
  }
  if (Number(budgetCount?.count ?? 0) > 0) {
    throw conflict('categories.inUseBudget');
  }

  await db.deleteFrom('categories').where('workspace_id', '=', workspaceId).where('id', '=', categoryId).execute();
}
