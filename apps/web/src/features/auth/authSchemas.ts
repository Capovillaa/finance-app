import { CURRENCY_CODE_LENGTH, LIMITS, hasLettersAndDigits } from '@finance/schemas';
import { z } from 'zod';

/**
 * The sign-in and sign-up forms.
 *
 * Every bound and every composition rule below is read from `@finance/schemas`,
 * the same module `apps/api/src/modules/auth/routes.ts` builds its request
 * schema from — so the two cannot disagree about what a password is. What stays
 * local is the *form* half: a confirmation field the API never sees, and the
 * fact that an untouched input is `''` rather than `undefined`.
 *
 * The client's validation remains a courtesy, never the authority. Anything the
 * server rejects still surfaces through `getFieldErrors`.
 */
export const passwordSchema = z
  .string()
  .min(LIMITS.password.min, 'validation.passwordLength')
  .max(LIMITS.password.max)
  .refine(hasLettersAndDigits, 'validation.passwordComplexity');

const emailSchema = z
  .string()
  .min(1, 'validation.emailRequired')
  .email('validation.emailInvalid')
  .max(LIMITS.email.max);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'validation.passwordRequired').max(LIMITS.password.max),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().min(LIMITS.name.min, 'validation.nameRequired').max(LIMITS.name.max),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'validation.confirmPassword'),
    baseCurrency: z.string().length(CURRENCY_CODE_LENGTH, 'validation.currencyCode'),
    workspaceName: z.string().max(LIMITS.name.max).optional(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'validation.passwordsDiffer',
    path: ['confirmPassword'],
  });

export type RegisterValues = z.infer<typeof registerSchema>;
