import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useUpdateProfileMutation } from '../../api/endpoints/users';
import type { User } from '../../api/types';
import { useAppDispatch } from '../../app/hooks';
import { setLanguage } from '../../i18n';
import { DEFAULT_LANGUAGE, LANGUAGES, resolveLanguage } from '../../i18n/languages';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { COMMON_CURRENCIES } from '../../lib/currencies';
import { userLoaded } from '../auth/authSlice';
import {
  deviceTimezone,
  profileFormSchema,
  type ProfileFormValues,
} from './settingsSchemas';

interface ProfileSectionProps {
  user: User;
}

function toFormValues(user: User, activeLanguage: string): ProfileFormValues {
  return {
    fullName: user.fullName,
    avatarUrl: user.avatarUrl ?? '',
    // The language *in force*, not the one on the profile.
    //
    // The two can differ: this browser's own choice outranks the profile, so
    // someone signing in on a machine where a colleague picked Spanish gets
    // Spanish. Showing them the profile's value here would put a field labelled
    // "Language" on screen reading something other than the language they are
    // looking at. Seeding from the active one instead means Save reconciles the
    // two rather than fighting them.
    //
    // The fallback also covers a tag the app ships no catalogue for — an account
    // created before the picker existed, or the API's own `pt-BR` default —
    // which would otherwise render the select blank.
    locale: resolveLanguage(activeLanguage) ?? resolveLanguage(user.locale) ?? DEFAULT_LANGUAGE,
    timezone: user.timezone,
    baseCurrency: user.baseCurrency,
  };
}

/**
 * The signed-in user's own profile.
 *
 * `baseCurrency` here is the *account* default — what a new workspace is created
 * with — not the currency any existing workspace reports in. Changing it leaves
 * every existing workspace alone, which is worth saying on screen because the
 * two fields have the same name.
 */
export default function ProfileSection({ user }: ProfileSectionProps): ReactElement {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const [updateProfile, { isLoading, error }] = useUpdateProfileMutation();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: toFormValues(user, i18n.language),
  });

  // The user can be replaced from elsewhere — a silent refresh on boot, or a
  // save in another tab — so the form follows the store rather than keeping the
  // values it was first mounted with.
  useEffect(() => {
    reset(toFormValues(user, i18n.language));
  }, [user, i18n.language, reset]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof ProfileFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);

    const result = await updateProfile({
      fullName: values.fullName,
      // The server takes `null` to clear it; `''` would fail its `url()` check.
      avatarUrl: values.avatarUrl ? values.avatarUrl : null,
      locale: values.locale,
      timezone: values.timezone,
      baseCurrency: values.baseCurrency,
    })
      .unwrap()
      .catch(() => null);

    if (!result) return;

    dispatch(userLoaded(result.user));
    reset(toFormValues(result.user, result.user.locale));
    setSaved(true);

    // Applied only after the save lands, and without a second PATCH — the
    // request above already carried the new locale. `useLanguage().change` is
    // for the app-bar picker, where there is no form to submit.
    void setLanguage(result.user.locale);
  });

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2.5}>
            <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h3">{t('settings.profile')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('settings.signedInAs', { email: user.email })}
              </Typography>
            </Stack>

            {error ? <Alert severity="error">{getApiErrorMessage(error, t('settings.profileFailed'))}</Alert> : null}
            {saved && !isDirty ? <Alert severity="success">{t('settings.profileSaved')}</Alert> : null}

            <TextField
              label={t('common.fullName')}
              fullWidth
              error={Boolean(errors.fullName)}
              helperText={fieldMessage(errors.fullName?.message)}
              {...register('fullName')}
            />

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
              <TextField
                select
                label={t('language.label')}
                fullWidth
                error={Boolean(errors.locale)}
                helperText={fieldMessage(errors.locale?.message) ?? t('language.helper')}
                value={watch('locale')}
                {...register('locale')}
              >
                {LANGUAGES.map((language) => (
                  <MenuItem key={language.code} value={language.code}>
                    {language.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label={t('settings.defaultCurrency')}
                fullWidth
                error={Boolean(errors.baseCurrency)}
                helperText={fieldMessage(errors.baseCurrency?.message) ?? t('settings.defaultCurrencyHint')}
                value={watch('baseCurrency')}
                {...register('baseCurrency')}
              >
                {COMMON_CURRENCIES.map((code) => (
                  <MenuItem key={code} value={code}>
                    {code}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label={t('settings.timezone')}
                fullWidth
                error={Boolean(errors.timezone)}
                helperText={fieldMessage(errors.timezone?.message) ?? t('settings.timezoneHint')}
                {...register('timezone')}
              />
            </Box>

            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                onClick={() => setValue('timezone', deviceTimezone(), { shouldDirty: true, shouldValidate: true })}
              >
                {t('settings.useDeviceTimezone')}
              </Button>
            </Stack>

            <TextField
              label={t('settings.avatarUrl')}
              placeholder={t('common.optional')}
              fullWidth
              error={Boolean(errors.avatarUrl)}
              helperText={fieldMessage(errors.avatarUrl?.message)}
              {...register('avatarUrl')}
            />

            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => reset(toFormValues(user, i18n.language))} disabled={isLoading || !isDirty}>
                {t('common.discard')}
              </Button>
              <Button type="submit" variant="contained" disabled={isLoading || !isDirty}>
                {isLoading ? t('common.saving') : t('common.saveChanges')}
              </Button>
            </Stack>
          </Stack>
        </form>
      </CardContent>
    </Card>
  );
}
