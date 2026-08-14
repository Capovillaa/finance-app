import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ImportColumn,
  ImportColumnMapping,
  ImportDateFormat,
  ImportOptionOverrides,
  ImportOptions,
  ImportSignConvention,
} from '../../api/types';

/**
 * Which mapping fields are worth showing depends on how the file expresses
 * direction: a debit/credit file has no single amount column, and a signed file
 * has no flag column. Showing all of them at once would offer the user three
 * mutually exclusive ways to say the same thing.
 */
const COLUMNS_BY_CONVENTION: Record<ImportSignConvention, ImportColumn[]> = {
  signed: ['date', 'description', 'amount', 'merchant', 'category', 'notes', 'externalId'],
  debit_credit: ['date', 'description', 'debit', 'credit', 'merchant', 'category', 'notes', 'externalId'],
  direction_flag: ['date', 'description', 'amount', 'direction', 'merchant', 'category', 'notes', 'externalId'],
};

const COLUMN_LABEL_KEYS: Record<ImportColumn, string> = {
  date: 'imports.column.date',
  description: 'imports.column.description',
  amount: 'imports.column.amount',
  debit: 'imports.column.debit',
  credit: 'imports.column.credit',
  direction: 'imports.column.direction',
  merchant: 'imports.column.merchant',
  notes: 'imports.column.notes',
  category: 'imports.column.category',
  externalId: 'imports.column.externalId',
};

const SIGN_CONVENTIONS: ImportSignConvention[] = ['signed', 'debit_credit', 'direction_flag'];
const DATE_FORMATS: ImportDateFormat[] = ['iso', 'dmy', 'mdy'];

interface ImportMappingEditorProps {
  headers: string[];
  options: ImportOptions;
  /** True when the file reads either way round and the user must settle it. */
  dateFormatAmbiguous: boolean;
  /** The mapping was carried over from this account's last import. */
  mappingRecalled: boolean;
  disabled?: boolean;
  /** Applying any change re-runs the preview against the same file. */
  onChange: (overrides: ImportOptionOverrides) => void;
}

/**
 * How the file is being read, laid out so every inference the server made is
 * visible and reversible. The point of preview-then-commit is that nothing is
 * implicit: the date layout, the decimal mark and the direction convention are
 * the three things that silently corrupt a whole statement when guessed wrong,
 * so all three are stated here as controls rather than buried in the result.
 */
export default function ImportMappingEditor({
  headers,
  options,
  dateFormatAmbiguous,
  mappingRecalled,
  disabled = false,
  onChange,
}: ImportMappingEditorProps): ReactElement {
  const { t } = useTranslation();

  const columns = COLUMNS_BY_CONVENTION[options.signConvention];
  const required: ImportColumn[] = ['date', 'description'];

  const setMapping = (column: ImportColumn, value: string): void => {
    const mapping: ImportColumnMapping = { ...options.mapping };
    if (value === '') delete mapping[column];
    else mapping[column] = Number(value);
    onChange({ mapping });
  };

  return (
    <Stack spacing={2}>
      {dateFormatAmbiguous ? (
        <Alert severity="warning">{t('imports.dateAmbiguous')}</Alert>
      ) : null}
      {mappingRecalled ? <Alert severity="info">{t('imports.mappingRecalled')}</Alert> : null}

      <Box
        sx={{
          display: 'grid',
          // `minmax(0, 1fr)`, never a bare `1fr`: a bare track keeps
          // `min-width: auto` and a long header name would push the dialog wide.
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 2,
        }}
      >
        <TextField
          select
          size="small"
          label={t('imports.signConvention')}
          disabled={disabled}
          value={options.signConvention}
          onChange={(event) => onChange({ signConvention: event.target.value as ImportSignConvention })}
          helperText={t(`imports.sign.${options.signConvention}Hint`)}
        >
          {SIGN_CONVENTIONS.map((convention) => (
            <MenuItem key={convention} value={convention}>
              {t(`imports.sign.${convention}`)}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label={t('imports.dateFormat')}
          disabled={disabled}
          value={options.dateFormat}
          onChange={(event) => onChange({ dateFormat: event.target.value as ImportDateFormat })}
          error={dateFormatAmbiguous}
        >
          {DATE_FORMATS.map((format) => (
            <MenuItem key={format} value={format}>
              {t(`imports.dateFormats.${format}`)}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label={t('imports.decimalSeparator')}
          disabled={disabled}
          value={options.decimalSeparator}
          onChange={(event) => onChange({ decimalSeparator: event.target.value as '.' | ',' })}
        >
          <MenuItem value=".">{t('imports.decimalDot')}</MenuItem>
          <MenuItem value=",">{t('imports.decimalComma')}</MenuItem>
        </TextField>
      </Box>

      <Stack spacing={1}>
        <Typography variant="eyebrow" color="text.secondary">
          {t('imports.columns')}
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          {columns.map((column) => {
            const value = options.mapping[column];

            return (
              <TextField
                key={column}
                select
                size="small"
                label={t(COLUMN_LABEL_KEYS[column])}
                disabled={disabled}
                required={required.includes(column)}
                value={value === undefined ? '' : String(value)}
                onChange={(event) => setMapping(column, event.target.value)}
                // An empty-valued placeholder needs `displayEmpty`, and the
                // label then needs shrinking by hand or it overlaps the text.
                SelectProps={{ displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
                error={required.includes(column) && value === undefined}
              >
                <MenuItem value="">
                  <Typography variant="body2" color="text.secondary" component="span">
                    {t('imports.notMapped')}
                  </Typography>
                </MenuItem>
                {headers.map((header, index) => (
                  <MenuItem key={`${header}-${index}`} value={String(index)}>
                    {header}
                  </MenuItem>
                ))}
              </TextField>
            );
          })}
        </Box>
      </Stack>
    </Stack>
  );
}
