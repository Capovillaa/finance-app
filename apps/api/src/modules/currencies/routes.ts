import { Router } from 'express';
import { z } from 'zod/v4';
import { asyncHandler } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { query, validate } from '../../middleware/validate.js';
import { today } from '../../lib/dates.js';
import { dateSchema } from '../shared/schemas.js';
import * as currencyService from './service.js';

export const currencyRouter: Router = Router();

currencyRouter.use(requireAuth);

currencyRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ currencies: await currencyService.listCurrencies() });
  }),
);

currencyRouter.get(
  '/rate',
  validate({
    query: z.object({
      from: z.string().length(3),
      to: z.string().length(3),
      asOf: dateSchema.optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { from, to, asOf } = query<{ from: string; to: string; asOf?: string }>(req);
    const date = asOf ?? today('UTC');
    res.json({ from: from.toUpperCase(), to: to.toUpperCase(), asOf: date, rate: await currencyService.getRate(from, to, date) });
  }),
);
