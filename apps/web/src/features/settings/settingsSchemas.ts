import { z } from 'zod';
import type { WorkspaceRole } from '../../api/types';
import { passwordSchema } from '../auth/authSchemas';

/**
 * Client-side mirrors of the settings-related schemas in
 * `apps/api/src/modules/users/routes.ts`, `modules/auth/routes.ts` and
 * `modules/workspaces/routes.ts`.
 *
 * A duplicate today, kept character-for-character identical to the server's
 * rules, until the shared-schema package in CLAUDE.md next-task 3 lands. The
 * server remains the authority — anything it rejects still surfaces through
 * `getFieldErrors`.
 */

/**
 * Optional URL fields arrive from a text input as `''`, never as `undefined`.
 * The server takes `z.string().url().nullish()`, so the empty case is mapped to
 * `null` at submit time rather than being sent as an empty string, which would
 * fail its `url()` check.
 */
const optionalUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || z.string().url().safeParse(value).success, 'validation.urlInvalid');

export const profileFormSchema = z.object({
  fullName: z.string().trim().min(1, 'validation.nameRequired').max(120),
  avatarUrl: optionalUrlSchema,
  locale: z.string().trim().max(10, 'validation.languageRequired'),
  timezone: z.string().trim().max(60),
  baseCurrency: z.string().length(3, 'validation.currencyCode').toUpperCase(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'validation.currentPasswordRequired').max(200),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'validation.confirmNewPassword'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'validation.passwordsDiffer',
    path: ['confirmPassword'],
  });

export type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export const workspaceFormSchema = z.object({
  name: z.string().trim().min(1, 'validation.nameRequired').max(120),
  baseCurrency: z.string().length(3, 'validation.currencyCode').toUpperCase(),
  timezone: z.string().trim().max(60),
});

export type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;

/** Ownership moves through its own endpoint, so it is not a grantable role. */
export const GRANTABLE_ROLES = ['admin', 'editor', 'viewer'] as const;

export const inviteFormSchema = z.object({
  email: z.string().min(1, 'validation.emailRequired').email('validation.emailInvalid').max(254),
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
