import { createTheme } from '@mui/material/styles';
import Grow from '@mui/material/Grow';
import type { CSSProperties } from 'react';

/**
 * The visual language: a well-set financial statement.
 *
 * The product manipulates money, so money is the content and everything else is
 * chrome. Three decisions follow from that and this file exists to hold them:
 *
 *  - **Typography carries the hierarchy, not elevation.** Cards are flat with a
 *    hairline; shadow is reserved for things that genuinely float (dialogs,
 *    menus, tooltips) and for the dashboard's stat tiles. Anything that is a
 *    *list of money* is drawn as statement lines separated by a hairline rule.
 *  - **Three families, three jobs.** Fraunces (serif, variable `opsz`) for the
 *    hero balance and page titles; Instrument Sans for all UI; IBM Plex Mono
 *    with `tabular-nums` for every figure in a list or table, so digits line up
 *    in columns the way a printed statement does.
 *  - **Colour means something or it is absent.** Green is income, brick is
 *    expense, old gold is a caution state. Nothing is tinted for decoration.
 *
 * Every colour below was checked against the surface it actually renders on:
 * text and coloured figures clear WCAG AA (4.5:1) in both schemes, graphical
 * marks (meter fills, status spines, chart marks) clear 3:1. Two of the spec's
 * nominal brand hues could not clear AA as *text* on a light surface —
 * `verde-claro #1E9E63` (3.43:1 on white) and `ouro-velho #C68A2E` (2.97:1) —
 * so light mode uses a darker step of the same hue for text and the nominal
 * value survives as the dark-mode step. See `docs/decisions.md`.
 */
declare module '@mui/material/styles' {
  interface Palette {
    /** Signed figures. Never the only cue — a sign or a word always agrees. */
    money: { positive: string; negative: string; neutral: string };
    /**
     * Graphical marks that state a condition: the spine down the left of a
     * statement line, a meter fill, a chart accent. Separate from `money`
     * because these are shapes rather than text and are tuned to 3:1, and
     * separate from the semantic palette because a row's state is not an alert.
     */
    tone: {
      accent: string;
      positive: string;
      caution: string;
      negative: string;
      neutral: string;
      /** Low-alpha accent for selected rows and meter tracks. */
      accentSoft: string;
    };
    /**
     * The glass treatment for surfaces that genuinely float above the page —
     * dialogs, menus, popovers, the notification drawer. Never used on a card
     * or a ledger row: those stay flat with a hairline, per the file doc
     * comment above. `surface` is a `background-image` gradient (translucent,
     * so it wants `backdropFilter` blur behind it to read as glass rather than
     * as a faint smear), `border` is a brighter-than-divider rim standing in
     * for the "leve brilho" a real edge-lit pane would catch, `shadow` is a
     * layered ambient + rim-light box-shadow, and `backdropDim` is what sits
     * behind the pane, over the rest of the page.
     */
    glass: { surface: string; border: string; shadow: string; backdropDim: string };
  }
  interface PaletteOptions {
    money?: { positive: string; negative: string; neutral: string };
    tone?: {
      accent: string;
      positive: string;
      caution: string;
      negative: string;
      neutral: string;
      accentSoft: string;
    };
    glass?: { surface: string; border: string; shadow: string; backdropDim: string };
  }

  interface TypographyVariants {
    /** The one dramatic step in the scale: a hero balance. */
    display: CSSProperties;
    /** A figure inside a list or table. Mono, tabular, right-aligned by caller. */
    amount: CSSProperties;
    /** Small capitalised label above a group or column. */
    eyebrow: CSSProperties;
  }
  interface TypographyVariantsOptions {
    display?: CSSProperties;
    amount?: CSSProperties;
    eyebrow?: CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    display: true;
    amount: true;
    eyebrow: true;
  }
}

export const FONT_DISPLAY = "'Fraunces Variable', 'Iowan Old Style', Georgia, 'Times New Roman', serif";
export const FONT_UI =
  "'Instrument Sans Variable', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Cascadia Mono', Consolas, monospace";

/**
 * Reads a palette token as a CSS variable.
 *
 * `styleOverrides` callbacks receive the *default* colour scheme's literal
 * values, so writing `theme.palette.divider` there bakes the light hairline
 * into dark mode as well. Going through the variable is what makes an override
 * follow the scheme.
 */
const v = (token: string): string => `var(--mui-palette-${token})`;

/** Fraunces is a variable serif; at display sizes it wants a high optical size. */
const DISPLAY_AXES = "'opsz' 96, 'SOFT' 0, 'WONK' 0";
const TITLE_AXES = "'opsz' 36, 'SOFT' 0, 'WONK' 0";

