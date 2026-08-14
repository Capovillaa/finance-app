import { DownloadIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ReactElement } from 'react';
import { useExportTransactionsCsvMutation } from '../../api/endpoints/reports';
import type { Account, Category } from '../../api/types';
import Panel from '../../components/Panel';
import { getApiErrorMessage } from '../../lib/apiError';
import { downloadText } from '../../lib/download';
import { todayIso } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface TransactionExportPanelProps {
  workspaceId: string;
  accounts: Account[];
  categories: Category[];
}

interface ExportFilterState {
  from: string;
  to: string;
  accountIds: string[];
  categoryIds: string[];
}

const EMPTY: ExportFilterState = { from: '', to: '', accountIds: [], categoryIds: [] };

function summarise(selected: string[], labels: Record<string, string>, placeholder: string): string {
  if (selected.length === 0) return placeholder;
  if (selected.length === 1) return labels[selected[0]!] ?? selected[0]!;
  return `${selected.length} selected`;
}

/**
 * Downloads the ledger as CSV.
 *
 * The controls mirror `TransactionFiltersBar`'s subset that the export endpoint
 * actually accepts — date range, accounts, categories — rather than every filter
 * the ledger screen offers, because a control that silently does nothing is
 * worse than an absent one.
 *
 * Leaving everything blank exports the whole ledger, which is the common case
 * and so needs no ceremony.
 */
export default function TransactionExportPanel({
  workspaceId,
  accounts,
  categories,
}: TransactionExportPanelProps): ReactElement {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<ExportFilterState>(EMPTY);
  const [exportCsv, { isLoading, error }] = useExportTransactionsCsvMutation();

  const set = <K extends keyof ExportFilterState>(key: K, value: ExportFilterState[K]): void => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const accountLabels = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const handleExport = async (): Promise<void> => {
    const csv = await exportCsv({ workspaceId, filters })
      .unwrap()
      .catch(() => null);

    if (csv === null) return;
    downloadText(csv, `transactions-${todayIso()}.csv`);
  };

  return (
    <Panel title={t('reports.exportTitle')}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {t('reports.exportExplainer')}
        </Typography>

        {error ? <Alert severity="error">{getApiErrorMessage(error, t('reports.exportFailed'))}</Alert> : null}

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          }}
        >
          <TextField
            label={t('common.from')}
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filters.from}
            onChange={(e) => set('from', e.target.value)}
          />

          <TextField
            label={t('common.to')}
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filters.to}
            onChange={(e) => set('to', e.target.value)}
          />

          <Select
            multiple
            displayEmpty
            size="small"
            value={filters.accountIds}
            onChange={(e: SelectChangeEvent<string[]>) =>
              set('accountIds', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)
            }
            renderValue={(selected) => `Account: ${summarise(selected, accountLabels, 'Any')}`}
          >
            {accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>
                <Checkbox size="small" checked={filters.accountIds.includes(account.id)} />
                <ListItemText primary={account.name} />
              </MenuItem>
            ))}
          </Select>

          <Select
            multiple
            displayEmpty
            size="small"
            value={filters.categoryIds}
            onChange={(e: SelectChangeEvent<string[]>) =>
              set('categoryIds', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)
            }
            renderValue={(selected) => `Category: ${summarise(selected, categoryLabels, 'Any')}`}
          >
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                <Checkbox size="small" checked={filters.categoryIds.includes(category.id)} />
                <ListItemText primary={category.name} />
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={() => setFilters(EMPTY)} disabled={isLoading}>
            {t('common.reset')}
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => void handleExport()}
            disabled={isLoading}
          >
            {isLoading ? t('common.preparing') : t('reports.downloadCsv')}
          </Button>
        </Stack>
      </Stack>
    </Panel>
  );
}
