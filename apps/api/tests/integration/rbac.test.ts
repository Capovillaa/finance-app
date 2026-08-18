import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { app, api, registerUser, type TestUser } from '../helpers.js';
import { sentInTests } from '../../src/lib/email.js';
import { walkRoutes, type RouteRecord } from '../../src/openapi/walk.js';

/**
 * M-7 in AUDIT_REPORT.md: across every operation this API publishes, only two
 * integration files ever asserted a 403 at all. This walks the same
 * `walkRoutes()` the OpenAPI document is generated from — so it can never
 * drift from what the app actually mounts — signs in as a viewer in a real
 * shared workspace, and asserts 403 on every route stamped with a role above
 * `viewer`. `RBAC is resolved once per request by withWorkspace middleware
 * into a workspace context, then checked by requireViewer/.../requireOwner`
 * (CLAUDE.md section 6) — the role check runs before any resource the path
 * names is ever looked up, which is what makes it safe to substitute a
 * random UUID for every path parameter except `workspaceId` and still expect
 * a role failure rather than a 404.
 */

const ELEVATED_ROLES = new Set(['editor', 'admin', 'owner']);

function substitutePath(path: string, workspaceId: string): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) =>
    name === 'workspaceId' ? workspaceId : randomUUID(),
  );
}

/** A route is only a fair test if an empty request body/query would not be rejected before the role check runs. */
function isCleanlyTestable(route: RouteRecord): boolean {
  if (route.body && !route.body.safeParse({}).success) return false;
  if (route.query.some((q) => !q.safeParse({}).success)) return false;
  return true;
}

async function inviteAsViewer(owner: TestUser, viewer: TestUser, workspaceId: string): Promise<void> {
  const invitation = await api()
    .post(`/api/v1/workspaces/${workspaceId}/invitations`)
    .set(owner.auth)
    .send({ email: viewer.email, role: 'viewer' });
  expect(invitation.status).toBe(201);

  const email = sentInTests.at(-1);
  const token = /token=([A-Za-z0-9_-]+)/.exec(email?.text ?? '')?.[1];
  expect(token).toBeTruthy();

  const accepted = await api().post('/api/v1/invitations/accept').set(viewer.auth).send({ token });
  expect(accepted.status).toBe(200);
}

describe('RBAC sweep: a viewer is refused everything above their role', () => {
  it('walks every role-gated route and asserts 403 for a viewer', async () => {
    const owner = await registerUser();
    const viewer = await registerUser();

    const shared = await api()
      .post('/api/v1/workspaces')
      .set(owner.auth)
      .send({ name: 'RBAC sweep', type: 'shared' });
    const workspaceId: string = shared.body.workspace.id;

    await inviteAsViewer(owner, viewer, workspaceId);

    const elevated = walkRoutes(app()).filter(
      (route) => route.role && ELEVATED_ROLES.has(route.role),
    );

    // A sanity floor, not a target: if this drops near zero, the sweep is
    // silently testing nothing rather than genuinely finding no elevated
    // routes, and that is the failure mode this whole test exists to avoid.
    expect(elevated.length).toBeGreaterThan(20);

    const testable = elevated.filter(isCleanlyTestable);
    const skipped = elevated.filter((route) => !isCleanlyTestable(route));

    const failures: string[] = [];

    for (const route of testable) {
      const path = substitutePath(route.path, workspaceId);
      const method = route.method as 'get' | 'post' | 'patch' | 'delete' | 'put';
      const request = api()[method](path).set(viewer.auth);
      const response = await (route.body ? request.send({}) : request);

      if (response.status !== 403) {
        failures.push(`${route.method.toUpperCase()} ${route.path} -> ${response.status} (wanted 403)`);
      }
    }

    expect(failures, failures.join('\n')).toHaveLength(0);

    // A trip-wire against the skip list quietly growing to swallow the
    // routes that most need this check: every route requiring a non-empty
    // body should have a hand-written case in the spot-check below instead of
    // silently going untested. This is not a hard failure — a genuinely new
    // required-body field is a normal thing to add — but it is worth seeing.
    if (skipped.length > 0) {
      console.warn(
        `RBAC sweep skipped ${skipped.length} route(s) an empty body could not exercise ` +
          `(add a case to the spot-check below if one is missing):\n` +
          skipped.map((route) => `  ${route.method.toUpperCase()} ${route.path}`).join('\n'),
      );
    }
  });

  /**
   * The routes `isCleanlyTestable` skips — a required body field means an
   * empty `{}` fails Zod's `validate()` before ever reaching the role check
   * this test exists to prove, so `{}` provides no signal on those routes.
   * Spot-checked here with a body that actually clears validation, so the
   * request really does reach `requireEditor`/`requireAdmin` and a viewer is
   * refused for the right reason.
   */
  it('spot-checks the write routes an empty body cannot exercise', async () => {
    const owner = await registerUser();
    const viewer = await registerUser();

    const shared = await api()
      .post('/api/v1/workspaces')
      .set(owner.auth)
      .send({ name: 'RBAC spot-check', type: 'shared' });
    const workspaceId: string = shared.body.workspace.id;

    await inviteAsViewer(owner, viewer, workspaceId);

    const account = await api()
      .post(`/api/v1/workspaces/${workspaceId}/accounts`)
      .set(owner.auth)
      .send({ name: 'Spot check', type: 'checking', currency: 'BRL', initialBalance: '0' });
    expect(account.status).toBe(201);

    // requireEditor: creating a transaction.
    const createTx = await api()
      .post(`/api/v1/workspaces/${workspaceId}/transactions`)
      .set(viewer.auth)
      .send({
        accountId: account.body.account.id,
        type: 'expense',
        amount: '10.00',
        description: 'Should be refused',
        occurredOn: '2026-01-01',
      });
    expect(createTx.status).toBe(403);

    // requireEditor: creating an account.
    const createAccount = await api()
      .post(`/api/v1/workspaces/${workspaceId}/accounts`)
      .set(viewer.auth)
      .send({ name: 'Refused account', type: 'checking', currency: 'BRL', initialBalance: '0' });
    expect(createAccount.status).toBe(403);

    // requireAdmin: inviting a member.
    const invite = await api()
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set(viewer.auth)
      .send({ email: 'someone-else@example.com', role: 'editor' });
    expect(invite.status).toBe(403);

    // requireAdmin: updating the workspace itself.
    const updateWorkspace = await api()
      .patch(`/api/v1/workspaces/${workspaceId}`)
      .set(viewer.auth)
      .send({ name: 'Renamed by a viewer' });
    expect(updateWorkspace.status).toBe(403);

    // requireOwner: transferring ownership.
    const transfer = await api()
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .set(viewer.auth)
      .send({ newOwnerId: owner.id });
    expect(transfer.status).toBe(403);
  });
});