/**
 * A flat interface needs only a few shadows, and they should read as depth
 * rather than as a grey smear: two layers, tight and wide, both low alpha.
 */
const shadow = (y: number, blur: number, alpha: number): string =>
  `0 ${y}px ${blur}px rgba(15, 20, 28, ${alpha}), 0 1px 2px rgba(15, 20, 28, ${alpha / 2})`;

const SHADOWS = [
  'none',
  shadow(1, 2, 0.05),
  shadow(2, 4, 0.06),
  shadow(3, 6, 0.07),
  shadow(4, 10, 0.08),
  shadow(6, 14, 0.09),
  ...Array.from({ length: 19 }, (_, i) => shadow(8 + i, 20 + i * 2, 0.1)),
] as unknown as import('@mui/material/styles').Shadows;

/**
 * The soft, tactile treatment for controls a hand actually operates — buttons,
 * fields, chips, toggles. This is deliberately a *different* register from the
 * flat, hairline-driven statement language the cards and ledger rows use: a
 * control invites a touch, so it gets a pill or a generous radius, a soft glow
 * rather than a hard outline, and a brief, subtle press. A card is read, not
 * pressed, so it keeps its hairline untouched by any of this.
 */
const CONTROL_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const controlTransition = (props: string): string =>
  props
    .split(',')
    .map((p) => `${p.trim()} 160ms ${CONTROL_EASE}`)
    .join(', ');
/**
 * A soft focus halo instead of a hard ring — the same accent, just diffused.
 * Goes through `color-mix()` rather than a literal rgba so it follows whichever
 * colour scheme is active (see the `v()` doc comment above for why a literal
 * hex here would silently freeze the light-mode colour into dark mode too).
 */
const focusGlow = (percent: number): string =>
  `0 0 0 4px color-mix(in srgb, ${v('primary-main')} ${percent}%, transparent)`;

/**
 * The one entrance curve for anything that floats — a dialog, a menu, a
 * toast. A pronounced decelerate ("expo out") rather than the gentler
 * `CONTROL_EASE` above: those are for a button or field settling after a
 * touch, this is for a whole pane arriving on screen, and the two want
 * visibly different weight. Kept as both a CSS string (for MUI's
 * `transitions.easing`) and, in `lib/motion.ts`, the same four numbers as a
 * Framer `ease` array — one curve, two syntaxes.
 */
const GLASS_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * `backdropFilter` amounts for the two sizes of floating surface. A dialog is
 * large and sits over real content, so it wants a stronger blur to keep the
 * page behind it from competing; a menu or popover is small and closer to its
 * anchor, so a lighter blur reads as glass without smearing whatever text is
 * nearby into illegibility.
 */
const GLASS_BLUR = 'blur(24px) saturate(180%)';
const GLASS_BLUR_SOFT = 'blur(14px) saturate(160%)';

