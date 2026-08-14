import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { ReactElement } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '../../api/types';
import ChartTooltip from '../../components/ChartTooltip';
import Panel from '../../components/Panel';
import SeriesLegend from '../../components/SeriesLegend';
import { useChartTokens } from '../../lib/chartTokens';
import { appLocale, formatMoneyCompact } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface IncomeExpenseChartProps {
  points: TrendPoint[];
  currency: string;
  loading?: boolean;
}

interface ChartRow {
  label: string;
  Income: number;
  Expenses: number;
}

/** `2026-03` → `Mar`, falling back to the raw period if it is not a month key. */
function monthLabel(period: string, periodStart: string): string {
  const [year, month] = periodStart.split('-').map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(appLocale(), { month: 'short' }).format(new Date(year, month - 1, 1));
}

/**
 * Income against expenses over the last several months.
 *
 * Two distinct series that the reader must tell apart, so the colour job is
 * categorical: slots 1 and 2, in fixed order. Identity never rests on colour
 * alone — the legend names both series and the end of each line is directly
 * labelled, with the labels nudged apart when the lines converge rather than
 * being allowed to overlap.
 */
export default function IncomeExpenseChart({
  points,
  currency,
  loading = false,
}: IncomeExpenseChartProps): ReactElement {
  const { t } = useTranslation();
  const tokens = useChartTokens();
  const theme = useTheme();

  const rows: ChartRow[] = points.map((point) => ({
    label: monthLabel(point.period, point.periodStart),
    Income: Number(point.income),
    Expenses: Number(point.expenses),
  }));

  const incomeColor = tokens.series[0] as string;
  const expenseColor = tokens.series[1] as string;

  const last = rows.at(-1);
  const peak = Math.max(1, ...rows.flatMap((row) => [row.Income, row.Expenses]));
  // When the two lines finish close together their end labels would sit on top
  // of each other. Pushing them apart keeps each attached to its own line,
  // which stacking them would not.
  const converging = last ? Math.abs(last.Income - last.Expenses) / peak < 0.08 : false;

  return (
    <Panel
      title={t('dashboard.incomeAndExpenses')}
      caption={t('dashboard.lastMonthsIn', { count: rows.length, currency })}
      action={
        <SeriesLegend
          items={[
            { label: t('common.income'), color: incomeColor },
            { label: t('common.expenses'), color: expenseColor },
          ]}
        />
      }
      fullHeight
    >
      {loading ? (
        <Skeleton variant="rounded" height={260} />
      ) : rows.length === 0 ? (
        <EmptyPlot message={t('dashboard.noActivity')} />
      ) : (
        <Box sx={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 8, right: 76, bottom: 0, left: 8 }}>
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
                cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
                content={<ChartTooltip currency={currency} />}
              />
              <Line
                type="monotone"
                dataKey="Income"
                stroke={incomeColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: tokens.surface }}
                label={
                  <EndLabel
                    total={rows.length}
                    text={t('common.income')}
                    color={theme.palette.text.secondary}
                    dy={converging ? -10 : -8}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="Expenses"
                stroke={expenseColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: tokens.surface }}
                label={
                  <EndLabel
                    total={rows.length}
                    text={t('common.expenses')}
                    color={theme.palette.text.secondary}
                    dy={converging ? 16 : 14}
                  />
                }
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Panel>
  );
}

interface EndLabelProps {
  /** Injected by Recharts for every point; only the last one is drawn. */
  index?: number;
  x?: number;
  y?: number;
  total: number;
  text: string;
  color: string;
  dy: number;
}

/**
 * Direct label at the end of a line. Labelling only the final point is the
 * point — a value on every point is unreadable and goes ignored.
 */
function EndLabel({ index, x, y, total, text, color, dy }: EndLabelProps): ReactElement | null {
  if (index !== total - 1 || x === undefined || y === undefined) return null;

  return (
    <text x={x + 8} y={y} dy={dy} fill={color} fontSize={12} fontWeight={600} textAnchor="start">
      {text}
    </text>
  );
}

function EmptyPlot({ message }: { message: string }): ReactElement {
  return (
    <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}
