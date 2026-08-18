import request, { type Agent } from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { upsertRates } from '../src/modules/currencies/service.js';

let cachedApp: Express | null = null;

export function app(): Express {
  cachedApp ??= createApp();
  return cachedApp;
}

export const api = (): Agent => request(app());

export interface TestUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  accessToken: string;
  refreshToken: string;
  workspaceId: string;
  /** Authorization header for this user, ready to spread into a request. */
  auth: { Authorization: string };
}

let userCounter = 0;

export async function registerUser(
  overrides: Partial<{ email: string; fullName: string; password: string; skipEmailVerification: boolean }> = {},
): Promise<TestUser> {
  userCounter += 1;
  const email = overrides.email ?? `user${userCounter}.${Date.now()}@example.com`;
  const password = overrides.password ?? 'Sup3rSecret123';
  const fullName = overrides.fullName ?? `Test User ${userCounter}`;

  const response = await api().post('/api/v1/auth/register').send({ email, password, fullName });

  if (response.status !== 201) {
    throw new Error(`registerUser failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  // Most tests have nothing to do with email verification and just want a
  // working account — e.g. one that can accept a workspace invitation, which
  // is gated on a verified address. Tests that specifically exercise the
  // unverified state opt out with `skipEmailVerification`.
  if (!overrides.skipEmailVerification) {
    await db
      .updateTable('users')
      .set({ email_verified_at: new Date() })
      .where('id', '=', response.body.user.id)
      .execute();
  }

  return {
    id: response.body.user.id,
    email,
    password,
    fullName,
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
    workspaceId: response.body.defaultWorkspaceId,
    auth: { Authorization: `Bearer ${response.body.accessToken}` },
  };
}

/** Finds a seeded default category by name (the template is in English/pt-BR). */
export async function findCategory(workspaceId: string, name: string): Promise<string> {
  const row = await db
    .selectFrom('categories')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('name', '=', name)
    .executeTakeFirst();

  if (!row) throw new Error(`Category "${name}" not found in workspace ${workspaceId}`);
  return row.id;
}

export async function createAccount(
  user: TestUser,
  overrides: Partial<{ name: string; type: string; currency: string; initialBalance: string }> = {},
): Promise<{ id: string; currency: string }> {
  const response = await api()
    .post(`/api/v1/workspaces/${user.workspaceId}/accounts`)
    .set(user.auth)
    .send({
      name: overrides.name ?? `Account ${Math.random().toString(36).slice(2, 8)}`,
      type: overrides.type ?? 'checking',
      currency: overrides.currency ?? 'BRL',
      initialBalance: overrides.initialBalance ?? '0',
    });

  if (response.status !== 201) {
    throw new Error(`createAccount failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { id: response.body.account.id, currency: response.body.account.currency };
}

export async function createTransaction(
  user: TestUser,
  accountId: string,
  overrides: Partial<{
    type: 'income' | 'expense';
    amount: string;
    description: string;
    occurredOn: string;
    categoryId: string | null;
    status: string;
  }> = {},
) {
  const response = await api()
    .post(`/api/v1/workspaces/${user.workspaceId}/transactions`)
    .set(user.auth)
    .send({
      accountId,
      type: overrides.type ?? 'expense',
      amount: overrides.amount ?? '100.00',
      description: overrides.description ?? 'Test transaction',
      occurredOn: overrides.occurredOn ?? new Date().toISOString().slice(0, 10),
      ...(overrides.categoryId !== undefined ? { categoryId: overrides.categoryId } : {}),
      ...(overrides.status ? { status: overrides.status } : {}),
    });

  if (response.status !== 201) {
    throw new Error(`createTransaction failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.transaction;
}

/** Seeds a BRL->USD rate so multi-currency paths have something to convert with. */
export async function seedExchangeRates(asOf = '2020-01-01'): Promise<void> {
  await upsertRates([
    { baseCode: 'BRL', quoteCode: 'USD', rate: '0.2000', asOf, source: 'test' },
    { baseCode: 'BRL', quoteCode: 'EUR', rate: '0.1800', asOf, source: 'test' },
  ]);
}

export const isoDate = (date: Date = new Date()): string => date.toISOString().slice(0, 10);

export function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
}
