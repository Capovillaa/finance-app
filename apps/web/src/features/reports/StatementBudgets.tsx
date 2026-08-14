import { CheckCircleOutlineIcon, ErrorOutlineIcon, WarningAmberIcon } from '../../icons';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { ReactElement } from 'react';
import type { StatementBudget } from '../../api/types';
import Panel from '../../components/Panel';
import { useChartTokens } from '../../lib/chartTokens';
import { formatMoney, formatPercent } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface StatementBudgetsProps {
  budgets: StatementBudget[];
  currency: string;
  loading?: boolean;
}

/**
 * The workspace's default alert threshold, from `alert_threshold_percent`'s
 * default in the budgets service.
 *
 * The statement payload reports `percentUsed` but not each budget's own
 * configured threshold, so the band here is the default rather than the
 * per-budget truth. Over-limit — the only judgement that needs no threshold —
 * is always exact; the Budgets screen is where a budget's configured warning
 * point is authoritative.
 */
const DEFAULT_WARNING_PERCENT = 80;

/** `label` is a catalogue key: this table is evaluated once, at import. */
const STATUS_META = {
  good: { icon: CheckCircleOutlineIcon, label: 'reports.withinLimit' },
  warning: { icon: WarningAmberIcon, label: 'budgets.status.warning' },
  critical: { icon: ErrorOutlineIcon, label: 'budgets.status.exceeded' },
} as const;

function statusToken(percentUsed: number): keyof typeof STATUS_META {
  if (percentUsed >= 100) return 'critical';
  if (percentUsed >= DEFAULT_WARNING_PERCENT) return 'warning';
  return 'good';
}

/**
 * How the month's budgets finished.
 *
 * The same meter form as the dashboard, because it answers the same question —
 * a ratio against a limit — and a reader moving between the two screens should
 * not have to relearn the encoding. Severity is never colour alone: each meter
 * carries an icon and a worded status.
 */
export default function StatementBudgets({ budgets, currency, loading = false }: StatementBudgetsProps): ReactElement {
  const { t } = useTranslation();
  const tokens = useChartTokens();

  return (
    <Panel title={t('reports.budgetPerformance')} fullHeight>
      <Stack spacing={2.5}>
        {loading ? (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={56} />
            <Skeleton variant="rounded" height={56} />
          </Stack>
        ) : budgets.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('reports.noBudgets')}
          </Typography>
        ) : (
          budgets.map((budget) => {
            const token = statusToken(budget.percentUsed);
            const meta = STATUS_META[token];
            const color = tokens.status[token];
            const StatusIcon = meta.icon;

            return (
              <Stack key={budget.name} spacing={0.75}>
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
                  value={Math.min(100, Math.max(0, budget.percentUsed))}
                  aria-label={`${budget.name}: ${formatPercent(budget.percentUsed)} used, ${meta.label}`}
                  sx={{
                    bgcolor: alpha(color, 0.16),
                    '& .MuiLinearProgress-bar': { bgcolor: color },
                  }}
                />

                <Stack direction="row" spacing={0.75} alignItems="center">
                  <StatusIcon sx={{ fontSize: 15, color }} />
                  <Typography variant="caption" color="text.secondary">
                    {meta.label} · {formatPercent(budget.percentUsed)} used
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
