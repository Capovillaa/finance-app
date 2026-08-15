import { z } from 'zod/v4';
import { component, integer, uuid } from '../shared/responses.js';

/**
 * What this module returns.
 *
 * `usageCount` is on the listing only: it is a `COUNT` over `transaction_tags`
 * that the list query joins for, and `POST /tags` returns the row it just
 * inserted without going back for a number that is always zero.
 */

export const tagSchema = component(
  'Tag',
  z.object({
    id: uuid,
    name: z.string(),
    color: z.string().nullable(),
    usageCount: integer.optional().describe('How many transactions carry the tag. Listing only.'),
  }),
);

export const tagListResponse = z.object({ tags: z.array(tagSchema) });

export const tagResponse = z.object({ tag: tagSchema });
