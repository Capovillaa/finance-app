import { ClearIcon, FilterIcon } from '../../icons';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, type ReactElement, type ReactNode } from 'react';
import type { Account, Category, Tag, TransactionStatus, TransactionType } from '../../api/types';
import MoneyField from '../../components/MoneyField';
import { formatDate, formatMoney } from '../../lib/format';
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
  /** Shows soft-deleted rows too, which is the only way to reach restore. */
  includeDeleted: boolean;
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
  includeDeleted: false,
};

export function hasActiveFilters(filters: TransactionFilterState): boolean {
  return activeFilterCount(filters) > 0;
}

/**
 * How many filters are narrowing the list, for the badge on the button.
 *
 * Search is excluded because it has its own visible field — counting it would
 * make the badge disagree with what the panel behind the button contains.
 */
export function activeFilterCount(filters: TransactionFilterState): number {
  return Object.entries(filters).filter(([key, value]) => {
    if (key === 'search') return false;
    // A boolean is active only when it is on: `false !== ''` would otherwise
    // count the deleted switch as a filter permanently.
    if (typeof value === 'boolean') return value;
    return Array.isArray(value) ? value.length > 0 : value !== '';
  }).length;
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
  /** Denominates the amount range. The workspace's base currency. */
  currency: string;
  onChange: (filters: TransactionFilterState) => void;
}

function multiSelectSummary(
  selected: string[],
  labels: Record<string, string>,
  placeholder: string,
  manySelected: (count: number) => string,
): string {
  if (selected.length === 0) return placeholder;
  if (selected.length === 1) return labels[selected[0]!] ?? selected[0]!;
  return manySelected(selected.length);
}

/**
 * Searching and narrowing the ledger.
 *
 * This used to put all nine controls in one four-column grid, on the reasoning
 * that a finance app's most-used filters should never be a click away. In use
 * that turned out to be the wrong trade: nine controls of identical visual
 * weight, most of them unlabelled `Select`s carrying their own name inside
 * their value ("Account: Any"), reflowed into two or three ragged rows and read
 * as spilled rather than arranged — and it still took a click *into* each one
 * to find out what it held.
 *
 * The shape now is the one that makes state visible without keeping every
 * control on screen: search stays out in the open because it is typed into
 * rather than chosen from, everything else moves behind one button that carries
 * a count, and whatever is currently narrowing the list is spelled out beneath
 * as chips you can strike off one at a time. Nothing is further away than
 * before — the panel is one click, the same click the old `Select` needed — and
 * the row above it is now legible at a glance.
 */
