import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category } from '../../api/types';
import { ClearIcon } from '../../icons';

interface BulkActionsBarProps {
  selectedCount: number;
  categories: Category[];
  applying: boolean;
  onApply: (categoryId: string | null) => void;
  onClear: () => void;
}

/**
 * What you can do to the rows you have ticked.
 *
 * It sits inside the ledger card, above the first line, and only exists while
 * something is selected — a permanently visible toolbar with nothing to act on
 * is a row of disabled controls, which reads as broken rather than as waiting.
 *
 * `''` is the placeholder and `__none__` is a real choice meaning "clear the
 * category": the API distinguishes `categoryId: null` from an absent field, and
 * filing a bad import back to uncategorised is a thing people actually do.
 */
export default function BulkActionsBar({
  selectedCount,
  categories,
  applying,
  onApply,
  onClear,
}: BulkActionsBarProps): ReactElement {
  const { t } = useTranslation();
  const [categoryId, setCategoryId] = useState('');

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      sx={{
        px: 2,
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 550, flexGrow: 1 }}>
        {t('transactions.selectedCount', { count: selectedCount })}
      </Typography>

      <TextField
        select
        size="small"
        label={t('transactions.bulkCategorise')}
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        SelectProps={{ displayEmpty: true }}
        InputLabelProps={{ shrink: true }}
        sx={{ minWidth: 220 }}
      >
        <MenuItem value="">{t('transactions.choose')}</MenuItem>
        <MenuItem value="__none__">{t('common.uncategorised')}</MenuItem>
        {categories.map((category) => (
          <MenuItem key={category.id} value={category.id}>
            {`${' '.repeat(category.depth * 2)}${category.name}`}
          </MenuItem>
        ))}
      </TextField>

      <Button
        variant="contained"
        size="small"
        disabled={categoryId === '' || applying}
        onClick={() => onApply(categoryId === '__none__' ? null : categoryId)}
      >
        {applying ? t('common.saving') : t('common.apply')}
      </Button>

      <Button size="small" startIcon={<ClearIcon />} onClick={onClear}>
        {t('transactions.clearSelection')}
      </Button>
    </Stack>
  );
}
