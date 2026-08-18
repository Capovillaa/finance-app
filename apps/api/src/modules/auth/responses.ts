import { z } from 'zod/v4';
import { component, currencyCode, integer, timestamp, uuid } from '../shared/responses.js';

/**
 * What this module returns.
 *
 * `refreshToken` is in the body **and** set as an HttpOnly cookie. Native
 * clients read the body; a browser should let the cookie do the work and never
 * put the token where JavaScript can reach it. It is opaque, rotates on every
 * use, and is tracked in a family — replaying a rotated one revokes the family.
 */

export const userSchema = component(
  'User',
  z.object({
    id: uuid,
    email: z.string(),
    fullName: z.string(),
    locale: z.string().describe('A BCP 47 tag. The API answers in it when `Accept-Language` says nothing.'),
    timezone: z.string().describe('An IANA zone, e.g. `America/Sao_Paulo`.'),
    baseCurrency: currencyCode,
    avatarUrl: z.string().nullable(),
    emailVerifiedAt: timestamp.nullable().describe('Null until the emailed link is confirmed.'),
  }),
);

export const userResponse = z.object({ user: userSchema });

export const authResultResponse = z
  .object({
    user: userSchema,
    accessToken: z.string().describe('A short-lived JWT. Send it as `Authorization: Bearer …`.'),
    refreshToken: z.string().describe('Opaque and single-use. Also set as an HttpOnly cookie.'),
    expiresIn: integer.describe('Seconds until the access token expires.'),
    defaultWorkspaceId: uuid.optional().describe("The workspace created with the account, on register only."),
  })
  .describe('A signed-in session.');

export const tokenPairResponse = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: integer,
  })
  .describe('A rotated pair. The presented refresh token is dead from this point on.');
