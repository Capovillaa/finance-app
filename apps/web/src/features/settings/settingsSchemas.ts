import {
  CURRENCY_CODE_LENGTH,
  GRANTABLE_ROLES,
  LIMITS,
  type WorkspaceRole,
} from '@finance/schemas';
import { z } from 'zod';
import { passwordSchema } from '../auth/authSchemas';

/**
 * The four Settings tabs: profile, workspace, members, and the password change.
 *
 * Bounds and the grantable-role list come from `@finance/schemas`, shared with
 * `apps/api/src/modules/users/routes.ts`, `modules/auth/routes.ts` and
 * `modules/workspaces/routes.ts`. The server remains the authority — anything it
 * rejects still surfaces through `getFieldErrors`.
 */

/**
 * Optional URL fields arrive from a text input as `''`, never as `undefined`.
 * The server takes `urlField.nullish()`, so the empty case is mapped to `null`
 * at submit time rather than being sent as an empty string, which would fail
 * its `url()` check.
 */
const optionalUrlSchema = z
  .string()
  .trim()
  .max(LIMITS.url.max)
  .refine((value) => value === '' || z.string().url().safeParse(value).success, 'validation.urlInvalid');

export const profileFormSchema = z.object({
  fullName: z.string().trim().min(LIMITS.name.min, 'validation.nameRequired').max(LIMITS.name.max),
  avatarUrl: optionalUrlSchema,
  locale: z.string().trim().max(LIMITS.locale.max, 'validation.languageRequired'),
  timezone: z.string().trim().max(LIMITS.timezone.max),
  baseCurrency: z.string().length(CURRENCY_CODE_LENGTH, 'validation.currencyCode').toUpperCase(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const passwordFormSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'validation.currentPasswordRequired')
      .max(LIMITS.password.max),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'validation.confirmNewPassword'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'validation.passwordsDiffer',
    path: ['confirmPassword'],
  });

export type PasswordFormValues = z.infer<typeof passwordFormSchema>;

/**
 * Erasure asks for the current password, not a new one, so it takes the same
 * "prove it is you" shape the password change uses for `currentPassword`: a
 * bound and nothing else. Applying the password *policy* here would reject an
 * account whose password predates it.
 */
export const deleteAccountFormSchema = z.object({
  currentPassword: z.string().min(1, 'validation.currentPasswordRequired').max(LIMITS.password.max),
});

export type DeleteAccountFormValues = z.infer<typeof deleteAccountFormSchema>;

export const workspaceFormSchema = z.object({
  name: z.string().trim().min(LIMITS.name.min, 'validation.nameRequired').max(LIMITS.name.max),
  baseCurrency: z.string().length(CURRENCY_CODE_LENGTH, 'validation.currencyCode').toUpperCase(),
  timezone: z.string().trim().max(LIMITS.timezone.max),
});

export type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;

/** Ownership moves through its own endpoint, so it is not a grantable role. */
export { GRANTABLE_ROLES };

export const inviteFormSchema = z.object({
  email: z
    .string()
    .min(1, 'validation.emailRequired')
    .email('validation.emailInvalid')
    .max(LIMITS.email.max),
  role: z.enum(GRANTABLE_ROLES),
});

export type InviteFormValues = z.infer<typeof inviteFormSchema>;

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const ROLE_LABEL_KEYS: Record<WorkspaceRole, string> = {
  owner: 'settings.role.owner',
  admin: 'settings.role.admin',
  editor: 'settings.role.editor',
  viewer: 'settings.role.viewer',
};

export const ROLE_DESCRIPTION_KEYS: Record<WorkspaceRole, string> = {
  owner: 'settings.roleDescription.owner',
  admin: 'settings.roleDescription.admin',
  editor: 'settings.roleDescription.editor',
  viewer: 'settings.roleDescription.viewer',
};

/** The device's own IANA zone, for the "use this device" shortcut. */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