export default function TransactionFiltersBar({
  filters,
  accounts,
  categories,
  tags,
  currency,
  onChange,
}: TransactionFiltersBarProps): ReactElement {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

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

  // "3 selected" is a sentence, so it is a catalogue entry with a count rather
  // than string concatenation — the plural form differs by language.
  const manySelected = (count: number): string => t('transactions.nSelected', { count });

  const accountLabels = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const tagLabels = Object.fromEntries(tags.map((tag) => [tag.id, tag.name]));

  const count = activeFilterCount(filters);

  /** One removable chip per active filter, in the order the panel lists them. */
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (filters.from) {
    chips.push({
      key: 'from',
      label: `${t('common.from')} ${formatDate(filters.from)}`,
      clear: () => set('from', ''),
    });
  }
  if (filters.to) {
    chips.push({ key: 'to', label: `${t('common.to')} ${formatDate(filters.to)}`, clear: () => set('to', '') });
  }
  if (filters.accountIds.length > 0) {
    chips.push({
      key: 'accounts',
      label: `${t('common.account')}: ${multiSelectSummary(filters.accountIds, accountLabels, '', manySelected)}`,
      clear: () => set('accountIds', []),
    });
  }
  if (filters.categoryIds.length > 0) {
    chips.push({
      key: 'categories',
      label: `${t('common.category')}: ${multiSelectSummary(filters.categoryIds, categoryLabels, '', manySelected)}`,
      clear: () => set('categoryIds', []),
    });
  }
  if (filters.types.length > 0) {
    chips.push({
      key: 'types',
      label: `${t('transactions.type')}: ${multiSelectSummary(filters.types, typeLabels, '', manySelected)}`,
      clear: () => set('types', []),
    });
  }
  if (filters.statuses.length > 0) {
    chips.push({
      key: 'statuses',
      label: `${t('common.status')}: ${multiSelectSummary(filters.statuses, statusLabels, '', manySelected)}`,
      clear: () => set('statuses', []),
    });
  }
  if (filters.tagIds.length > 0) {
    chips.push({
      key: 'tags',
      label: `${t('transactions.tag')}: ${multiSelectSummary(filters.tagIds, tagLabels, '', manySelected)}`,
      clear: () => set('tagIds', []),
    });
  }
  if (filters.minAmount) {
    chips.push({
      key: 'min',
      label: `≥ ${formatMoney(filters.minAmount, currency)}`,
      clear: () => set('minAmount', ''),
    });
  }
  if (filters.maxAmount) {
    chips.push({
      key: 'max',
      label: `≤ ${formatMoney(filters.maxAmount, currency)}`,
      clear: () => set('maxAmount', ''),
    });
  }
  if (filters.includeDeleted) {
    chips.push({
      key: 'deleted',
      label: t('transactions.showDeleted'),
      clear: () => set('includeDeleted', false),
    });
  }

  const section = (label: string, children: ReactNode): ReactElement => (
    <Box>
      {/*
        A floating field label sits on the field's top border, so a tight margin
        here reads as the group heading colliding with the first field's own
        label rather than sitting above the group.
      */}
      <Typography variant="eyebrow" component="div" sx={{ color: 'text.secondary', mb: 1.25 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );

  const multiSelect = (
    value: string[],
    onSelect: (next: string[]) => void,
    labels: Record<string, string>,
    options: { id: string; label: string }[],
    disabled = false,
  ): ReactElement => (
    <Select
      multiple
      displayEmpty
      size="small"
      fullWidth
      disabled={disabled}
      value={value}
      onChange={(event: SelectChangeEvent<string[]>) =>
        onSelect(typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value)
      }
      renderValue={(selected) => multiSelectSummary(selected, labels, t('common.any'), manySelected)}
    >
      {options.map((option) => (
        <MenuItem key={option.id} value={option.id}>
          <Checkbox size="small" checked={value.includes(option.id)} />
          <ListItemText primary={option.label} />
        </MenuItem>
      ))}
    </Select>
  );

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          label={t('common.search')}
          placeholder={t('transactions.searchPlaceholder')}
          size="small"
          fullWidth
          value={filters.search}
          onChange={(event) => set('search', event.target.value)}
          slotProps={{
            input: {
              endAdornment: filters.search ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => set('search', '')}
                    aria-label={t('transactions.clearSearch')}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />

        <Badge badgeContent={count} color="primary" overlap="circular">
          <Button
            variant="outlined"
            startIcon={<FilterIcon />}
            onClick={(event) => setAnchor(event.currentTarget)}
            sx={{ flexShrink: 0, height: 40 }}
          >
            {t('transactions.filters')}
          </Button>
        </Badge>

        <Tooltip title={t('transactions.clearFilters')}>
          <span>
            <IconButton
              onClick={() => onChange(EMPTY_FILTERS)}
              disabled={count === 0 && !filters.search}
              aria-label={t('transactions.clearFilters')}
            >
              <ClearIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/*
        What is narrowing the list, spelled out. This is the half the old bar
        could not do: a `Select` reading "Account: 3 selected" states that three
        were chosen and not which, and four of them side by side state nothing
        at all at a glance.
      */}
      {chips.length > 0 ? (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {chips.map((chip) => (
            <Chip key={chip.key} size="small" variant="outlined" label={chip.label} onDelete={chip.clear} />
          ))}
        </Stack>
      ) : null}

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: '100vw', p: 2.5 } } }}
      >
        <Stack spacing={2.5}>
          {section(
            t('transactions.dateRange'),
            <Stack direction="row" spacing={1}>
              <TextField
                type="date"
                size="small"
                fullWidth
                label={t('common.from')}
                InputLabelProps={{ shrink: true }}
                value={filters.from}
                onChange={(event) => set('from', event.target.value)}
              />
              <TextField
                type="date"
                size="small"
                fullWidth
                label={t('common.to')}
                InputLabelProps={{ shrink: true }}
                value={filters.to}
                onChange={(event) => set('to', event.target.value)}
              />
            </Stack>,
          )}

          {section(
            t('transactions.amountRange'),
            <Stack direction="row" spacing={1}>
              <MoneyField
                size="small"
                fullWidth
                currency={currency}
                label={t('transactions.minAmount')}
                value={filters.minAmount}
                onChange={(next) => set('minAmount', next)}
              />
              <MoneyField
                size="small"
                fullWidth
                currency={currency}
                label={t('transactions.maxAmount')}
                value={filters.maxAmount}
                onChange={(next) => set('maxAmount', next)}
              />
            </Stack>,
          )}

          <Divider />

          {section(
            t('common.account'),
            multiSelect(
              filters.accountIds,
              (next) => set('accountIds', next),
              accountLabels,
              accounts.map((account) => ({ id: account.id, label: account.name })),
            ),
          )}

          {section(
            t('common.category'),
            multiSelect(
              filters.categoryIds,
              (next) => set('categoryIds', next),
              categoryLabels,
              categories.map((category) => ({
                id: category.id,
                label: `${' '.repeat(category.depth * 2)}${category.name}`,
              })),
            ),
          )}

          {section(
            t('transactions.type'),
            multiSelect(
              filters.types,
              (next) => set('types', next as TransactionType[]),
              typeLabels,
              (Object.keys(TYPE_LABEL_KEYS) as TransactionType[]).map((type) => ({
                id: type,
                label: typeLabels[type],
              })),
            ),
          )}

          {section(
            t('common.status'),
            multiSelect(
              filters.statuses,
              (next) => set('statuses', next as TransactionStatus[]),
              statusLabels,
              (Object.keys(STATUS_LABEL_KEYS) as TransactionStatus[]).map((status) => ({
                id: status,
                label: statusLabels[status],
              })),
            ),
          )}

          {/*
            Selecting several tags matches a row carrying *any* of them, which is
            what the server's `tagIds` filter does — an EXISTS over the join,
            not an intersection.
          */}
          {section(
            t('transactions.tag'),
            tags.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('transactions.noTags')}
              </Typography>
            ) : (
              multiSelect(
                filters.tagIds,
                (next) => set('tagIds', next),
                tagLabels,
                tags.map((tag) => ({ id: tag.id, label: tag.name })),
              )
            ),
          )}

          <Divider />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={filters.includeDeleted}
                onChange={(event) => set('includeDeleted', event.target.checked)}
              />
            }
            label={<Typography variant="body2">{t('transactions.showDeleted')}</Typography>}
          />
        </Stack>
      </Popover>
    </Stack>
  );
}
