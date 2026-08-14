import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportPreviewRow } from '../../api/types';
import LedgerList from '../../components/LedgerList';
import LedgerRow from '../../components/LedgerRow';
import type { LedgerTone } from '../../components/LedgerRow';
import { formatDateShort, formatMoney, isNegative } from '../../lib/format';

interface ImportPreviewRowsProps {
  rows: ImportPreviewRow[];
  currency: string;
  /** Line numbers the user has kept. */
  selected: Set<number>;
  loading?: boolean;
  onToggle: (lineNumber: number) => void;
}

/**
 * The rows a file would become.
 *
 * Built from `LedgerRow` rather than a table, because that is what this is: a
 * statement, seen a moment before it becomes one. Reusing the same form means a
 * row in the preview already looks like the row it will turn into, which is the
 * clearest possible way to show someone what they are about to agree to.
 *
 * The spine carries the row's condition — a broken row cannot be imported and
 * is drawn negative, a suspected duplicate is drawn caution, and an ordinary row
 * gets no spine at all, so the eye finds the handful that need a decision.
 */
export default function ImportPreviewRows({
  rows,
  currency,
  selected,
  loading = false,
  onToggle,
}: ImportPreviewRowsProps): ReactElement {
  const { t } = useTranslation();

  return (
    <LedgerList
      loading={loading}
      isEmpty={rows.length === 0}
      emptyMessage={t('imports.noRows')}
      label={t('imports.previewRows')}
    >
      {rows.map((row) => {
        const broken = row.errors.length > 0;
        const duplicate = row.duplicateOfTransactionId !== null || row.duplicateOfLineNumber !== null;

        const tone: LedgerTone = broken ? 'negative' : duplicate ? 'caution' : 'none';
        const toneLabel = broken ? t('imports.rowInvalid') : duplicate ? t('imports.rowDuplicate') : undefined;

        const note = broken
          ? row.errors.map((error) => error.message).join(' · ')
          : row.duplicateOfLineNumber !== null
            ? t('imports.duplicateOfLine', { line: row.duplicateOfLineNumber })
            : duplicate
              ? t('imports.duplicateOfExisting')
              : (row.merchant ?? null);

        return (
          <LedgerRow
            key={row.lineNumber}
            dense
            tone={tone}
            {...(toneLabel ? { toneLabel } : {})}
            lead={row.occurredOn ? formatDateShort(row.occurredOn) : `#${row.lineNumber}`}
            primary={row.description || t('imports.rowNoDescription')}
            secondary={
              note ? (
                <Typography
                  variant="caption"
                  component="div"
                  color={broken ? 'error.main' : 'text.secondary'}
                  sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {note}
                </Typography>
              ) : undefined
            }
            meta={row.categoryName ?? undefined}
            amount={row.amount === null ? '—' : formatMoney(row.amount, currency)}
            amountTone={row.amount === null ? 'inherit' : isNegative(row.amount) ? 'negative' : 'positive'}
            actions={
              <Checkbox
                size="small"
                checked={selected.has(row.lineNumber)}
                // A row with errors cannot be committed at all — the server
                // refuses the whole batch rather than skipping it.
                disabled={broken}
                onChange={() => onToggle(row.lineNumber)}
                inputProps={{
                  'aria-label': t('imports.includeRow', {
                    line: row.lineNumber,
                    description: row.description || String(row.lineNumber),
                  }),
                }}
              />
            }
          />
        );
      })}
    </LedgerList>
  );
}

interface ImportCountsProps {
  counts: { total: number; ready: number; invalid: number; duplicate: number };
}

/** The one-line verdict on a file, above the rows. */
export function ImportCounts({ counts }: ImportCountsProps): ReactElement {
  const { t } = useTranslation();

  const parts: { key: string; value: number; color: string }[] = [
    { key: 'imports.countReady', value: counts.ready, color: 'text.primary' },
    { key: 'imports.countDuplicate', value: counts.duplicate, color: 'tone.caution' },
    { key: 'imports.countInvalid', value: counts.invalid, color: 'tone.negative' },
  ];

  return (
    <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
      {parts
        .filter((part) => part.value > 0 || part.key === 'imports.countReady')
        .map((part) => (
          <Stack key={part.key} direction="row" spacing={0.75} alignItems="baseline">
            <Typography variant="amount" sx={{ color: part.color, fontWeight: 600 }}>
              {part.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t(part.key)}
            </Typography>
          </Stack>
        ))}
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" color="text.secondary">
        {t('imports.countTotal', { count: counts.total })}
      </Typography>
    </Stack>
  );
}
