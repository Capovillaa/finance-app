/**
 * What production refuses to boot on.
 *
 * Every rule here has the same shape: a value that is *correct for development*
 * would be a security or correctness failure in production, and taking it
 * silently is worse than not starting — a deployment signing tokens with a
 * published key, or posting invitations to a mail sink that is not there, looks
 * exactly like one that is working.
 *
 * Nothing in this file imports `config/env`, the database or Express — the same
 * rule `middleware/rate-limit-policy.ts` and `modules/currencies/providers.ts`
 * follow, and for the same reason: the decision is the hard part and it should be
 * testable without an environment to stub. `config/env.ts` supplies the values;
 * this module only judges them.
 *
 * The signing-secret half exists because a length check cannot tell a real
 * secret from a published one. This repository is public, so the placeholders in
 * `.env.example` and the throwaways in the CI workflow are known bytes: anyone
 * holding `JWT_ACCESS_SECRET` can forge an access token for any user, and anyone
 * holding `JWT_REFRESH_SECRET` can compute the HMAC of any refresh or invitation
 * token. That is total authentication bypass, from a copied file.
 */

export interface SecretIssue {
  /** The environment variable at fault. Never the value — this text is logged. */
  variable: string;
  message: string;
}

/**
 * Characters, not bytes, and deliberately conservative: every generator worth
 * using emits far more than this. 32 characters of base64url is 192 bits.
 */
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

/**
 * A long string of one repeated character clears any length bar while carrying
 * almost no entropy. Ten distinct characters is comfortably below what a random
 * value of the minimum length produces even from a 16-symbol hex alphabet, and
 * comfortably above what padding produces.
 */
const MIN_DISTINCT_CHARACTERS = 10;

export const GENERATE_SECRET_COMMAND =
  'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"';

/**
 * Values that have been published in this repository at some point and are
 * therefore public knowledge for good. Kept as exact strings rather than trusted
 * to the patterns below, because a value that has actually shipped must be
 * refused whether or not it happens to look like a placeholder.
 */
const PUBLISHED_SECRETS = new Set(
  [
    // .env.example, before and after this check existed
    'dev-access-secret-change-me-0000000000000000',
    'dev-refresh-secret-change-me-000000000000',
    'dev-only-insecure-access-secret-change-me',
    'dev-only-insecure-refresh-secret-change-me',
    // .github/workflows/ci.yml, and the same values in CLAUDE.md
    'ci-access-secret-not-a-real-key-000000',
    'ci-refresh-secret-not-a-real-key-00000',
    // scripts/generate-openapi.ts and tests/unit/openapi.test.ts
    'openapi-generation-placeholder-secret',
  ].map(normalise),
);

/**
 * Shapes a placeholder takes when someone edits one rather than generating one.
 *
 * These are matched against values that may legitimately be random, so every
 * pattern has to be improbable in 64 characters of base64url: the short markers
 * are anchored to the start and require a separator after them, and the rest are
 * long enough that a chance match is not worth thinking about. A two-letter
 * prefix would not clear that bar, which is why the published `ci-…` throwaways
 * are caught by the exact list above instead.
 */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /change[\s._-]*me/i,
  /placeholder/i,
  /not[\s._-]*a[\s._-]*real/i,
  /insecure/i,
  /example/i,
  /secret[\s._-]*here/i,
  /^dev[\s._-]/i,
  /^test[\s._-]/i,
  /^your[\s._-]/i,
  /^todo/i,
];

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** Every reason one secret is unfit for production. Empty means it is fine. */
export function checkProductionSecret(variable: string, value: string): SecretIssue[] {
  const issues: SecretIssue[] = [];
  const trimmed = value.trim();
  const add = (message: string) => issues.push({ variable, message });

  if (trimmed.length < MIN_PRODUCTION_SECRET_LENGTH) {
    add(
      `must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production (got ${trimmed.length})`,
    );
  }

  if (PUBLISHED_SECRETS.has(normalise(trimmed))) {
    add('is one of the placeholder values published in this repository, so it is public knowledge');
  } else if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    add('looks like a placeholder rather than a generated secret');
  }

  if (new Set(trimmed).size < MIN_DISTINCT_CHARACTERS) {
    add(
      `carries too little entropy: fewer than ${MIN_DISTINCT_CHARACTERS} distinct characters`,
    );
  }

  return issues;
}

/**
 * The production check over the whole set of signing secrets.
 *
 * The pair is judged together as well as individually: two roles sharing one key
 * means a leak in either context is a leak in both, and rotating for one silently
 * invalidates the other.
 */
export function checkProductionSecrets(secrets: Record<string, string>): SecretIssue[] {
  const issues = Object.entries(secrets).flatMap(([variable, value]) =>
    checkProductionSecret(variable, value),
  );

  const names = Object.keys(secrets);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = names[i]!;
      const b = names[j]!;
      if (secrets[a]!.trim() === secrets[b]!.trim()) {
        issues.push({ variable: a, message: `must not be the same value as ${b}` });
      }
    }
  }

  return issues;
}

/**
 * Hosts that mean "there is no mail server here".
 *
 * `SMTP_HOST` defaults to `localhost` for MailHog, and the deployed composition
 * has no mail sink at all. The failure this guards is quiet by construction:
 * `sendEmail` catches and logs, `createInvitation` does not read its result, so
 * a production deployment left on the default posts every workspace invitation
 * into a socket that refuses the connection and tells the admin it worked.
 *
 * Checked on the resolved value rather than on the presence of the environment
 * variable, because `config/env.ts` loads `.env` through dotenv *into*
 * `process.env` — so "the operator did not set it" and "the operator set it to
 * the development default" are indistinguishable by the time anything can look.
 */
const DEVELOPMENT_MAIL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'mailhog', '0.0.0.0']);

export function isDevelopmentMailHost(host: string): boolean {
  return DEVELOPMENT_MAIL_HOSTS.has(host.trim().toLowerCase());
}

/** The message `config/env.ts` throws. Names the variables, never the values. */
export function formatSecretIssues(issues: readonly SecretIssue[]): string {
  const lines = issues.map((issue) => `  - ${issue.variable}: ${issue.message}`).join('\n');
  return [
    'Refusing to start in production with an unusable signing secret:',
    lines,
    '',
    `Generate one per variable with:\n    ${GENERATE_SECRET_COMMAND}`,
    '',
    'Supply them through the deployment environment or a secret store — never through',
    'a .env file copied from .env.example, whose values are public.',
  ].join('\n');
}
