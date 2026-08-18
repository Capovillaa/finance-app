import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { SplitInput } from '../../api/endpoints/transactions';
import { useSetSplitsMutation } from '../../api/endpoints/transactions';
import type { Transaction, TransactionSplit, WorkspaceMember } from '../../api/types';
import MoneyField from '../../components/MoneyField';
import { getApiErrorMessage } from '../../lib/apiError';
import { absMoney, formatMoney } from '../../lib/format';
import { equalMoney, sumMoney } from '../../lib/money';
import { SPLIT_MODES, SPLIT_MODE_LABEL_KEYS, type SplitMode } from './transactionSchemas';

interface SplitsDialogProps {
  open: boolean;
  workspaceId: string;
  transaction: Transaction | undefined;
  members: WorkspaceMember[];
  existing: TransactionSplit[];
  onClose: () => void;
}

/**
 * Who owes what on a shared transaction.
 *
 * The server accepts three shapes and infers the mode from the payload; the UI
 * names the three instead, so the choice is deliberate. Only "exact" needs
 * validating here — the shares must add up to the transaction total, and the
 * server rejects the request outright if they do not. Telling someone that
 * after they submit a table of numbers is a poor trade, so the running total is
 * checked as they type, with `lib/money.ts` doing it exactly rather than in
 * floating point.
 *
 * Even and weighted splits are left entirely to the server: both involve
 * division and remainder allocation, and a second implementation here would be
 * a second thing to keep in step. That is why no per-person figure is shown in
 * even mode — a number rendered here would be this file's guess at the server's
 * arithmetic, and the two would eventually disagree about a remainder cent.
 *
 * The layout follows the app's statement language: one hairline-separated row
 * per person, the figure right-aligned in the mono face, and the column named
 * once at the top rather than as a repeated label on every input.
 */
