import { env } from '../config/env.js';
import { db, closeDatabase } from './client.js';
import { addDays, addMonths, startOfMonth, today } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { hashPassword } from '../modules/auth/password.js';
import { createAccount } from '../modules/accounts/service.js';
import { createBudget } from '../modules/budgets/service.js';
import { refreshStaticRates } from '../modules/currencies/service.js';
import { createGoal, addContribution } from '../modules/goals/service.js';
import { createRecurring } from '../modules/recurring/service.js';
import { createTransaction, createTransfer } from '../modules/transactions/service.js';
import { createWorkspace, addMember } from '../modules/workspaces/service.js';
import { evaluateWorkspaceAlerts } from '../modules/alerts/engine.js';

/**
 * Builds a realistic demo dataset: one personal workspace with a year of
 * history, and one shared family workspace with two members. Safe to re-run —
 * it clears the demo users first.
 */

const DEMO_PASSWORD = 'Demo1234567';

const DEMO_USERS = [
  { email: 'ana@demo.local', fullName: 'Ana Souza' },
  { email: 'bruno@demo.local', fullName: 'Bruno Souza' },
];

async function categoryId(workspaceId: string, name: string): Promise<string> {
  const row = await db
    .selectFrom('categories')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('name', '=', name)
    .executeTakeFirst();
  if (!row) throw new Error(`Seed expected category "${name}"`);
  return row.id;
}

function randomBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