export const theme = createTheme({
  // Emits CSS variables, which is what lets the light and dark schemes below
  // switch without a re-render and without a flash on first paint.
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#0F6E4E', light: '#1C9760', dark: '#0A5239', contrastText: '#FFFFFF' },
        secondary: { main: '#8A5A16', light: '#C68A2E', dark: '#6B4610', contrastText: '#FFFFFF' },
        success: { main: '#157A4E', contrastText: '#FFFFFF' },
        warning: { main: '#8A5A16', contrastText: '#FFFFFF' },
        error: { main: '#B23A2E', contrastText: '#FFFFFF' },
        info: { main: '#2F6FA8', contrastText: '#FFFFFF' },
        // `default` is the paper stock the whole app is printed on; `paper` is
        // the sheet laid on top of it, which is why the card is the lighter one.
        background: { default: '#F7F8F4', paper: '#FFFFFF' },
        text: { primary: '#1A1C20', secondary: '#565C64', disabled: '#6E757D' },
        divider: 'rgba(26, 28, 32, 0.12)',
        money: { positive: '#157A4E', negative: '#B23A2E', neutral: '#565C64' },
        tone: {
          accent: '#0F6E4E',
          positive: '#157A4E',
          caution: '#8A5A16',
          negative: '#B23A2E',
          neutral: '#6E757D',
          accentSoft: 'rgba(15, 110, 78, 0.10)',
        },
        glass: {
          surface: 'linear-gradient(165deg, rgba(255, 255, 255, 0.86) 0%, rgba(247, 248, 244, 0.66) 100%)',
          border: 'rgba(255, 255, 255, 0.65)',
          shadow:
            '0 24px 60px -16px rgba(15, 20, 28, 0.22), 0 10px 28px -10px rgba(15, 20, 28, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.55)',
          backdropDim: 'rgba(20, 23, 28, 0.32)',
        },
      },
    },
    dark: {
      palette: {
        primary: { main: '#39B981', light: '#5FCD97', dark: '#0F6E4E', contrastText: '#0B1F17' },
        secondary: { main: '#DBA850', light: '#E7C182', dark: '#C68A2E', contrastText: '#14171C' },
        success: { main: '#4FC28C', contrastText: '#0B1F17' },
        warning: { main: '#DBA850', contrastText: '#14171C' },
        error: { main: '#EC8377', contrastText: '#14171C' },
        info: { main: '#7FB4E8', contrastText: '#14171C' },
        background: { default: '#14171C', paper: '#1B1F26' },
        text: { primary: '#ECEAE3', secondary: '#A5ABB4', disabled: '#767D86' },
        divider: 'rgba(236, 234, 227, 0.14)',
        money: { positive: '#4FC28C', negative: '#EC8377', neutral: '#A5ABB4' },
        tone: {
          accent: '#39B981',
          positive: '#4FC28C',
          caution: '#C68A2E',
          negative: '#E2705C',
          neutral: '#767D86',
          accentSoft: 'rgba(57, 185, 129, 0.14)',
        },
        glass: {
          surface: 'linear-gradient(165deg, rgba(41, 47, 56, 0.82) 0%, rgba(20, 23, 28, 0.66) 100%)',
          border: 'rgba(255, 255, 255, 0.10)',
          shadow:
            '0 24px 60px -16px rgba(0, 0, 0, 0.55), 0 10px 28px -10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          backdropDim: 'rgba(6, 8, 10, 0.55)',
        },
      },
    },
  },

  shape: { borderRadius: 8 },
  shadows: SHADOWS,

  // MUI's Dialog/Menu/Popover/Tooltip all animate through `easeInOut` and
  // these two durations by default — overriding them here is what gives every
  // floating surface in the app the same `GLASS_EASE` arrival without a
  // per-component `transitionDuration` prop anywhere.
  transitions: {
    easing: { easeInOut: GLASS_EASE },
    duration: { enteringScreen: 260, leavingScreen: 180 },
  },

  typography: {
    fontFamily: FONT_UI,
    // Instrument Sans is a variable font from 400 to 700; 650 is a real weight
    // here rather than a synthesised bold.
    fontWeightMedium: 550,
    fontWeightBold: 650,

    display: {
      fontFamily: FONT_DISPLAY,
      fontVariationSettings: DISPLAY_AXES,
      fontWeight: 600,
      // Big on a desktop, still readable on a phone, no breakpoint needed.
      fontSize: 'clamp(2.25rem, 6vw, 3.25rem)',
      lineHeight: 1.04,
      letterSpacing: '-0.022em',
      fontVariantNumeric: 'tabular-nums lining-nums',
    },
    amount: {
      fontFamily: FONT_MONO,
      fontWeight: 500,
      fontSize: '0.8125rem',
      lineHeight: 1.5,
      letterSpacing: '-0.012em',
      fontVariantNumeric: 'tabular-nums',
      fontFeatureSettings: "'zero' 1",
    },
    eyebrow: {
      fontFamily: FONT_UI,
      fontWeight: 600,
      fontSize: '0.6875rem',
      lineHeight: 1.4,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
    },

    h1: {
      fontFamily: FONT_DISPLAY,
      fontVariationSettings: TITLE_AXES,
      fontWeight: 600,
      fontSize: 'clamp(1.5rem, 3vw, 1.9375rem)',
      lineHeight: 1.16,
      letterSpacing: '-0.018em',
    },
    h2: {
      fontFamily: FONT_DISPLAY,
      fontVariationSettings: TITLE_AXES,
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.22,
      letterSpacing: '-0.014em',
    },
    h3: { fontWeight: 600, fontSize: '1.0625rem', lineHeight: 1.35, letterSpacing: '-0.006em' },
    h4: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.4 },
    h5: { fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.4 },
    h6: { fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.4 },
    subtitle1: { fontWeight: 550, fontSize: '0.9375rem', lineHeight: 1.5 },
    subtitle2: { fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.5 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.55 },
    caption: { fontSize: '0.75rem', lineHeight: 1.45 },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', letterSpacing: '0.005em' },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        html: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textSizeAdjust: '100%',
        },
        body: { backgroundColor: v('background-default') },
        // The quality bar is "visible keyboard focus on every interactive
        // control, no exceptions", and the only way to guarantee that is to
        // state it once globally rather than per component.
        //
        // `!important` is deliberate and is the reason this works: MUI's own
        // `ButtonBase` and `InputBase` styles set `outline: 0`, and an emotion
        // class beats a bare `:focus-visible` on specificity *and* comes later
        // in the sheet. Without it the ring silently does not render on the
        // majority of the app's controls — which is exactly how this was found.
        ':focus-visible': {
          outline: `2px solid ${v('primary-main')} !important`,
          outlineOffset: '2px !important',
        },
        // ...with one exception, and it is the reason the rule above is scoped
        // at all. An `outline` follows the *element's own* `border-radius`, and
        // the native `<input>` inside a field has none — the 14px radius belongs
        // to the notched fieldset around it. So the global ring rendered as a
        // hard square sitting outside a rounded field, on every text box in the
        // app. Browsers also match `:focus-visible` on a text input for a plain
        // mouse click, so it appeared on click and not only on tab.
        //
        // Suppressing it here costs nothing, because a field is the one control
        // that already states its own focus: `MuiOutlinedInput` below turns the
        // notch accent-coloured and lays a soft halo around the whole shape,
        // both of which follow the radius. Every other control keeps the ring.
        '.MuiOutlinedInput-input:focus-visible': { outline: 'none !important' },
        '::selection': { backgroundColor: v('tone-accentSoft') },
        // Motion in this app only ever says "this updated". Anyone who has asked
        // the OS for less of it loses nothing by having none of it.
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: v('divider') },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${v('divider')}`,
          borderRadius: 12,
          backgroundImage: 'none',
        },
      },
    },

    MuiCardContent: {
      styleOverrides: {
        root: { padding: 20, '&:last-child': { paddingBottom: 20 } },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // A pill rather than a rounded rectangle: the radius always equals half
        // the height, so a button never looks like it stopped rounding partway.
        root: {
          borderRadius: 999,
          paddingInline: 18,
          minHeight: 38,
          transition: controlTransition('background-color, box-shadow, transform'),
          '&:active': { transform: 'scale(0.97)' },
        },
        sizeSmall: { minHeight: 32, paddingInline: 13 },
        contained: { boxShadow: shadow(1, 3, 0.12), '&:hover': { boxShadow: shadow(2, 6, 0.14) } },
        outlined: { borderColor: v('divider'), '&:hover': { borderColor: v('primary-main') } },
        // A text button next to a filled one should still look like a button,
        // so it gets the hover surface rather than only a colour change.
        text: { paddingInline: 14 },
      },
    },

    // Left at its native circle — the pill treatment above is for a button with
    // a label; a lone glyph reads better in the shape it has always had, just
    // with the same soft hover and press the rest of the controls now share.
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: controlTransition('background-color, transform'),
          '&:active': { transform: 'scale(0.92)' },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 600, letterSpacing: '0.01em' },
        sizeSmall: { height: 22, fontSize: '0.6875rem' },
        outlined: { borderColor: v('divider') },
      },
    },

    MuiDivider: { styleOverrides: { root: { borderColor: v('divider') } } },

    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: v('divider') },
        // A column heading is a label, not content: small, spaced, quiet.
        head: {
          fontFamily: FONT_UI,
          fontWeight: 600,
          fontSize: '0.6875rem',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: v('text-secondary'),
          backgroundColor: v('background-default'),
          whiteSpace: 'nowrap',
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: { '&:last-of-type td': { borderBottom: 0 } },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: v('background-default'),
          borderBottom: `1px solid ${v('divider')}`,
          backgroundImage: 'none',
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: v('background-default'),
          backgroundImage: 'none',
          borderColor: v('divider'),
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.Mui-selected': {
            backgroundColor: v('tone-accentSoft'),
            '&:hover': { backgroundColor: v('tone-accentSoft') },
          },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: v('background-paper'),
          transition: controlTransition('box-shadow, border-color'),
          '& .MuiOutlinedInput-notchedOutline': { borderColor: v('divider') },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: v('text-disabled') },
          // A soft halo around the whole field reads as "this is now active" the
          // way a hard 2px border reads as "this is now boxed in" — the same
          // information, without the field visibly jumping in size at line-up.
          //
          // This pair is now the *only* focus indicator a field has, since the
          // global ring is suppressed on the inner input above, so both are a
          // step stronger than they were when they merely accompanied it. The
          // notch is an absolutely-positioned fieldset, so widening its border
          // moves nothing on the page.
          '&.Mui-focused': { boxShadow: focusGlow(18) },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 2,
            borderColor: v('primary-main'),
          },
        },
        input: { fontSize: '0.9375rem' },
      },
    },

    MuiInputLabel: { styleOverrides: { root: { fontSize: '0.9375rem' } } },

    // The page behind a dialog blurs along with it, so the pane in front reads
    // as glass rather than as a flat card that happens to sit on a dark
    // scrim. This is themed globally rather than per-`Modal` because every
    // `Dialog` and `Drawer` in the app shares the same `Backdrop`.
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: v('glass-backdropDim'),
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        },
      },
    },

    MuiDialog: {
      defaultProps: {
        TransitionComponent: Grow,
      },
      styleOverrides: {
        // Dialogs float, so unlike a card they keep a real shadow — that is
        // the whole distinction elevation is left to carry in this design.
        // Unlike a card's flat hairline, this pane is genuinely translucent:
        // a gradient surface over a blurred view of whatever is behind it, a
        // brighter-than-divider rim standing in for a caught edge of light,
        // and a layered shadow that reads as depth rather than a grey smear.
        paper: {
          borderRadius: 14,
          border: `1px solid ${v('glass-border')}`,
          backgroundImage: v('glass-surface'),
          backdropFilter: GLASS_BLUR,
          WebkitBackdropFilter: GLASS_BLUR,
          boxShadow: v('glass-shadow'),
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontFamily: FONT_DISPLAY, fontVariationSettings: TITLE_AXES, fontSize: '1.25rem', fontWeight: 600 },
      },
    },

    // Menu and Popover share one glass paper — a lighter blur than a dialog's,
    // since both sit close to their anchor and over text that must stay
    // legible through them.
    MuiMenu: {
      styleOverrides: {
        paper: {
          border: `1px solid ${v('glass-border')}`,
          borderRadius: 14,
          backgroundImage: v('glass-surface'),
          backdropFilter: GLASS_BLUR_SOFT,
          WebkitBackdropFilter: GLASS_BLUR_SOFT,
          boxShadow: v('glass-shadow'),
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          marginInline: 6,
          marginBlock: 1,
          transition: controlTransition('background-color'),
        },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: {
          border: `1px solid ${v('glass-border')}`,
          borderRadius: 14,
          backgroundImage: v('glass-surface'),
          backdropFilter: GLASS_BLUR_SOFT,
          WebkitBackdropFilter: GLASS_BLUR_SOFT,
          boxShadow: v('glass-shadow'),
        },
      },
    },

    // A tooltip stays a solid, inverted bubble rather than glass — it is
    // small and often sits over a coloured figure or a status spine, and
    // legibility there matters more than consistency with the larger
    // surfaces. It still gets the layered shadow the other floating panes
    // do, so it doesn't read as flatter than the control it's labelling.
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: v('text-primary'),
          color: v('background-paper'),
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: 6,
          paddingInline: 8,
          boxShadow: shadow(3, 10, 0.16),
        },
        arrow: { color: v('text-primary') },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 8, borderRadius: 999, backgroundColor: v('tone-accentSoft') },
        bar: { borderRadius: 999 },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderColor: v('divider'),
          transition: controlTransition('background-color, color'),
          // MUI's default selected state is a grey wash, which reads as
          // "disabled" more than as "chosen". The accent tint is the same one
          // the selected nav item uses.
          '&.Mui-selected': {
            color: v('primary-main'),
            backgroundColor: v('tone-accentSoft'),
            '&:hover': { backgroundColor: v('tone-accentSoft') },
          },
        },
      },
    },

    // A grouped segmented control reads as one soft pill rather than a row of
    // separately-cornered buttons — the un-grouped `MuiToggleButton` above
    // keeps the plainer radius, since `ToggleButtonGroup` is what actually
    // owns rounding the two ends and squaring off the joins in between.
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { borderRadius: 999 },
        grouped: {
          borderRadius: 999,
          '&.MuiToggleButtonGroup-firstButton, &.MuiToggleButtonGroup-lastButton': { borderRadius: 999 },
        },
      },
    },

    MuiTabs: { styleOverrides: { indicator: { height: 2 } } },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem', minHeight: 44 },
      },
    },

    MuiAlert: { styleOverrides: { root: { borderRadius: 10 } } },

    MuiSkeleton: { defaultProps: { animation: 'wave' } },

    MuiLink: { defaultProps: { underline: 'hover' } },

    MuiTypography: {
      defaultProps: {
        variantMapping: { display: 'p', amount: 'span', eyebrow: 'span' },
      },
    },
  },
});
