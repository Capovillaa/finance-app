import { z } from 'zod';

/**
 * Client-side mirrors of the API's auth schemas
 * (`apps/api/src/modules/auth/routes.ts`).
 *
 * These are a duplicate today. The intended end state is the shared workspace
 * package described in CLAUDE.md next-task 3, where the API's Zod schemas become
 * the single contract both sides import. Until then the rules below are kept
 * character-for-character identical to the server's, and any server rejection
 * still surfaces through `getFieldErrors` — the client validation is a courtesy,
 * never the authority.
 */
export const passwordSchema = z
  .string()
  .min(10, 'validation.passwordLength')
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'validation.passwordComplexity');

export const loginSchema = z.object({
  email: z.string().min(1, 'validation.emailRequired').email('validation.emailInvalid').max(254),
  password: z.string().min(1, 'validation.passwordRequired').max(200),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().min(1, 'validation.nameRequired').max(120),
    email: z.string().min(1, 'validation.emailRequired').email('validation.emailInvalid').max(254),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'validation.confirmPassword'),
    baseCurrency: z.string().length(3, 'validation.currencyCode'),
    workspaceName: z.string().max(120).optional(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'validation.passwordsDiffer',
    path: ['confirmPassword'],
  });

export type RegisterValues = z.infer<typeof registerSchema>;
