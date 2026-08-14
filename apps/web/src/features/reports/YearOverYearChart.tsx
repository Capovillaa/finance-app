import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearOverYearRow } from '../../api/types';
import ChartTooltip from '../../components/ChartTooltip';
import Panel from '../../components/Panel';
import SeriesLegend from '../../components/SeriesLegend';
import { useChartTokens } from '../../lib/chartTokens';
import { appLocale, formatMoneyCompact } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface YearOverYearChartProps {
  rows: YearOverYearRow[];
  year: number;
  currency: string;
  loading?: boolean;
}

/** `"03"` → `Mar`. Any day of the month will do; only the name is rendered. */
export function monthName(month: string): string {
  const index = Number(month) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 11) return month;
  return new Intl.DateTimeFormat(appLocale(), { month: 'short' }).format(new Date(2000, index, 1));
}

/**
 * This year's spending against last year's, month by month.
 *
 * Grouped bars rather than two lines: the question a year-over-year view is
 * asked is "how did this March compare with last March", which is twelve
 * paired comparisons, not one continuous trend. Bars put each pair side by side
 * where the eye can measure the gap; the dashboard already has the line chart
 * for the trend reading.
 *
 * Two series, so the colour job is categorical — slots 1 and 2 in fixed order,
 * validated against both surfaces (see `chartTokens.ts`). Identity does not rest
 * on hue alone: the legend names both years, and the table below carries the
 * same figures for anyone the colours fail.
 *
 * One y-axis, both series in the same currency. Never two scales.
 */
export default function YearOverYearChart({
  rows,
  year,
  currency,
  loading = false,
}: YearOverYearChartProps): ReactElement {
  const { t } = useTranslation();
  const tokens = useChartTokens();

  const currentKey = String(year);
  const previousKey = String(year - 1);
  const currentColor = tokens.series[0] as string;
  const previousColor = tokens.series[1] as string;

  const data = rows.map((row) => ({
    label: monthName(row.month),
    [currentKey]: Number(row.currentExpenses),
    [previousKey]: Number(row.previousExpenses),
  }));

  const hasSpending = rows.some((row) => Number(row.currentExpenses) > 0 || Number(row.previousExpenses) > 0);

  return (
    <Panel
      title={t('reports.yearOverYear')}
      caption={t('reports.monthlyExpensesIn', { currency })}
      action={
        <SeriesLegend
          items={[
            { label: currentKey, color: currentColor },
            { label: previousKey, color: previousColor },
          ]}
        />
      }
    >
      {loading ? (
        <Skeleton variant="rounded" height={300} />
      ) : !hasSpending ? (
        <Box sx={{ height: 300, display: 'grid', placeItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('reports.noSpendingInYears', { current: currentKey, previous: previousKey })}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
              <CartesianGrid stroke={tokens.gridline} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={tokens.axis}
                tick={{ fill: tokens.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: tokens.axis }}
              />
              <YAxis
                stroke={tokens.axis}
                tick={{ fill: tokens.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={(value: number) => formatMoneyCompact(String(value), currency)}
              />
              <Tooltip
                cursor={{ fill: tokens.gridline, fillOpacity: 0.4 }}
                content={<ChartTooltip currency={currency} />}
              />
              {/* Rounded at the data end, square against the baseline. */}
              <Bar dataKey={currentKey} fill={currentColor} barSize={12} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey={previousKey} fill={previousColor} barSize={12} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Panel>
  );
}
