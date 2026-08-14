import { ClearIcon } from '../../icons';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import type { ReactElement } from 'react';
import type { Account, Category, Tag, TransactionStatus, TransactionType } from '../../api/types';
import { useTranslation } from 'react-i18next';

export interface TransactionFilterState {
  from: string;
  to: string;
  accountIds: string[];
  categoryIds: string[];
  tagIds: string[];
  types: TransactionType[];
  statuses: TransactionStatus[];
  minAmount: string;
  maxAmount: string;
  search: string;
}

export const EMPTY_FILTERS: TransactionFilterState = {
  from: '',
  to: '',
  accountIds: [],
  categoryIds: [],
  tagIds: [],
  types: [],
  statuses: [],
  minAmount: '',
  maxAmount: '',
  search: '',
};

export function hasActiveFilters(filters: TransactionFilterState): boolean {
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'search') return false; // search has its own field, not counted as a "filter chip"
    return Array.isArray(value) ? value.length > 0 : value !== '';
  });
}

/** Catalogue keys: these tables are evaluated once, at import. */
const TYPE_LABEL_KEYS: Record<TransactionType, string> = {
  income: 'common.income',
  expense: 'common.expense',
  transfer: 'common.transfer',
};
const STATUS_LABEL_KEYS: Record<TransactionStatus, string> = {
  cleared: 'transactions.status.cleared',
  pending: 'transactions.status.pending',
  scheduled: 'transactions.status.scheduled',
  void: 'transactions.status.void',
};

interface TransactionFiltersBarProps {
  filters: TransactionFilterState;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  onChange: (filters: TransactionFilterState) => void;
}

function multiSelectSummary(selected: string[], labels: Record<string, string>, placeholder: string): string {
  if (selected.length === 0) return placeholder;
  if (selected.length === 1) return labels[selected[0]!] ?? selected[0]!;
  return `${selected.length} selected`;
}

/**
 * All filters live in one bar rather than a slide-out panel: the list a user
 * of a finance app filters most (date range, account) benefits from staying
 * one click away rather than behind a toggle.
 */
export default function TransactionFiltersBar({
  filters,
  accounts,
  categories,
  tags,
  onChange,
}: TransactionFiltersBarProps): ReactElement {
  const { t } = useTranslation();
  const set = <K extends keyof TransactionFilterState>(key: K, value: TransactionFilterState[K]): void => {
    onChange({ ...filters, [key]: value });
  };

  // The key tables above are static; these are the same tables resolved for
  // the language in force, which is what the summary helper and the menu items
  // both want.
  const typeLabels = Object.fromEntries(
    Object.entries(TYPE_LABEL_KEYS).map(([value, key]) => [value, t(key)]),
  ) as Record<TransactionType, string>;
  const statusLabels = Object.fromEntries(
    Object.entries(STATUS_LABEL_KEYS).map(([value, key]) => [value, t(key)]),
  ) as Record<TransactionStatus, string>;

  const accountLabels = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const tagLabels = Object.fromEntries(tags.map((t) => [t.id, t.name]));

  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          }}
        >
          <TextField
            label={t('common.search')}
            placeholder={t('transactions.searchPlaceholder')}
            size="small"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            InputProps={{
              endAdornment: filters.search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => set('search', '')} aria-label={t('transactions.clearSearch')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />

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

          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: '1fr 1fr' }}>
            <TextField
              label={t('transactions.minAmount')}
              size="small"
              value={filters.minAmount}
              onChange={(e) => set('minAmount', e.target.value)}
            />
            <TextField
              label={t('transactions.maxAmount')}
              size="small"
              value={filters.maxAmount}
              onChange={(e) => set('maxAmount', e.target.value)}
            />
          </Box>

          <Select
            multiple
            displayEmpty
            size="small"
            value={filters.accountIds}
            onChange={(e: SelectChangeEvent<string[]>) =>
              set('accountIds', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)
            }
            renderValue={(selected) =>
              `${t('common.account')}: ${multiSelectSummary(selected, accountLabels, t('common.any'))}`
            }
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
            renderValue={(selected) =>
              `${t('common.category')}: ${multiSelectSummary(selected, categoryLabels, t('common.any'))}`
            }
          >
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                <Checkbox size="small" checked={filters.categoryIds.includes(category.id)} />
                <ListItemText primary={`${' '.repeat(category.depth * 2)}${category.name}`} />
              </MenuItem>
            ))}
          </Select>

          <Select
            multiple
            displayEmpty
            size="small"
            value={filters.types}
            onChange={(e: SelectChangeEvent<string[]>) =>
              set(
                'types',
                (typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value) as TransactionType[],
              )
            }
            renderValue={(selected) =>
              `${t('transactions.type')}: ${multiSelectSummary(selected, typeLabels, t('common.any'))}`
            }
          >
            {(Object.keys(TYPE_LABEL_KEYS) as TransactionType[]).map((type) => (
              <MenuItem key={type} value={type}>
                <Checkbox size="small" checked={filters.types.includes(type)} />
                <ListItemText primary={typeLabels[type]} />
              </MenuItem>
            ))}
          </Select>

          <Select
            multiple
            displayEmpty
            size="small"
            value={filters.statuses}
            onChange={(e: SelectChangeEvent<string[]>) =>
              set(
                'statuses',
                (typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value) as TransactionStatus[],
              )
            }
            renderValue={(selected) =>
              `${t('common.status')}: ${multiSelectSummary(selected, statusLabels, t('common.any'))}`
            }
          >
            {(Object.keys(STATUS_LABEL_KEYS) as TransactionStatus[]).map((status) => (
              <MenuItem key={status} value={status}>
                <Checkbox size="small" checked={filters.statuses.includes(status)} />
                <ListItemText primary={statusLabels[status]} />
              </MenuItem>
            ))}
          </Select>

          {/*
            Selecting several tags matches a row carrying *any* of them, which is
            what the server's `tagIds` filter does — an EXISTS over the join,
            not an intersection.
          */}
          <Select
            multiple
            displayEmpty
            size="small"
            disabled={tags.length === 0}
            value={filters.tagIds}
            onChange={(e: SelectChangeEvent<string[]>) =>
              set('tagIds', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)
            }
            renderValue={(selected) =>
              `${t('transactions.tag')}: ${
                tags.length === 0
                  ? t('transactions.noTags')
                  : multiSelectSummary(selected, tagLabels, t('common.any'))
              }`
            }
          >
            {tags.map((tag) => (
              <MenuItem key={tag.id} value={tag.id}>
                <Checkbox size="small" checked={filters.tagIds.includes(tag.id)} />
                <ListItemText primary={tag.name} />
              </MenuItem>
            ))}
          </Select>

          <Tooltip title={t('transactions.clearFilters')}>
            <span>
              <IconButton
                onClick={() => onChange(EMPTY_FILTERS)}
                disabled={!hasActiveFilters(filters) && !filters.search}
                aria-label={t('transactions.clearFilters')}
              >
                <ClearIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  );
}
