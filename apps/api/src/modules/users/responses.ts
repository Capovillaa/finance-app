import { z } from 'zod/v4';
import { timestamp } from '../shared/responses.js';

/**
 * What this module returns.
 *
 * The profile shapes live in `auth/responses.ts` (`User`, `userResponse`),
 * because that is where a user is first produced and a component may only be
 * named once.
 */

export const deletionScheduledResponse = z
  .object({
    deletionScheduledFor: timestamp.describe(
      'When the erasure will actually happen. Signing in before then cancels it.',
    ),
  })
  .describe(
    'An erasure that has been scheduled, not performed. Every session is revoked immediately; the ' +
      'data is removed once the grace period elapses.',
  );
