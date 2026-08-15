/**
 * Every bound the API enforces on a request, in one table.
 *
 * These numbers used to exist twice — once in an `apps/api` route file and once,
 * retyped by hand, in the matching `apps/web` form schema. They drifted: the
 * client let a recurring schedule run 99 days ahead of a server that caps it at
 * 90, put no ceiling at all on an occurrence limit the server caps at 1000, and
 * never mentioned the 100-line cap on a budget. Each of those is a form that
 * accepts input the API then rejects, so the user learns about the rule from a
 * failed round trip instead of from the field they are typing in.
 *
 * A bound belongs here as soon as both sides need to agree on it. Reading a
 * number from this table costs nothing; restating it is what costs.
 */
export const LIMITS = {
  /** Display names: accounts, budgets, goals, recurring rules, workspaces, people. */
  name: { min: 1, max: 120 },
  /** A ledger line's own description. */
  description: { min: 1, max: 200 },
  /** A goal's prose description, which is a paragraph rather than a label. */
  longDescription: { max: 1000 },
  notes: { max: 2000 },
  merchant: { max: 120 },
  institution: { max: 120 },
  /** A stored colour is a token or hex string, never a full CSS value. */
  color: { max: 20 },
  icon: { max: 40 },
  /** Free text attached to an audited change, e.g. why a budget limit moved. */
  reason: { max: 300 },
  /** What the user noticed while matching a statement against the ledger. */
  reconciliationNotes: { max: 500 },
  tagName: { min: 1, max: 40 },
  email: { max: 254 },
  password: { min: 10, max: 200 },
  /** An IANA zone name, e.g. `America/Sao_Paulo`. */
  timezone: { max: 60 },
  /** A BCP 47 tag, e.g. `pt-BR`. */
  locale: { max: 10 },
  url: { max: 500 },
  /** Free-text search over the ledger. */
  search: { max: 200 },

  /**
   * Money is `NUMERIC(19,4)` in Postgres. The 15 integer digits and 4 decimals
   * below are what that column actually holds, and `MONEY_PATTERN` in
   * `patterns.ts` is generated from them so the regex cannot drift from the
   * column it is protecting.
   */
  money: { integerDigits: 15, decimals: 4 },

  dayOfMonth: { min: 1, max: 31 },
  monthOfYear: { min: 1, max: 12 },
  /** `Date#getDay()` order: 0 is Sunday, matching the stored `by_weekday`. */
  weekday: { min: 0, max: 6 },
  percent: { min: 1, max: 100 },
  /** A goal's priority, 1 being the most important. */
  priority: { min: 1, max: 5 },

  /** Category lines on one budget. */
  budgetLines: { min: 1, max: 100 },

  /** Days between occurrences of a `custom` recurrence. */
  recurringInterval: { min: 1, max: 365 },
  /** How many times a schedule may fire before it stops on its own. */
  occurrenceLimit: { min: 1, max: 1000 },
  /** How many days ahead of the due date a schedule is posted or announced. */
  leadTimeDays: { min: 0, max: 90 },
  /** A weekly rule can name every day, but not the same day twice. */
  weekdaysPerRule: { max: 7 },

  tagsPerTransaction: { max: 20 },
  /** Rows one bulk operation may touch. */
  bulkTransactions: { min: 1, max: 500 },
  splitNote: { max: 200 },
  commentBody: { min: 1, max: 2000 },
  goalContributionNote: { max: 300 },

  /** The opaque token carried by an invitation email. */
  invitationToken: { min: 10, max: 200 },
  /** An audit entry's entity discriminator, e.g. `transaction`. */
  entityType: { max: 40 },
} as const;

/** An ISO 4217 code is always three letters; nothing configurable about it. */
export const CURRENCY_CODE_LENGTH = 3;
