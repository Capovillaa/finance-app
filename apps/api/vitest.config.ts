import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    /**
     * The audience every Google ID token in the suite is checked against.
     *
     * It lives here rather than at the top of `tests/setup.ts` because that is
     * too late: `config/env.ts` parses the environment once, at import, and a
     * setup file's `process.env` assignments run *after* its own hoisted
     * imports have already pulled that module in. `test.env` is applied to the
     * worker before anything loads, which is the only place early enough.
     *
     * `GOOGLE_CLIENT_ID` is optional in production — a deployment wanting no
     * Google sign-in leaves it unset and `/auth/google` refuses, which
     * `tests/unit/google-identity.test.ts` covers — but the endpoint cannot be
     * exercised at all without one. Nothing is signed with it: the tests
     * replace `verifyGoogleIdToken.verify`, the single seam into
     * `google-auth-library`, so no token is really verified and no request
     * ever reaches Google.
     */
    env: { GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com' },
    // Integration tests share one Postgres database; run files serially so
    // truncation between tests in one file cannot wipe another file's fixtures.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