/**
 * Two accounts whose password is printed in a public repository, and a reset
 * step that deletes from `users`. Both are correct for demo data and neither is
 * survivable against a real database, so this refuses to run against one.
 *
 * `NODE_ENV` alone is not the check that matters. Nobody sets `NODE_ENV` before
 * typing `npm run seed`; what they get wrong is `DATABASE_URL` — a shell that
 * still has production's exported, a `.env` copied from the wrong place. So the
 * target database has to look local as well, and anything else has to be said
 * out loud with `--i-know-this-is-not-a-demo-database`.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);
const OVERRIDE_FLAG = '--i-know-this-is-not-a-demo-database';

function refuseUnlessDemoDatabase(): void {
  if (env.isProduction) {
    throw new Error(
      'Refusing to seed with NODE_ENV=production. This script creates accounts whose password is\n' +
        'published on GitHub, and clears existing demo users first.',
    );
  }

  if (process.argv.includes(OVERRIDE_FLAG)) {
    logger.warn('Seeding a non-local database because the override flag was given');
    return;
  }

  let host: string;
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    throw new Error(`Refusing to seed: DATABASE_URL is not a URL this script can inspect.`);
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed the database at "${host}": it does not look like a local one.\n\n` +
        'This script creates ana@demo.local and bruno@demo.local with a password published on\n' +
        `GitHub, and deletes any existing rows for them first. If you really mean it, re-run with\n` +
        `${OVERRIDE_FLAG}.`,
    );
  }
}

async function main(): Promise<void> {
  refuseUnlessDemoDatabase();

  logger.info('Seeding demo data...');

  await db
    .deleteFrom('workspaces')
    .where(
      'owner_id',
      'in',
      db.selectFrom('users').select('id').where('email', 'in', DEMO_USERS.map((u) => u.email)),
    )
    .execute();
  await db.deleteFrom('users').where('email', 'in', DEMO_USERS.map((u) => u.email)).execute();
  await refreshStaticRates(addMonths(today('UTC'), -13));

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const users = [];
  for (const demo of DEMO_USERS) {
    const user = await db
      .insertInto('users')
      .values({
        email: demo.email,
        password_hash: passwordHash,
        full_name: demo.fullName,
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        base_currency: 'BRL',
        email_verified_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    users.push(user);
  }

  const [ana, bruno] = users;
  if (!ana || !bruno) throw new Error('Failed to create demo users');

  // --- Ana's personal workspace ------------------------------------------
  const personal = await createWorkspace({
    name: 'Finanças da Ana',
    type: 'personal',
    ownerId: ana.id,
    baseCurrency: 'BRL',
    locale: 'pt-BR',
  });

  const checking = await createAccount({
    workspaceId: personal.id,
    name: 'Conta Corrente',
    type: 'checking',
    currency: 'BRL',
    institution: 'Nubank',
    initialBalance: '3500.00',
    createdBy: ana.id,
  });

  const savings = await createAccount({
    workspaceId: personal.id,
    name: 'Poupança',
    type: 'savings',
    currency: 'BRL',
    initialBalance: '12000.00',
    createdBy: ana.id,
  });

  const card = await createAccount({
    workspaceId: personal.id,
    name: 'Cartão de Crédito',
    type: 'credit_card',
    currency: 'BRL',
    creditLimit: '8000.00',
    statementDay: 20,
    dueDay: 28,
    createdBy: ana.id,
  });

  const usd = await createAccount({
    workspaceId: personal.id,
    name: 'Conta em Dólar',
    type: 'investment',
    currency: 'USD',
    initialBalance: '1500.00',
    createdBy: ana.id,
  });

  const categories = {
    salary: await categoryId(personal.id, 'Salário'),
    supermarket: await categoryId(personal.id, 'Supermercado'),
    restaurants: await categoryId(personal.id, 'Restaurantes'),
    rent: await categoryId(personal.id, 'Aluguel'),
    electricity: await categoryId(personal.id, 'Energia'),
    internet: await categoryId(personal.id, 'Internet'),
    fuel: await categoryId(personal.id, 'Combustível'),
    streaming: await categoryId(personal.id, 'Streaming'),
    pharmacy: await categoryId(personal.id, 'Farmácia'),
    gym: await categoryId(personal.id, 'Academia'),
  };

  // Twelve months of history so the trend and anomaly features have something
  // to work with on first login.
  let created = 0;
  for (let monthOffset = 11; monthOffset >= 0; monthOffset -= 1) {
    const monthStart = startOfMonth(addMonths(today('UTC'), -monthOffset));

    await createTransaction({
      workspaceId: personal.id,
      baseCurrency: 'BRL',
      accountId: checking.id,
      categoryId: categories.salary,
      type: 'income',
      amount: '8500.00',
      description: 'Salário mensal',
      occurredOn: addDays(monthStart, 4),
      createdBy: ana.id,
      skipActivity: true,
    });

    const fixed: [string, string, string][] = [
      [categories.rent, '2200.00', 'Aluguel'],
      [categories.internet, '129.90', 'Internet fibra'],
      [categories.streaming, '55.90', 'Streaming'],
      [categories.gym, '119.00', 'Academia'],
    ];

    for (const [category, amount, description] of fixed) {
      await createTransaction({
        workspaceId: personal.id,
        baseCurrency: 'BRL',
        accountId: checking.id,
        categoryId: category,
        type: 'expense',
        amount,
        description,
        occurredOn: addDays(monthStart, 9),
        createdBy: ana.id,
        skipActivity: true,
      });
      created += 1;
    }

    await createTransaction({
      workspaceId: personal.id,
      baseCurrency: 'BRL',
      accountId: checking.id,
      categoryId: categories.electricity,
      type: 'expense',
      amount: String(randomBetween(120, 260)),
      description: 'Conta de luz',
      occurredOn: addDays(monthStart, 14),
      createdBy: ana.id,
      skipActivity: true,
    });

    // Variable spending on the credit card. The most recent month runs hot on
    // groceries so the unusual-spending detector has a real signal to find.
    const groceryTrips = 4;
    const groceryBase = monthOffset === 0 ? 520 : 210;
    for (let trip = 0; trip < groceryTrips; trip += 1) {
      await createTransaction({
        workspaceId: personal.id,
        baseCurrency: 'BRL',
        accountId: card.id,
        categoryId: categories.supermarket,
        type: 'expense',
        amount: String(randomBetween(groceryBase * 0.85, groceryBase * 1.15)),
        description: 'Supermercado',
        merchant: 'Pão de Açúcar',
        occurredOn: addDays(monthStart, 3 + trip * 7),
        createdBy: ana.id,
        skipActivity: true,
      });
      created += 1;
    }

    for (const [category, description, min, max] of [
      [categories.restaurants, 'Restaurante', 45, 180],
      [categories.fuel, 'Posto de combustível', 150, 320],
      [categories.pharmacy, 'Farmácia', 30, 140],
    ] as [string, string, number, number][]) {
      await createTransaction({
        workspaceId: personal.id,
        baseCurrency: 'BRL',
        accountId: card.id,
        categoryId: category,
        type: 'expense',
        amount: String(randomBetween(min, max)),
        description,
        occurredOn: addDays(monthStart, 18),
        createdBy: ana.id,
        skipActivity: true,
      });
      created += 1;
    }

    await createTransfer({
      workspaceId: personal.id,
      baseCurrency: 'BRL',
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amount: '800.00',
      description: 'Reserva mensal',
      occurredOn: addDays(monthStart, 6),
      createdBy: ana.id,
    });
  }

  // A cross-currency transfer, so the multi-currency path is exercised.
  await createTransfer({
    workspaceId: personal.id,
    baseCurrency: 'BRL',
    fromAccountId: checking.id,
    toAccountId: usd.id,
    amount: '1000.00',
    description: 'Compra de dólar',
    occurredOn: addDays(today('UTC'), -20),
    createdBy: ana.id,
  });

  await createBudget({
    workspaceId: personal.id,
    baseCurrency: 'BRL',
    name: 'Orçamento mensal',
    period: 'monthly',
    startDate: startOfMonth(today('UTC')),
    createdBy: ana.id,
    lines: [
      { categoryId: await categoryId(personal.id, 'Alimentação'), limitAmount: '1500.00' },
      { categoryId: await categoryId(personal.id, 'Transporte'), limitAmount: '600.00' },
      { categoryId: await categoryId(personal.id, 'Lazer'), limitAmount: '400.00' },
      { categoryId: await categoryId(personal.id, 'Saúde'), limitAmount: '500.00' },
    ],
  });

  await createRecurring({
    workspaceId: personal.id,
    accountId: checking.id,
    categoryId: categories.rent,
    name: 'Aluguel',
    type: 'expense',
    amount: '2200.00',
    description: 'Aluguel do apartamento',
    frequency: 'monthly',
    dayOfMonth: 10,
    startDate: startOfMonth(today('UTC')),
    autoPost: false,
    leadTimeDays: 5,
    createdBy: ana.id,
  });

  await createRecurring({
    workspaceId: personal.id,
    accountId: checking.id,
    categoryId: categories.salary,
    name: 'Salário',
    type: 'income',
    amount: '8500.00',
    description: 'Salário mensal',
    frequency: 'monthly',
    dayOfMonth: 5,
    startDate: startOfMonth(today('UTC')),
    autoPost: true,
    createdBy: ana.id,
  });

  const emergency = await createGoal({
    workspaceId: personal.id,
    name: 'Reserva de emergência',
    category: 'emergency_fund',
    targetAmount: '30000.00',
    currency: 'BRL',
    targetDate: addMonths(today('UTC'), 12),
    accountId: savings.id,
    priority: 1,
    createdBy: ana.id,
  });
  await addContribution({
    workspaceId: personal.id,
    goalId: emergency.id,
    amount: '12000.00',
    createdBy: ana.id,
    note: 'Saldo inicial da poupança',
  });

  await createGoal({
    workspaceId: personal.id,
    name: 'Viagem para o Chile',
    category: 'vacation',
    targetAmount: '15000.00',
    currency: 'BRL',
    targetDate: addMonths(today('UTC'), 8),
    priority: 2,
    createdBy: ana.id,
  });

  // --- Shared family workspace -------------------------------------------
  const shared = await createWorkspace({
    name: 'Casa Souza',
    type: 'shared',
    ownerId: ana.id,
    baseCurrency: 'BRL',
    locale: 'pt-BR',
  });
  await addMember(shared.id, bruno.id, 'editor', ana.id);

  const joint = await createAccount({
    workspaceId: shared.id,
    name: 'Conta Conjunta',
    type: 'checking',
    currency: 'BRL',
    initialBalance: '5000.00',
    createdBy: ana.id,
  });

  const sharedGroceries = await categoryId(shared.id, 'Supermercado');
  const sharedUtilities = await categoryId(shared.id, 'Energia');

  for (let i = 0; i < 8; i += 1) {
    await createTransaction({
      workspaceId: shared.id,
      baseCurrency: 'BRL',
      accountId: joint.id,
      categoryId: i % 2 === 0 ? sharedGroceries : sharedUtilities,
      type: 'expense',
      amount: String(randomBetween(80, 400)),
      description: i % 2 === 0 ? 'Compras da casa' : 'Conta de luz',
      occurredOn: addDays(today('UTC'), -i * 5),
      createdBy: i % 2 === 0 ? ana.id : bruno.id,
      skipActivity: true,
    });
    created += 1;
  }

  await createBudget({
    workspaceId: shared.id,
    baseCurrency: 'BRL',
    name: 'Orçamento da casa',
    period: 'monthly',
    startDate: startOfMonth(today('UTC')),
    createdBy: ana.id,
    lines: [
      { categoryId: await categoryId(shared.id, 'Alimentação'), limitAmount: '1200.00' },
      { categoryId: await categoryId(shared.id, 'Moradia'), limitAmount: '900.00' },
    ],
  });

  // Populate the notification inbox so the demo has something to show.
  const personalAlerts = await evaluateWorkspaceAlerts(personal.id);
  const sharedAlerts = await evaluateWorkspaceAlerts(shared.id);

  logger.info(
    {
      transactions: created,
      notifications: personalAlerts.notificationsCreated + sharedAlerts.notificationsCreated,
    },
    'Seed complete',
  );

  console.log('\nDemo accounts (password for both: %s)', DEMO_PASSWORD);
  for (const user of DEMO_USERS) console.log(`  ${user.email}`);
  console.log('');
}

main()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
