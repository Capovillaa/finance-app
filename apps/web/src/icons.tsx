import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react';
import {
  Archive,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowsClockwise,
  ArrowsLeftRight,
  Armchair,
  Bank,
  Bell,
  BellRinging,
  Car,
  CaretUpDown,
  ChartLine,
  ChartPieSlice,
  Check,
  CheckCircle,
  Checks,
  CircleHalf,
  ClockCounterClockwise,
  CreditCard,
  Crown,
  Devices,
  Download,
  DotsThreeVertical,
  Flag,
  Gear,
  GraduationCap,
  House,
  List,
  ListChecks,
  Minus,
  Moon,
  Note,
  PaperPlaneTilt,
  Pause,
  PencilSimple,
  PiggyBank,
  Play,
  PlayCircle,
  Plus,
  Receipt,
  Repeat,
  Scales,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  SquaresFour,
  Sun,
  Tag,
  Translate,
  Trash,
  Umbrella,
  UploadSimple,
  UserMinus,
  Wallet,
  Warning,
  X,
  XCircle,
} from '@phosphor-icons/react';

/**
 * Every icon in the app goes through this file. It exists so the ~35 call
 * sites that used to import `@mui/icons-material/*` can keep their exact JSX
 * (`fontSize`, `color`, `sx`) unchanged — only the import's source module
 * moved. See `docs/decisions.md` ("A softer, more distinct icon set") for why
 * Phosphor replaced Material Icons and how the two prop systems were bridged.
 */

type FontSize = 'small' | 'medium' | 'large' | 'inherit';
type SemanticColor =
  | 'inherit'
  | 'primary'
  | 'secondary'
  | 'error'
  | 'warning'
  | 'info'
  | 'success'
  | 'disabled'
  | 'action';

export interface AppIconProps {
  fontSize?: FontSize;
  color?: SemanticColor;
  sx?: SxProps<Theme>;
  className?: string;
}

// MUI `SvgIcon`'s own default sizes (in rem), reproduced here so a bare
// `<AddIcon />` renders at the same physical size it always did.
const REM_BY_FONT_SIZE: Record<Exclude<FontSize, 'inherit'>, string> = {
  small: '1.25rem',
  medium: '1.5rem',
  large: '2.1875rem',
};

// MUI's `sx` `color` already resolves a dot-path token (`'text.disabled'`)
// against the live theme, so mapping the semantic name to a token string here
// is enough — no `useTheme()` needed, and no palette value gets baked in at
// build time the way a literal hex would.
const COLOR_TOKEN: Record<Exclude<SemanticColor, 'inherit'>, string> = {
  primary: 'primary.main',
  secondary: 'secondary.main',
  error: 'error.main',
  warning: 'warning.main',
  info: 'info.main',
  success: 'success.main',
  disabled: 'text.disabled',
  action: 'action.active',
};

/**
 * Wraps a Phosphor glyph behind MUI's `SvgIcon` prop surface (`fontSize`,
 * `color`, `sx`). Rendered through `Box`'s `component` slot rather than the
 * glyph directly, specifically so the full `sx` engine is available at every
 * call site — theme tokens, spacing shorthands (`mr: 0.5`), and one-off CSS
 * (`verticalAlign`) all still work exactly as they did against MUI's own
 * `SvgIcon`, which is what call sites across the app already assume.
 * Phosphor's own fill defaults to `currentColor`, the same convention
 * `SvgIcon` uses, so plain CSS `color` is all this ever needs to set.
 */
