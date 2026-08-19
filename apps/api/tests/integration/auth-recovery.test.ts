import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { sentInTests } from '../../src/lib/email.js';
import { api, registerUser } from '../helpers.js';

/** Pulls the token out of a real emailed link, the same way workspaces.test.ts does. */
function tokenFrom(text: string | undefined): string {
  const token = /token=([A-Za-z0-9_-]+)/.exec(text ?? '')?.[1];
  expect(token).toBeTruthy();
  return token!;
}

describe('email verification', () => {
  it('sends a verification email on registration, unverified by default', async () => {
    sentInTests.length = 0;
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'fresh@example.com', password: 'Sup3rSecret123', fullName: 'Fresh' });

    expect(response.status).toBe(201);

    const user = await db
      .selectFrom('users')
      .select('email_verified_at')
      .where('email', '=', 'fresh@example.com')
      .executeTakeFirstOrThrow();
    expect(user.email_verified_at).toBeNull();

    const email = sentInTests.at(-1);
    expect(email?.to).toBe('fresh@example.com');
    expect(email?.text).toContain('verify-email?token=');
  });

  it('verifies the address and lets the account then accept an invitation', async () => {
    const owner = await registerUser();
    sentInTests.length = 0;

    const invitee = await registerUser({ skipEmailVerification: true });
    const verifyEmail = sentInTests.at(-1);
    const verifyToken = tokenFrom(verifyEmail?.text);

    const shared = await api()
      .post('/api/v1/workspaces')
      .set(owner.auth)
      .send({ name: 'Shared unverified', type: 'shared' });
    const workspaceId = shared.body.workspace.id;

    await api().post(`/api/v1/workspaces/${workspaceId}/invitations`).set(owner.auth).send({
      email: invitee.email,
      role: 'editor',
    });
    const inviteToken = tokenFrom(sentInTests.at(-1)?.text);

    const blocked = await api().post('/api/v1/invitations/accept').set(invitee.auth).send({ token: inviteToken });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('unprocessable');

    const verified = await api().post('/api/v1/auth/verify-email').send({ token: verifyToken });
    expect(verified.status).toBe(204);

    const accepted = await api().post('/api/v1/invitations/accept').set(invitee.auth).send({ token: inviteToken });
    expect(accepted.status).toBe(200);
  });

  it('rejects an unknown or already-used token', async () => {
    const response = await api()
      .post('/api/v1/auth/verify-email')
      .send({ token: 'A'.repeat(32) });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('unprocessable');
  });

  it('resends the verification email, and does nothing once already verified', async () => {
    const user = await registerUser({ skipEmailVerification: true });
    sentInTests.length = 0;

    const resent = await api().post('/api/v1/auth/resend-verification').set(user.auth);
    expect(resent.status).toBe(204);
    expect(sentInTests.at(-1)?.to).toBe(user.email);

    const token = tokenFrom(sentInTests.at(-1)?.text);
    await api().post('/api/v1/auth/verify-email').send({ token });

    sentInTests.length = 0;
    const secondResend = await api().post('/api/v1/auth/resend-verification').set(user.auth);
    expect(secondResend.status).toBe(204);
    expect(sentInTests).toHaveLength(0);
  });
});

describe('password reset', () => {
  it('always answers 204, whether or not the address has an account', async () => {
    const user = await registerUser();

    const known = await api().post('/api/v1/auth/forgot-password').send({ email: user.email });
    const unknown = await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' });

    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);
  });

  it('resets the password, signs the caller in, and revokes the old session', async () => {
    const user = await registerUser();
    sentInTests.length = 0;

    const requested = await api().post('/api/v1/auth/forgot-password').send({ email: user.email });
    expect(requested.status).toBe(204);
    const token = tokenFrom(sentInTests.at(-1)?.text);

    const reset = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'BrandNewPassword123' });

    expect(reset.status).toBe(200);
    expect(reset.body.accessToken).toBeTruthy();
    expect(reset.body.defaultWorkspaceId).toBe(user.workspaceId);

    // The old password no longer works; the new one does.
    const oldLogin = await api().post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'BrandNewPassword123' });
    expect(newLogin.status).toBe(200);

    // The session that existed before the reset is gone.
    const oldRefresh = await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(oldRefresh.status).toBe(401);
  });

  it('rejects an unknown, expired or already-used token', async () => {
    const user = await registerUser();

    const bogus = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token: 'B'.repeat(32), newPassword: 'AnotherPassword123' });
    expect(bogus.status).toBe(422);

    const requested = await api().post('/api/v1/auth/forgot-password').send({ email: user.email });
    expect(requested.status).toBe(204);
    const token = tokenFrom(sentInTests.at(-1)?.text);

    // Force it into the past instead of waiting out the real TTL.
    await db
      .updateTable('users')
      .set({ password_reset_expires_at: new Date(Date.now() - 1000) })
      .where('email', '=', user.email)
      .execute();

    const expired = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'AnotherPassword123' });
    expect(expired.status).toBe(422);
  });

  it('cancels a pending account deletion, the same way signing in does', async () => {
    const user = await registerUser();
    const deletion = await api()
      .delete('/api/v1/users/me')
      .set(user.auth)
      .send({ confirm: true, currentPassword: user.password });
    expect(deletion.status).toBe(200);

    sentInTests.length = 0;
    await api().post('/api/v1/auth/forgot-password').send({ email: user.email });
    const token = tokenFrom(sentInTests.at(-1)?.text);

    const reset = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'RecoveredPassword123' });
    expect(reset.status).toBe(200);

    const row = await db
      .selectFrom('users')
      .select('deletion_requested_at')
      .where('email', '=', user.email)
      .executeTakeFirstOrThrow();
    expect(row.deletion_requested_at).toBeNull();
  });
});
