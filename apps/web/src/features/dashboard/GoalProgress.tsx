import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { ReactElement } from 'react';
import type { DashboardGoal } from '../../api/types';
import Panel from '../../components/Panel';
import { useChartTokens } from '../../lib/chartTokens';
import { formatMoney, formatPercent } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface GoalProgressProps {
  goals: DashboardGoal[];
  currency: string;
}

/**
 * Savings goals as meters. Unlike budgets, a high number here is the good
 * outcome, so these use the single accent hue throughout rather than the
 * severity palette — there is no bad state to warn about.
 */
export default function GoalProgress({ goals, currency }: GoalProgressProps): ReactElement {
  const { t } = useTranslation();
  const tokens = useChartTokens();

  return (
    <Panel title={t('nav.goals')} fullHeight>
      <Stack spacing={2.5}>
        {goals.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('dashboard.noGoals')}
          </Typography>
        ) : (
          goals.map((goal) => (
            <Stack key={goal.id} spacing={0.75}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                <Typography variant="body2" sx={{ fontWeight: 550 }} noWrap>
                  {goal.name}
                </Typography>
                <Typography variant="amount" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {formatPercent(goal.progressPercent)}
                </Typography>
              </Stack>

              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, goal.progressPercent))}
                aria-label={`${goal.name}: ${t('goals.percentSaved', { percent: formatPercent(goal.progressPercent) })}`}
                sx={{
                  bgcolor: alpha(tokens.magnitude, 0.16),
                  '& .MuiLinearProgress-bar': { bgcolor: tokens.magnitude },
                }}
              />

              <Typography variant="caption" color="text.secondary">
                {t('common.ofAmount', {
                  current: formatMoney(goal.currentAmount, currency),
                  target: formatMoney(goal.targetAmount, currency),
                })}
              </Typography>
            </Stack>
          ))
        )}
      </Stack>
    </Panel>
  );
}
