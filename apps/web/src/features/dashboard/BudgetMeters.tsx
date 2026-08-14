import { CheckCircleOutlineIcon, ErrorOutlineIcon, WarningAmberIcon } from '../../icons';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { DashboardBudget } from '../../api/types';
import Panel from '../../components/Panel';
import { useChartTokens } from '../../lib/chartTokens';
import { formatMoney, formatPercent } from '../../lib/format';

interface BudgetMetersProps {
  budgets: DashboardBudget[];
  currency: string;
  loading?: boolean;
}

/** `label` is a catalogue key: this table is evaluated once, at import. */
const STATUS_META = {
  on_track: { icon: CheckCircleOutlineIcon, label: 'budgets.status.onTrack', token: 'good' },
  warning: { icon: WarningAmberIcon, label: 'budgets.status.warning', token: 'warning' },
  exceeded: { icon: ErrorOutlineIcon, label: 'budgets.status.exceeded', token: 'critical' },
} as const;

type KnownStatus = keyof typeof STATUS_META;

function statusMeta(status: string) {
  return STATUS_META[(status in STATUS_META ? status : 'on_track') as KnownStatus];
}

/**
 * One meter per active budget.
 *
 * A ratio against a limit is a meter, not a chart — the fill carries severity
 * and the unfilled track is a lighter step of the same colour, so the state
 * reads across the whole bar. Every meter also carries an icon and a worded
 * status, because the status palette is never allowed to signal alone.
 */
export default function BudgetMeters({ budgets, currency, loading = false }: BudgetMetersProps): ReactElement {
  const { t } = useTranslation();
  const tokens = useChartTokens();

  return (
    <Panel title={t('dashboard.budgetsThisPeriod')} fullHeight>
      <Stack spacing={2.5}>
        {loading ? (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={56} />
            <Skeleton variant="rounded" height={56} />
          </Stack>
        ) : budgets.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('dashboard.noBudgets')}
          </Typography>
        ) : (
          budgets.map((budget) => {
            const meta = statusMeta(budget.status);
            const color = tokens.status[meta.token];
            const StatusIcon = meta.icon;

            return (
              <Stack key={budget.id} spacing={0.75}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                  <Typography variant="body2" sx={{ fontWeight: 550 }}>
                    {budget.name}
                  </Typography>
                  <Typography variant="amount" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {formatMoney(budget.totalSpent, currency)} / {formatMoney(budget.totalLimit, currency)}
                  </Typography>
                </Stack>

                <LinearProgress
                  variant="determinate"
                  // The bar is clamped at 100 so an overspend does not overflow
                  // its track; the percentage beneath still reports the truth.
                  value={Math.min(100, Math.max(0, budget.percentUsed))}
                  aria-label={`${budget.name}: ${formatPercent(budget.percentUsed)}, ${t(meta.label)}`}
                  sx={{
                    bgcolor: alpha(color, 0.16),
                    '& .MuiLinearProgress-bar': { bgcolor: color },
                  }}
                />

                <Stack direction="row" spacing={0.75} alignItems="center">
                  <StatusIcon sx={{ fontSize: 15, color }} />
                  <Typography variant="caption" color="text.secondary">
                    {t(meta.label)} · {t('budgets.percentUsed', { percent: formatPercent(budget.percentUsed) })}
                  </Typography>
                </Stack>
              </Stack>
            );
          })
        )}
      </Stack>
    </Panel>
  );
}
