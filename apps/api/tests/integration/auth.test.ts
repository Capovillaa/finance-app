import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { api, registerUser } from '../helpers.js';

describe('POST /auth/register', () => {
  it('creates the account, a personal workspace and the default categories', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'ana@example.com', password: 'Sup3rSecret123', fullName: 'Ana Souza' });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('ana@example.com');
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.defaultWorkspaceId).toBeTruthy();

    const categories = await db
      .selectFrom('categories')
      .select('id')
      .where('workspace_id', '=', response.body.defaultWorkspaceId)
      .execute();
    expect(categories.length).toBeGreaterThan(30);

    // Every new workspace also gets the default alerting switched on.
    const rules = await db
      .selectFrom('alert_rules')
      .select('type')
      .where('workspace_id', '=', response.body.defaultWorkspaceId)
      .execute();
    expect(rules.length).toBeGreaterThan(0);
  });

  it('never returns the password hash', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'bob@example.com', password: 'Sup3rSecret123', fullName: 'Bob' });

    expect(JSON.stringify(response.body)).not.toContain('$2a$');
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    const user = await registerUser();
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: user.email, password: 'Sup3rSecret123', fullName: 'Impostor' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('conflict');
  });

  it('rejects weak passwords', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'weak@example.com', password: 'short', fullName: 'Weak' });

    expect(response.status).toBe(422);
    expect(response.body.error.details?.[0]?.path).toContain('password');
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
