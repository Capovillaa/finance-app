import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RenderableText } from 'recharts';
import type { CategoryBreakdownItem } from '../../api/types';
import ChartTooltip from '../../components/ChartTooltip';
import Panel from '../../components/Panel';
import { useChartTokens } from '../../lib/chartTokens';
import { formatMoney, formatMoneyCompact } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface CategoryBreakdownChartProps {
  categories: CategoryBreakdownItem[];
  currency: string;
  loading?: boolean;
}

const MAX_LABEL_CHARS = 18;

function truncate(label: string): string {
  return label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…` : label;
}

/**
 * Where this month's money went, by top-level category.
 *
 * The job is comparing magnitudes, so the form is a ranked horizontal bar and
 * the colour job is magnitude — one hue, flat. A per-category colour would be
 * categorical encoding of something that is not identity, and would tempt the
 * reader to read meaning into hue that is not there. Horizontal because
 * category names are long and would otherwise be rotated.
 *
 * One series, so there is no legend: the heading already says what is plotted.
 */
export default function CategoryBreakdownChart({
  categories,
  currency,
  loading = false,
}: CategoryBreakdownChartProps): ReactElement {
  const { t } = useTranslation();
  const tokens = useChartTokens();
  const theme = useTheme();

  // Ascending, because a horizontal bar chart draws the first row at the
  // bottom — this puts the largest category at the top where the eye lands.
  const rows = [...categories]
    .sort((a, b) => Number(a.total) - Number(b.total))
    .map((item) => ({
      label: truncate(item.categoryName),
      fullLabel: item.categoryName,
      Spent: Math.abs(Number(item.total)),
      percentOfTotal: item.percentOfTotal,
    }));

  const height = Math.max(220, rows.length * 38 + 40);

  return (
    <Panel
      title={t('dashboard.topCategories')}
      caption={t('dashboard.thisMonthIn', { currency })}
      fullHeight
    >
      <Stack spacing={2}>
        {loading ? (
          <Skeleton variant="rounded" height={260} />
        ) : rows.length === 0 ? (
          <Box sx={{ height: 220, display: 'grid', placeItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {t('dashboard.noSpending')}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height }}>
            <ResponsiveContainer>
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 72, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={tokens.gridline} strokeWidth={1} horizontal={false} />
                <XAxis
                  type="number"
                  stroke={tokens.axis}
                  tick={{ fill: tokens.tick, fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: tokens.axis }}
                  tickFormatter={(value: number) => formatMoneyCompact(String(value), currency)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke={tokens.axis}
                  tick={{ fill: tokens.tick, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={132}
                />
                <Tooltip
                  cursor={{ fill: tokens.gridline, fillOpacity: 0.4 }}
                  content={<ChartTooltip currency={currency} />}
                />
                <Bar
                  dataKey="Spent"
                  fill={tokens.magnitude}
                  // Capped rather than filling the band, so the leftover is air.
                  barSize={20}
                  // Rounded at the data end, square against the baseline.
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                >
                  {/* Outside the bar end, so a long value is never clipped by its own mark. */}
                  <LabelList
                    dataKey="Spent"
                    position="right"
                    offset={8}
                    fill={theme.palette.text.secondary}
                    fontSize={12}
                    formatter={(value: RenderableText) => formatMoneyCompact(String(value ?? 0), currency)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}

        {rows.length > 0 ? (
          <Typography variant="caption" color="text.secondary">
            {t('dashboard.largestCategory', {
              name: rows.at(-1)?.fullLabel ?? '',
              amount: formatMoney(String(rows.at(-1)?.Spent ?? 0), currency),
              percent: (rows.at(-1)?.percentOfTotal ?? 0).toFixed(1),
            })}
          </Typography>
        ) : null}
      </Stack>
    </Panel>
  );
}
