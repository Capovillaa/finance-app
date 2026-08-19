import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { sentInTests } from '../../src/lib/email.js';
import { api, registerUser } from '../helpers.js';

describe('POST /auth/register', () => {
  it('creates the account, a personal workspace and the default categories', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'ana@example.com', password: 'Sup3rSecret123', fullName: 'Ana Souza' });

    expect(response.status).toBe(201);
    // Registration never returns a body — see the `describe` block below on
    // why (M-9 in AUDIT_REPORT.md) — so what it did is checked in the
    // database rather than in the response.
    expect(response.body).toEqual({});

    const user = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'ana@example.com')
      .executeTakeFirstOrThrow();
    const workspace = await db
      .selectFrom('workspace_members')
      .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
      .select('workspaces.id')
      .where('workspace_members.user_id', '=', user.id)
      .executeTakeFirstOrThrow();

    const categories = await db
      .selectFrom('categories')
      .select('id')
      .where('workspace_id', '=', workspace.id)
      .execute();
    expect(categories.length).toBeGreaterThan(30);

    // Every new workspace also gets the default alerting switched on.
    const rules = await db
      .selectFrom('alert_rules')
      .select('type')
      .where('workspace_id', '=', workspace.id)
      .execute();
    expect(rules.length).toBeGreaterThan(0);
  });

  it('never returns the password hash', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'bob@example.com', password: 'Sup3rSecret123', fullName: 'Bob' });

    expect(response.status).toBe(201);
    expect(JSON.stringify(response.body)).not.toContain('$2a$');
  });

  /**
   * M-9 in AUDIT_REPORT.md: this used to answer 409 `auth.emailTaken` on a
   * known address — a complete enumeration oracle, bounded only by
   * `authRateLimit`'s per-address bucket. Registration now answers 201
   * either way, creates no second account, and tells the real owner instead
   * of the caller who just tried.
   */
  it('answers the same way for a duplicate email, without creating a second account or signing the caller in', async () => {
    const owner = await registerUser();
    sentInTests.length = 0;

    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: owner.email, password: 'ADifferentPassword123', fullName: 'Impostor' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({});

    const rows = await db.selectFrom('users').select('id').where('email', '=', owner.email).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(owner.id);

    // The real owner is told, not the caller — and the caller's password
    // never touched the existing account.
    const notice = sentInTests.at(-1);
    expect(notice?.to).toBe(owner.email);
    expect(notice?.subject).toBeTruthy();

    const stillWorks = await api().post('/api/v1/auth/login').send({ email: owner.email, password: owner.password });
    expect(stillWorks.status).toBe(200);

    const impostorPassword = await api()
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: 'ADifferentPassword123' });
    expect(impostorPassword.status).toBe(401);
  });

  /**
   * L-7 in AUDIT_REPORT.md: the breach check (`authService`'s
   * `rejectBreachedPassword`) calls a real third party, and is a no-op under
   * `NODE_ENV=test` for exactly the reason `sendEmail` never opens a real SMTP
   * connection there — it sits on the path `registerUser()` takes for nearly
   * every integration test in the suite. `Password12345` really is a
   * top-of-the-list breached password (verified against the live API while
   * building this), so its success here pins that the skip is doing its job;
   * `tests/unit/breach-check.test.ts` covers the check's own logic against a
   * fake fetch instead.
   */
  it('does not call the live breach-check service under NODE_ENV=test', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'commonpw@example.com', password: 'Password12345', fullName: 'Common Password' });

    expect(response.status).toBe(201);
  });

  it('rejects weak passwords', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'weak@example.com', password: 'short', fullName: 'Weak' });

    expect(response.status).toBe(422);
    expect(response.body.error.details?.[0]?.path).toContain('password');
  });

  /**
   * A rejected field is named by a catalogue key from `@finance/schemas`, and
   * the error handler resolves it in the request's own language — so the bound
   * quoted in the sentence comes from the same table that enforced it. Before
   * the shared package these came back in English whatever the client asked for.
   */
  it('answers a rejected field in the language the request asked for', async () => {
    const send = (locale: string) =>
      api()
        .post('/api/v1/auth/register')
        .set('accept-language', locale)
        .send({ email: 'weak@example.com', password: 'short', fullName: 'Weak' });

    const [english, portuguese, spanish] = await Promise.all([send('en'), send('pt-BR'), send('es')]);

    expect(english.body.error.details?.[0]?.message).toBe('Password must be at least 10 characters');
    expect(portuguese.body.error.details?.[0]?.message).toBe('A senha precisa ter ao menos 10 caracteres');
    expect(spanish.body.error.details?.[0]?.message).toBe('La contraseña necesita al menos 10 caracteres');
  });
});

