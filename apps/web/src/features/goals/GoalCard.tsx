import { AddCardIcon, CheckCircleIcon, DeleteIcon, EditIcon, MoreVertIcon, PauseIcon, PlayArrowIcon, WarningAmberIcon } from '../../icons';
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
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useState, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Goal, GoalStatus, WorkspaceRole } from '../../api/types';
import { formatDate, formatMoney, formatPercent } from '../../lib/format';
import { canEdit } from '../../lib/permissions';
import { GOAL_TONE } from '../../lib/tone';
import { FONT_MONO } from '../../theme';
import { GOAL_CATEGORY_LABEL_KEYS } from './goalSchemas';
import { GOAL_CATEGORY_ICON } from './goalCategoryIcon';

/** Catalogue keys: this table is evaluated once, at import. */
const STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'goals.status.active',
  achieved: 'goals.status.achieved',
  paused: 'goals.status.paused',
  cancelled: 'goals.status.cancelled',
};

interface GoalCardProps {
  goal: Goal;
  role: WorkspaceRole | undefined;
  onEdit: () => void;
  onContribute: () => void;
  onSetStatus: (status: GoalStatus) => void;
  onDelete: () => void;
}

export default function GoalCard({ goal, role, onEdit, onContribute, onSetStatus, onDelete }: GoalCardProps): ReactElement {
  const { t } = useTranslation();
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const editable = canEdit(role);
  const Icon = GOAL_CATEGORY_ICON[goal.category];
  const color = goal.color || theme.palette.primary.main;
  const isActive = goal.status === 'active';
  const state = GOAL_TONE[goal.status];

  return (
    <Card
      sx={{
        opacity: goal.status === 'cancelled' ? 0.62 : 1,
        // The same spine the ledger uses, in the goal's own colour: a goal is a
        // running total, and this is the app's shorthand for "here is its state".
        borderLeft: '3px solid',
        borderLeftColor: state.tone === 'none' ? 'divider' : color,
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(color, 0.14),
              flexShrink: 0,
            }}
          >
            <Icon sx={{ color, fontSize: 19 }} />
          </Box>

          <Stack spacing={0.25} sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="h3" noWrap>
              {goal.name}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="eyebrow" color="text.secondary">
                {t(GOAL_CATEGORY_LABEL_KEYS[goal.category])}
              </Typography>
              <Chip
                label={t(STATUS_LABEL[goal.status])}
                size="small"
                color={goal.status === 'achieved' ? 'success' : 'default'}
                variant="outlined"
              />
              {goal.offTrack ? <Chip label={t('goals.behindPace')} size="small" color="warning" icon={<WarningAmberIcon />} /> : null}
            </Stack>
          </Stack>

          {editable ? (
            <>
              <IconButton size="small" onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)} aria-label={t('goals.actionsFor', { name: goal.name })}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem
                  onClick={() => {
                    setAnchorEl(null);
                    onContribute();
                  }}
                >
                  <ListItemIcon>
                    <AddCardIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{t('goals.addContribution')}</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setAnchorEl(null);
                    onEdit();
                  }}
                >
                  <ListItemIcon>
                    <EditIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{t('common.edit')}</ListItemText>
                </MenuItem>
                {goal.status !== 'achieved' ? (
                  <MenuItem
                    onClick={() => {
                      setAnchorEl(null);
                      onSetStatus(isActive ? 'paused' : 'active');
                    }}
                  >
                    <ListItemIcon>
                      {isActive ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                    </ListItemIcon>
                    <ListItemText>{isActive ? t('common.pause') : t('common.resume')}</ListItemText>
                  </MenuItem>
                ) : null}
                {goal.status !== 'achieved' && goal.status !== 'cancelled' ? (
                  <MenuItem
                    onClick={() => {
                      setAnchorEl(null);
                      onSetStatus('achieved');
                    }}
                  >
                    <ListItemIcon>
                      <CheckCircleIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{t('goals.markAchieved')}</ListItemText>
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
                  <ListItemText>{t('common.delete')}</ListItemText>
                </MenuItem>
              </Menu>
            </>
          ) : null}
        </Stack>

        <Stack spacing={0.75} sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
            <Typography
              component="p"
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '1.25rem',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatMoney(goal.currentAmount, goal.currency)}
            </Typography>
            <Typography variant="amount" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {t('common.ofValue', { value: formatMoney(goal.targetAmount, goal.currency) })}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, goal.progressPercent))}
            aria-label={`${formatPercent(goal.progressPercent)} of target saved`}
            sx={{
              bgcolor: alpha(color, 0.16),
              '& .MuiLinearProgress-bar': { bgcolor: color },
            }}
          />
          {/* One sentence rather than two columns: the right-hand half is long
              enough to wrap on a narrow card, and a wrapped column reads as a
              layout accident rather than as a second fact. */}
          <Typography variant="caption" color="text.secondary">
            {t('goals.percentSaved', { percent: formatPercent(goal.progressPercent) })}
            {goal.targetDate ? ` · ${t('goals.targetOn', { date: formatDate(goal.targetDate) })}` : ''}
            {goal.targetDate && goal.requiredMonthlyContribution && Number(goal.requiredMonthlyContribution) > 0
              ? ` · ${t('goals.perMonthNeeded', { amount: formatMoney(goal.requiredMonthlyContribution, goal.currency) })}`
              : ''}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
