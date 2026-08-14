import type { Migration } from 'kysely';
import * as m001 from './001_foundation.js';
import * as m002 from './002_workspaces.js';
import * as m003 from './003_accounts_categories.js';
import * as m004 from './004_transactions.js';
import * as m005 from './005_budgets_recurring_goals.js';
import * as m006 from './006_alerts_notifications_activity.js';
import * as m007 from './007_updated_at_triggers.js';
import * as m008 from './008_imports.js';

/**
 * Migrations are registered statically rather than discovered from disk: the
 * same list then works from `tsx` in development and from compiled `dist` in
 * production, with no filesystem-path or extension guessing.
 *
 * Keys are ordered lexicographically by Kysely — keep the numeric prefix.
 */
export const migrations: Record<string, Migration> = {
  '001_foundation': m001,
  '002_workspaces': m002,
  '003_accounts_categories': m003,
  '004_transactions': m004,
  '005_budgets_recurring_goals': m005,
  '006_alerts_notifications_activity': m006,
  '007_updated_at_triggers': m007,
  '008_imports': m008,
};
