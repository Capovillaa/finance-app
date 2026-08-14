import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, useState, type ReactElement } from 'react';
import { useUpdateBudgetMutation } from '../../api/endpoints/budgets';
import type { BudgetProgress } from '../../api/types';
import { getApiErrorMessage } from '../../lib/apiError';
import { useTranslation } from 'react-i18next';

interface BudgetSettingsDialogProps {
  open: boolean;
  workspaceId: string;
  budget: BudgetProgress | undefined;
  onClose: () => void;
}

export default function BudgetSettingsDialog({ open, workspaceId, budget, onClose }: BudgetSettingsDialogProps): ReactElement {
  const { t } = useTranslation();
  const [updateBudget, { isLoading, error }] = useUpdateBudgetMutation();
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [rollover, setRollover] = useState(false);

  useEffect(() => {
    if (open && budget) {
      setName(budget.name);
      setIsActive(budget.isActive);
      setRollover(budget.rollover);
    }
  }, [open, budget]);

  const handleSave = async (): Promise<void> => {
    if (!budget) return;
    const result = await updateBudget({ workspaceId, id: budget.id, body: { name: name.trim(), isActive, rollover } })
      .unwrap()
      .catch(() => null);
    if (!result) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('budgets.settingsTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          {error ? <Alert severity="error">{getApiErrorMessage(error, t('common.saveFailed'))}</Alert> : null}

          <TextField label={t('common.name')} autoFocus fullWidth value={name} onChange={(e) => setName(e.target.value)} />

          <FormControlLabel
            control={<Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
            label={t('common.active')}
          />
          <FormControlLabel
            control={<Checkbox checked={rollover} onChange={(e) => setRollover(e.target.checked)} />}
            label={t('budgets.rolloverLabel')}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void handleSave()} variant="contained" disabled={isLoading || !name.trim()}>
          {isLoading ? t('common.saving') : t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
