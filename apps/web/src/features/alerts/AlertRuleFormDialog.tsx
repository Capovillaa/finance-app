import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useListAccountsQuery } from '../../api/endpoints/accounts';
import { useUpsertAlertRuleMutation } from '../../api/endpoints/alerts';
import { useListCategoriesQuery } from '../../api/endpoints/categories';
import type { AlertRule, AlertRuleType, NotificationChannel } from '../../api/types';
import { getApiErrorMessage } from '../../lib/apiError';
import { ALERT_TYPE_META } from './alertMeta';
import { useTranslation } from 'react-i18next';

interface AlertRuleFormDialogProps {
  open: boolean;
  workspaceId: string;
  type: AlertRuleType;
  /** Present when editing an existing rule, absent when adding another scoped variant. */
  existing?: AlertRule;
  onClose: () => void;
}

/** Catalogue keys: this table is evaluated once, at import. */
const CHANNELS: { value: NotificationChannel; labelKey: string }[] = [
  { value: 'in_app', labelKey: 'alerts.channel.inApp' },
  { value: 'email', labelKey: 'common.email' },
  { value: 'push', labelKey: 'alerts.channel.push' },
];

type ScopeKind = 'none' | 'account' | 'category';

function scopeKindOf(rule: AlertRule | undefined): ScopeKind {
  if (rule?.scopeAccountId) return 'account';
  if (rule?.scopeCategoryId) return 'category';
  return 'none';
}

export default function AlertRuleFormDialog({ open, workspaceId, type, existing, onClose }: AlertRuleFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const meta = ALERT_TYPE_META[type];
  const [upsertRule, { isLoading, error }] = useUpsertAlertRuleMutation();
  const accounts = useListAccountsQuery(open ? { workspaceId } : skipToken);
  const categories = useListCategoriesQuery(open ? { workspaceId } : skipToken);

  const [isEnabled, setIsEnabled] = useState(true);
  const [channels, setChannels] = useState<NotificationChannel[]>(['in_app']);
  const [scopeKind, setScopeKind] = useState<ScopeKind>('none');
  const [scopeId, setScopeId] = useState('');
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setIsEnabled(existing?.isEnabled ?? true);
    setChannels(existing?.channels ?? ['in_app']);
    setScopeKind(scopeKindOf(existing));
    setScopeId(existing?.scopeAccountId ?? existing?.scopeCategoryId ?? '');
    setFormError(undefined);
    setConfigValues(
      Object.fromEntries(
        meta.fields.map((field) => [
          field.key,
          existing?.config[field.key] !== undefined ? String(existing.config[field.key]) : field.default,
        ]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, type]);

  const toggleChannel = (channel: NotificationChannel): void => {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  };

  const scopeOptions = useMemo(
    () => (scopeKind === 'account' ? accounts.data?.accounts ?? [] : categories.data?.categories ?? []),
    [scopeKind, accounts.data, categories.data],
  );

  const handleSave = async (): Promise<void> => {
    if (channels.length === 0) {
      setFormError(t('alerts.channelRequired'));
      return;
    }
    if (scopeKind !== 'none' && !scopeId) {
      setFormError(`Choose ${scopeKind === 'account' ? 'an account' : 'a category'} to scope this rule to`);
      return;
    }

    const config: Record<string, unknown> = {};
    for (const field of meta.fields) {
      const raw = (configValues[field.key] ?? '').trim();
      if (raw === '') continue;

      if (field.kind === 'percent-list') {
        const values = raw
          .split(',')
          .map((v) => Number(v.trim()))
          .filter((v) => Number.isFinite(v));
        if (values.length === 0) {
          setFormError(t('alerts.needOneNumber', { field: t(field.labelKey) }));
          return;
        }
        config[field.key] = values;
      } else {
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          setFormError(t('alerts.needValidNumber', { field: t(field.labelKey) }));
          return;
        }
        config[field.key] = value;
      }
    }

    setFormError(undefined);
    const result = await upsertRule({
      workspaceId,
      body: {
        type,
        isEnabled,
        config,
        channels,
        scopeAccountId: scopeKind === 'account' ? scopeId : null,
        scopeCategoryId: scopeKind === 'category' ? scopeId : null,
      },
    })
      .unwrap()
      .catch(() => null);

    if (!result) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t(meta.labelKey)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t(meta.descriptionKey)}
          </Typography>

          {formError ? <Alert severity="warning">{formError}</Alert> : null}
          {error ? <Alert severity="error">{getApiErrorMessage(error, t('alerts.saveFailed'))}</Alert> : null}

          <FormControlLabel control={<Switch checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />} label={t('alerts.enabled')} />

          <Stack spacing={0.75}>
            <Typography variant="body2">Delivery channels</Typography>
            <FormGroup row>
              {CHANNELS.map((c) => (
                <FormControlLabel
                  key={c.value}
                  control={<Checkbox size="small" checked={channels.includes(c.value)} onChange={() => toggleChannel(c.value)} />}
                  label={t(c.labelKey)}
                />
              ))}
            </FormGroup>
          </Stack>

          {meta.fields.map((field) => (
            <TextField
              key={field.key}
              label={t(field.labelKey)}
              size="small"
              fullWidth
              value={configValues[field.key] ?? ''}
              onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              helperText={field.helperTextKey ? t(field.helperTextKey) : undefined}
            />
          ))}

          <TextField
            select
            label={t('alerts.scope')}
            size="small"
            fullWidth
            value={scopeKind}
            onChange={(e) => {
              setScopeKind(e.target.value as ScopeKind);
              setScopeId('');
            }}
          >
            <MenuItem value="none">{t('alerts.wholeWorkspace')}</MenuItem>
            <MenuItem value="account">One account</MenuItem>
            <MenuItem value="category">One category</MenuItem>
          </TextField>

          {scopeKind !== 'none' ? (
            <TextField select label={scopeKind === 'account' ? t('common.account') : t('common.category')} size="small" fullWidth value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
              {scopeOptions.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void handleSave()} variant="contained" disabled={isLoading}>
          {isLoading ? t('common.saving') : t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
