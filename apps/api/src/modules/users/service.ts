import { db } from '../../db/client.js';

/**
 * Everything the platform holds about one person, for the GDPR export
 * endpoint. Scoped to workspaces the user belongs to, and deliberately excludes
 * other members' personal details.
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const user = await db
    .selectFrom('users')
    .select([
      'id',
      'email',
      'full_name',
      'locale',
      'timezone',
      'base_currency',
      'created_at',
      'last_login_at',
    ])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();

  const memberships = await db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .select([
      'workspaces.id as workspace_id',
      'workspaces.name as workspace_name',
      'workspace_members.role as role',
      'workspace_members.joined_at as joined_at',
    ])
    .where('workspace_members.user_id', '=', userId)
    .execute();

  const workspaceIds = memberships.map((m) => m.workspace_id);
  const empty: never[] = [];

  const [transactions, comments, notifications, splits] = await Promise.all([
    workspaceIds.length
      ? db
          .selectFrom('transactions')
          .select([
            'id',
            'workspace_id',
            'occurred_on',
            'description',
            'amount',
            'currency',
            'type',
            'status',
            'created_at',
          ])
          .where('workspace_id', 'in', workspaceIds)
          .where('created_by', '=', userId)
          .execute()
      : empty,
    workspaceIds.length
      ? db
          .selectFrom('transaction_comments')
          .select(['id', 'transaction_id', 'body', 'created_at'])
          .where('user_id', '=', userId)
          .execute()
      : empty,
    db
      .selectFrom('notifications')
      .select(['id', 'type', 'title', 'message', 'created_at', 'read_at'])
      .where('user_id', '=', userId)
      .execute(),
    db
      .selectFrom('transaction_splits')
      .select(['id', 'transaction_id', 'share_amount', 'settled_at'])
      .where('user_id', '=', userId)
      .execute(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: user,
    workspaces: memberships,
    transactionsCreated: transactions,
    comments,
    notifications,
    expenseShares: splits,
  };
}