export default function SplitsDialog({
  open,
  workspaceId,
  transaction,
  members,
  existing,
  onClose,
}: SplitsDialogProps): ReactElement {
  const { t } = useTranslation();
  const [setSplits, { isLoading, error }] = useSetSplitsMutation();
  const [mode, setMode] = useState<SplitMode>('even');
  const [selected, setSelected] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  const total = transaction ? absMoney(transaction.amount) : '0';
  const currency = transaction?.currency ?? 'USD';

  /**
   * Which transaction the form below has already been seeded for.
   *
   * Seeding has to wait for data that arrives *after* the dialog opens, but it
   * must happen exactly once per opening: re-running it whenever the member
   * list re-renders would silently undo the user's own deselections. A ref is
   * the right shape for that because changing it must not itself re-render.
   */
  const seededFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!open || !transaction) {
      seededFor.current = undefined;
      return;
    }
    // Nothing to seed from yet — the member list is fetched lazily and can
    // still be in flight on the first render after opening.
    if (members.length === 0 && existing.length === 0) return;
    if (seededFor.current === transaction.id) return;

    seededFor.current = transaction.id;

    // Reopening on a transaction that is already split should show that split,
    // not a blank slate — the common edit is "add one more person".
    if (existing.length > 0) {
      setMode('exact');
      setSelected(existing.map((split) => split.userId));
      setValues(Object.fromEntries(existing.map((split) => [split.userId, split.shareAmount])));
    } else {
      setMode('even');
      setSelected(members.map((member) => member.userId));
      setValues({});
    }
  }, [open, transaction, members, existing]);

  const toggle = (userId: string): void => {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  const exactTotal = mode === 'exact' ? sumMoney(selected.map((id) => values[id] ?? '')) : null;
  const exactMatches = exactTotal !== null && equalMoney(exactTotal, total);

  const canSave =
    selected.length > 0 &&
    (mode !== 'exact' || exactMatches) &&
    (mode !== 'weight' || selected.every((id) => Number(values[id] ?? '1') > 0));

  const handleSave = async (): Promise<void> => {
    if (!transaction) return;

    const splits: SplitInput[] = selected.map((userId) => {
      if (mode === 'exact') return { userId, shareAmount: values[userId] ?? '0' };
      if (mode === 'weight') return { userId, weight: values[userId]?.trim() || '1' };
      return { userId };
    });

    const result = await setSplits({ workspaceId, id: transaction.id, splits }).unwrap().catch(() => null);
    if (!result) return;
    onClose();
  };

  const handleClear = async (): Promise<void> => {
    if (!transaction) return;
    // An empty array is how the API deletes a split set.
    const result = await setSplits({ workspaceId, id: transaction.id, splits: [] }).unwrap().catch(() => null);
    if (!result) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('transactions.splitTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{getApiErrorMessage(error, t('transactions.splitFailed'))}</Alert> : null}

          {/* What is being split, stated once, so no row has to repeat it. */}
          <Box sx={{ textAlign: 'center', pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" noWrap>
              {transaction?.description}
            </Typography>
            <Typography variant="h2" component="p" sx={{ mt: 0.5 }}>
              {transaction ? formatMoney(total, currency) : '—'}
            </Typography>
          </Box>

          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={mode}
            onChange={(_event, value: SplitMode | null) => value && setMode(value)}
          >
            {SPLIT_MODES.map((option) => (
              <ToggleButton key={option} value={option}>
                {t(SPLIT_MODE_LABEL_KEYS[option])}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {members.length <= 1 ? <Alert severity="info">{t('transactions.splitNeedsMembers')}</Alert> : null}

          <Box>
            {/*
              The column is named once here rather than as a `label` on each of
              N identical inputs, which is what made the old rows read as a
              stack of unrelated fields rather than as a table of shares.
            */}
            {mode === 'even' ? null : (
              <Typography
                variant="eyebrow"
                component="div"
                sx={{ color: 'text.secondary', textAlign: 'right', pb: 0.5 }}
              >
                {mode === 'exact' ? t('transactions.share') : t('transactions.weight')}
              </Typography>
            )}

            {members.map((member) => {
              const included = selected.includes(member.userId);

              return (
                <Stack
                  key={member.userId}
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 0 },
                    opacity: included ? 1 : 0.55,
                    transition: 'opacity 160ms',
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={included}
                    onChange={() => toggle(member.userId)}
                    inputProps={{ 'aria-label': t('transactions.includeMember', { name: member.fullName }) }}
                  />
                  <Avatar src={member.avatarUrl ?? undefined} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                    {member.fullName.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                    {member.fullName}
                  </Typography>

                  {mode === 'even' ? null : mode === 'exact' ? (
                    <MoneyField
                      size="small"
                      hideSymbol
                      currency={currency}
                      disabled={!included}
                      value={values[member.userId] ?? ''}
                      onChange={(next) => setValues((current) => ({ ...current, [member.userId]: next }))}
                      aria-label={t('transactions.shareFor', { name: member.fullName })}
                      sx={{ width: 128, flexShrink: 0 }}
                    />
                  ) : (
                    <TextField
                      size="small"
                      inputMode="numeric"
                      placeholder="1"
                      disabled={!included}
                      value={values[member.userId] ?? ''}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [member.userId]: event.target.value }))
                      }
                      aria-label={t('transactions.weightFor', { name: member.fullName })}
                      sx={{ width: 96, flexShrink: 0 }}
                    />
                  )}
                </Stack>
              );
            })}
          </Box>

          {mode === 'even' ? (
            <Typography variant="body2" color="text.secondary">
              {t('transactions.evenExplainer', { count: selected.length })}
            </Typography>
          ) : mode === 'weight' ? (
            <Typography variant="body2" color="text.secondary">
              {t('transactions.weightExplainer')}
            </Typography>
          ) : (
            <Alert severity={exactMatches ? 'success' : 'warning'}>
              {exactTotal === null
                ? t('transactions.splitAmountRequired')
                : exactMatches
                  ? t('transactions.allocatedMatches', { allocated: formatMoney(exactTotal, currency) })
                  : t('transactions.allocatedShort', {
                      allocated: formatMoney(exactTotal, currency),
                      total: formatMoney(total, currency),
                    })}
            </Alert>
          )}
        </Stack>
      </DialogContent>

      {/*
        Destructive action on the left, the pair that closes the dialog on the
        right, with the gap between them owned by `space-between` rather than by
        an empty flex-grow element standing in as a spacer — which is what left
        the three buttons reading as one undifferentiated row.
      */}
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Box>
          {existing.length > 0 ? (
            <Button color="error" onClick={() => void handleClear()} disabled={isLoading}>
              {t('transactions.removeSplit')}
            </Button>
          ) : null}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={isLoading || !canSave}>
            {isLoading ? t('common.saving') : t('transactions.saveSplit')}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