describe('POST /auth/login', () => {
  it('issues tokens for valid credentials', async () => {
    const user = await registerUser();
    const response = await api().post('/api/v1/auth/login').send({ email: user.email, password: user.password });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.defaultWorkspaceId).toBe(user.workspaceId);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const user = await registerUser();

    const wrongPassword = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPassword123' });
    const unknownUser = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPassword123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token', async () => {
    const user = await registerUser();
    const response = await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.refreshToken).not.toBe(user.refreshToken);
    expect(response.body.accessToken).toBeTruthy();
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const user = await registerUser();

    const first = await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(200);

    // Replaying the original token is the signature of a stolen token.
    const replay = await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(replay.status).toBe(401);

    // ...and the token issued from it is dead too.
    const afterBreach = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(afterBreach.status).toBe(401);
  });

  it('rejects an unknown token', async () => {
    const response = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'a'.repeat(64) });
    expect(response.status).toBe(401);
  });
});

describe('authenticated routes', () => {
  it('requires a bearer token', async () => {
    const response = await api().get('/api/v1/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const response = await api().get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(response.status).toBe(401);
  });

  it('returns the current user', async () => {
    const user = await registerUser();
    const response = await api().get('/api/v1/auth/me').set(user.auth);

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(user.id);
  });
});

describe('session invalidation', () => {
  it('kills the access token immediately, not when it expires', async () => {
    const user = await registerUser();

    // Working before.
    expect((await api().get('/api/v1/auth/me').set(user.auth)).status).toBe(200);

    const all = await api().post('/api/v1/auth/logout-all').set(user.auth).send();
    expect(all.status).toBe(204);

    // Revoking the refresh tokens alone would leave this working for the rest
    // of ACCESS_TOKEN_TTL — a quarter of an hour in which a session the user
    // just ended is still spending their data.
    const after = await api().get('/api/v1/auth/me').set(user.auth);
    expect(after.status).toBe(401);
    expect(after.body.error.message).toMatch(/session/i);
  });

  it('lets the user sign straight back in, in the same second', async () => {
    const user = await registerUser();

    await api().post('/api/v1/auth/logout-all').set(user.auth).send();

    // The trap this guards: a cut-off compared against a JWT's whole-second
    // `iat` cannot tell a token issued just before it from one issued just
    // after, so the replacement handed out by this very login would be refused
    // by the next request. The token carries milliseconds for that reason.
    const again = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(again.status).toBe(200);

    const me = await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${again.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
  });

  it('ends one device without touching the others', async () => {
    const user = await registerUser();
    const second = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(second.status).toBe(200);

    // A plain logout revokes the presented refresh token and nothing else, so
    // the other session's access token has to survive it.
    const out = await api().post('/api/v1/auth/logout').send({ refreshToken: user.refreshToken });
    expect(out.status).toBe(204);

    const other = await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${second.body.accessToken}`);
    expect(other.status).toBe(200);
  });

  it('answers the revocation in the language the request asked for', async () => {
    const user = await registerUser();
    await api().post('/api/v1/auth/logout-all').set(user.auth).send();

    const response = await api().get('/api/v1/auth/me').set(user.auth).set('Accept-Language', 'pt-BR');
    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/sessão/i);
  });
});

describe('password change', () => {
  it('rejects a wrong current password and signs every session out on success', async () => {
    const user = await registerUser();

    const wrong = await api()
      .post('/api/v1/auth/change-password')
      .set(user.auth)
      .send({ currentPassword: 'NotMyPassword1', newPassword: 'BrandNewPass123' });
    expect(wrong.status).toBe(401);

    const changed = await api()
      .post('/api/v1/auth/change-password')
      .set(user.auth)
      .send({ currentPassword: user.password, newPassword: 'BrandNewPass123' });
    expect(changed.status).toBe(204);

    const staleRefresh = await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(staleRefresh.status).toBe(401);

    const loggedIn = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'BrandNewPass123' });
    expect(loggedIn.status).toBe(200);
  });
});
