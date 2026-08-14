import { AddIcon, CheckCircleOutlineIcon, DeleteIcon, ErrorOutlineIcon, MoreVertIcon, SettingsIcon, TuneIcon, UpdateIcon, WarningAmberIcon } from '../../icons';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useState, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetLineProgress, BudgetProgress, WorkspaceRole } from '../../api/types';
import LedgerRow from '../../components/LedgerRow';
import { formatDate, formatMoney, formatPercent } from '../../lib/format';
import { canEdit } from '../../lib/permissions';
import { useChartTokens } from '../../lib/chartTokens';
import { BUDGET_TONE } from '../../lib/tone';
import { BUDGET_PERIOD_LABEL_KEYS } from './budgetSchemas';

/** `label` is a catalogue key: this table is evaluated once, at import. */
const STATUS_META = {
  on_track: { icon: CheckCircleOutlineIcon, label: 'budgets.status.onTrack', token: 'good' },
  warning: { icon: WarningAmberIcon, label: 'budgets.status.warning', token: 'warning' },
  exceeded: { icon: ErrorOutlineIcon, label: 'budgets.status.exceeded', token: 'critical' },
} as const;

interface BudgetCardProps {
  budget: BudgetProgress;
  role: WorkspaceRole | undefined;
  onSettings: () => void;
  onAddLine: () => void;
  onRollover: () => void;
  onDelete: () => void;
  onReviseLine: (line: BudgetLineProgress) => void;
  onDeleteLine: (line: BudgetLineProgress) => void;
}

export default function BudgetCard({
  budget,
  role,
  onSettings,
  onAddLine,
  onRollover,
  onDelete,
  onReviseLine,
  onDeleteLine,
}: BudgetCardProps): ReactElement {
  const { t } = useTranslation();
  const theme = useTheme();
  const tokens = useChartTokens();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const editable = canEdit(role);
  const periodEnded = budget.endDate < new Date().toISOString().slice(0, 10);

  const overallMeta = STATUS_META[budget.percentUsed >= 100 ? 'exceeded' : budget.percentUsed >= 80 ? 'warning' : 'on_track'];
  const overallColor = tokens.status[overallMeta.token];

  return (
    <Card sx={{ opacity: budget.isActive ? 1 : 0.6 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Stack spacing={0.5}>
            <Typography variant="h3">{budget.name}</Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip label={t(BUDGET_PERIOD_LABEL_KEYS[budget.period])} size="small" variant="outlined" />
              <Typography variant="caption" color="text.secondary">
                {formatDate(budget.startDate)} – {formatDate(budget.endDate)}
              </Typography>
              {budget.rollover ? <Chip label={t('budgets.rollover')} size="small" /> : null}
              {!budget.isActive ? <Chip label={t('budgets.inactive')} size="small" /> : null}
            </Stack>
          </Stack>

          {editable ? (
            <>
              <IconButton size="small" onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)} aria-label={t('budgets.actions')}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem
                  onClick={() => {
                    setAnchorEl(null);
                    onSettings();
                  }}
                >
                  <ListItemIcon>
                    <SettingsIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{t('nav.settings')}</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setAnchorEl(null);
                    onAddLine();
                  }}
                >
                  <ListItemIcon>
                    <AddIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{t('budgets.addCategoryLimit')}</ListItemText>
                </MenuItem>
                {periodEnded ? (
                  <MenuItem
                    onClick={() => {
                      setAnchorEl(null);
                      onRollover();
                    }}
                  >
                    <ListItemIcon>
                      <UpdateIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{t('budgets.rollToNext')}</ListItemText>
                  </MenuItem>
                ) : null}
                <MenuItem
                  onClick={() => {
                    setAnchorEl(null);
                    onDelete();
                  }}
                  sx={{ color: 'error.main' }}
                >
                  <ListItemIcon>
                    <DeleteIcon fontSize="small" color="error" />
                  </ListItemIcon>
                  <ListItemText>Delete</ListItemText>
                </MenuItem>
              </Menu>
            </>
          ) : null}
        </Stack>

        <Stack spacing={0.75} sx={{ mt: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="eyebrow" color="text.secondary">
              {t('common.total')}
            </Typography>
            <Typography variant="amount" color="text.secondary">
              {formatMoney(budget.totalSpent, budget.currency)} / {formatMoney(budget.totalLimit, budget.currency)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, budget.percentUsed))}
            aria-label={`${t('common.total')}: ${formatPercent(budget.percentUsed)}, ${t(overallMeta.label)}`}
            sx={{
              bgcolor: alpha(overallColor, 0.16),
              '& .MuiLinearProgress-bar': { bgcolor: overallColor },
            }}
          />
          <Stack direction="row" spacing={0.75} alignItems="center">
            <overallMeta.icon sx={{ fontSize: 15, color: overallColor }} />
            <Typography variant="caption" color="text.secondary">
              {t(overallMeta.label)} ·{' '}
              {t('budgets.percentUsed', { percent: formatPercent(budget.percentUsed) })} ·{' '}
              {t('budgets.periodElapsed', { percent: formatPercent(budget.periodProgressPercent, 0) })}
            </Typography>
          </Stack>
        </Stack>

        {/* Each category limit is a statement line: the same hairline rule, the
            same right-aligned tabular figure, and the same 3px spine carrying
            the state — with the line's own meter tucked under its name, since a
            ratio against a limit is the one thing a number alone does not show. */}
        <Box sx={{ mx: -2.5, mt: 2, borderTop: '1px solid', borderColor: 'divider' }} role="list">
          {budget.lines.map((line) => {
            const meta = STATUS_META[line.status];
            const color = tokens.status[meta.token];
            const state = BUDGET_TONE[line.status];

            return (
              <LedgerRow
                key={line.id}
                dense
                lead={
                  <Box
                    aria-hidden
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: line.categoryColor ?? theme.palette.text.disabled,
                    }}
                  />
                }
                primary={line.categoryName}
                secondary={
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, Math.max(0, line.percentUsed))}
                    aria-label={`${line.categoryName}: ${formatPercent(line.percentUsed)}, ${t(meta.label)}`}
                    sx={{
                      mt: 0.5,
                      height: 5,
                      bgcolor: alpha(color, 0.16),
                      '& .MuiLinearProgress-bar': { bgcolor: color },
                    }}
                  />
                }
                amount={formatMoney(line.spentAmount, budget.currency)}
                amountCaption={`of ${formatMoney(line.limitAmount, budget.currency)}`}
                tone={state.tone}
                toneLabel={t(state.label)}
                actions={
                  editable ? (
                    <Stack direction="row" spacing={0}>
                      <Tooltip title={t('budgets.reviseLimit')}>
                        <IconButton
                          size="small"
                          onClick={() => onReviseLine(line)}
                          aria-label={`Revise limit for ${line.categoryName}`}
                        >
                          <TuneIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('budgets.removeLine')}>
                        <IconButton
                          size="small"
                          onClick={() => onDeleteLine(line)}
                          aria-label={`Remove ${line.categoryName}`}
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ) : null
                }
              />
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
