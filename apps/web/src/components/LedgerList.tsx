import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AnimatePresence } from 'framer-motion';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionBox, ledgerList, useReducedMotion } from '../lib/motion';

interface LedgerListProps {
  children: ReactNode;
  /** True while the rows are still being fetched. */
  loading?: boolean;
  /** How many placeholder lines to draw while loading. */
  loadingRows?: number;
  /** True when the fetch succeeded and there is genuinely nothing to show. */
  isEmpty?: boolean;
  /** What to say in that case. */
  emptyMessage?: string;
  /** Names the list for assistive technology, e.g. "Transactions". */
  label?: string;
}

/**
 * The container for a run of `LedgerRow`s.
 *
 * It exists so the three states a statement can be in — loading, empty, and
 * full — are decided in one place rather than re-implemented on every screen,
 * and so the placeholder lines have the same rhythm as the real ones.
 */
export default function LedgerList({
  children,
  loading = false,
  loadingRows = 5,
  isEmpty = false,
  emptyMessage,
  label,
}: LedgerListProps): ReactElement {
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();

  if (loading) {
    return (
      <Stack aria-busy="true" aria-label={label}>
        {Array.from({ length: loadingRows }, (_, index) => (
          <Box
            key={index}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              py: 1.5,
              px: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
              '&:last-of-type': { borderBottom: 0 },
            }}
          >
            <Skeleton variant="text" width={`${40 + ((index * 13) % 30)}%`} height={18} />
            <Skeleton variant="text" width={84} height={18} />
          </Box>
        ))}
      </Stack>
    );
  }

  if (isEmpty) {
    return (
      <Box sx={{ px: 2, py: 5, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {emptyMessage ?? t('common.nothingHere')}
        </Typography>
      </Box>
    );
  }

  // The stagger is what makes a fetched page read as a statement being printed
  // rather than as a block appearing. `AnimatePresence` then lets a row that a
  // filter removed fade instead of vanishing mid-scan.
  return (
    <MotionBox
      role="list"
      aria-label={label}
      variants={ledgerList}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
    >
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </MotionBox>
  );
}