function makeIcon(Glyph: PhosphorIcon, weight: IconWeight = 'regular') {
  const WrappedIcon = forwardRef<SVGSVGElement, AppIconProps>(function WrappedIcon(
    { fontSize, color, sx, className },
    ref,
  ) {
    return (
      <Box
        ref={ref}
        component={Glyph}
        weight={weight}
        size="1em"
        className={className}
        sx={[
          { display: 'inline-block', flexShrink: 0 },
          fontSize && fontSize !== 'inherit' ? { fontSize: REM_BY_FONT_SIZE[fontSize] } : {},
          color && color !== 'inherit' ? { color: COLOR_TOKEN[color] } : {},
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      />
    );
  });
  return WrappedIcon;
}

/** Replaces MUI's `SvgIconComponent` as the type for an icon held in plain data (`navItems.ts` and friends). */
export type IconComponent = ReturnType<typeof makeIcon>;

export const AddIcon = makeIcon(Plus);
export const AddCardIcon = makeIcon(PiggyBank);
export const AccountBalanceIcon = makeIcon(Bank);
export const ArchiveIcon = makeIcon(Archive);
export const ArrowDownwardIcon = makeIcon(ArrowDown);
export const ArrowForwardIcon = makeIcon(ArrowRight);
export const ArrowUpwardIcon = makeIcon(ArrowUp);
export const AssessmentIcon = makeIcon(ChartLine);
export const AutoModeIcon = makeIcon(Repeat);
export const AutorenewIcon = makeIcon(ArrowsClockwise);
export const BeachAccessIcon = makeIcon(Umbrella);
export const CheckIcon = makeIcon(Check);
export const CheckCircleIcon = makeIcon(CheckCircle, 'fill');
export const CheckCircleOutlineIcon = makeIcon(CheckCircle);
export const ClearIcon = makeIcon(X);
export const CloseIcon = makeIcon(X);
export const CreditCardIcon = makeIcon(CreditCard);
export const DarkModeIcon = makeIcon(Moon);
export const DashboardIcon = makeIcon(SquaresFour);
export const DeleteIcon = makeIcon(Trash);
export const DevicesIcon = makeIcon(Devices);
export const DirectionsCarIcon = makeIcon(Car);
export const DoneAllIcon = makeIcon(Checks);
export const DownloadIcon = makeIcon(Download);
export const EditIcon = makeIcon(PencilSimple);
export const ElderlyIcon = makeIcon(Armchair);
export const ErrorOutlineIcon = makeIcon(XCircle);
export const FlagIcon = makeIcon(Flag);
export const HomeIcon = makeIcon(House);
export const LabelIcon = makeIcon(Tag);
export const LightModeIcon = makeIcon(Sun);
export const LogoutIcon = makeIcon(SignOut);
export const MenuIcon = makeIcon(List);
export const MoreVertIcon = makeIcon(DotsThreeVertical);
export const NotesIcon = makeIcon(Note);
export const NotificationsIcon = makeIcon(Bell);
export const NotificationsActiveIcon = makeIcon(BellRinging, 'fill');
export const PauseIcon = makeIcon(Pause);
export const PaymentsIcon = makeIcon(Wallet);
export const PersonRemoveIcon = makeIcon(UserMinus);
export const PieChartIcon = makeIcon(ChartPieSlice);
export const PlayArrowIcon = makeIcon(Play);
export const PlayCircleOutlineIcon = makeIcon(PlayCircle);
export const PlaylistAddCheckIcon = makeIcon(ListChecks);
export const ReceiptLongIcon = makeIcon(Receipt);
/** Reconciliation: two figures weighed against each other. */
export const ReconcileIcon = makeIcon(Scales);
export const RefreshIcon = makeIcon(ArrowClockwise);
export const RemoveIcon = makeIcon(Minus);
export const SavingsIcon = makeIcon(PiggyBank);
export const SchoolIcon = makeIcon(GraduationCap);
export const SecurityIcon = makeIcon(ShieldCheck);
export const SendIcon = makeIcon(PaperPlaneTilt);
export const SettingsIcon = makeIcon(Gear);
export const SettingsBrightnessIcon = makeIcon(CircleHalf);
export const ShowChartIcon = makeIcon(ChartLine);
export const SwapHorizIcon = makeIcon(ArrowsLeftRight);
export const TranslateIcon = makeIcon(Translate);
export const TuneIcon = makeIcon(SlidersHorizontal);
export const UnarchiveIcon = makeIcon(ArrowCounterClockwise);
export const UndoIcon = makeIcon(ArrowCounterClockwise);
export const UnfoldMoreIcon = makeIcon(CaretUpDown);
export const UpdateIcon = makeIcon(ClockCounterClockwise);
export const UploadIcon = makeIcon(UploadSimple);
export const WarningAmberIcon = makeIcon(Warning);
export const WorkspacePremiumIcon = makeIcon(Crown);
