import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Ten identity colours, warm-leaning so they sit with the statement palette
 * rather than against it — the green, the old gold and the brick are the app's
 * own brand tones, and the rest fill the wheel around them at a matching
 * saturation. A generic material ramp would have read as a different product's
 * palette dropped into this one.
 *
 * They are *identity* colours, not status colours: nothing here means anything,
 * it only tells one account apart from another. That is why `lib/chartTokens.ts`
 * is not reused — every hue in that file is semantic, and borrowing the income
 * green to mean "this is my Nubank card" would undo the rule the file exists for.
 *
 * Each swatch is drawn with a hairline border, which is what carries the
 * boundary against both surfaces; the fill itself is then free to be chosen for
 * how it looks rather than to clear 3:1 on white and on `#1B1F26` at once.
 */
const SWATCHES = [
  '#5A6B7C', // slate
  '#0F8A7E', // teal
  '#2E8B57', // green
  '#6E8B2E', // olive
  '#C68A2E', // old gold
  '#D07C33', // amber
  '#B23A2E', // brick
  '#C0517A', // rose
  '#7B5EA7', // violet
  '#3F6BB5', // indigo
] as const;

/**
 * Compares two colours as colours rather than as strings.
 *
 * `#B23A2E` and `#b23a2e` are the same colour and different strings, and the
 * two spellings genuinely both occur: the swatches above are written in upper
 * case for legibility, while `<input type="color">` and most stored values come
 * back lower case. Comparing them raw silently left every swatch unselected and
 * classified each one as a custom colour.
 */
const sameColour = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * The real control, hidden behind the swatch that represents it.
 *
 * A 1px box rather than `width: 0` or `display: none`: a zero-sized or undisplayed
 * form control is skipped by some browsers' focus order and by some assistive
 * technology, which would silently cost this control its keyboard support. The
 * swatch beside it is what carries the focus ring.
 */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  margin: 0,
  pointerEvents: 'none',
} as const;

interface ColorSwatchPickerProps {
  /** `''` for no colour, otherwise `#RRGGBB`. */
  value: string;
  onChange: (value: string) => void;
  label: string;
  error?: boolean;
  helperText?: ReactNode;
}

/**
 * Choosing a colour, without the native picker eating the frame budget.
 *
 * The `<input type="color">` this replaces was bound straight to react-hook-form
 * with both `value` and `register()`. Dragging inside the operating system's
 * colour wheel emits a continuous stream of `input` events, each one wrote to
 * the form, and each write re-rendered the entire surrounding dialog — fifteen
 * fields, a grid and two selects — so the picker visibly seized up under a fast
 * drag. That was the bug; the swatches are the fix *and* the nicer control.
 *
 * A custom colour is still reachable, and the native picker is still what opens,
 * but its churn is now absorbed by local state here and handed to the form once
 * the user is done. Nothing above this component re-renders while dragging.
 *
 * Built on real `<input type="radio">` elements, visually hidden under the
 * swatches: this is a single-choice control, and the native ones bring arrow-key
 * navigation, the roving tab stop and the announced group membership that a row
 * of `<button>`s would each have to be given by hand.
 */
export default function ColorSwatchPicker({
  value,
  onChange,
  label,
  error = false,
  helperText,
}: ColorSwatchPickerProps): ReactElement {
  const { t } = useTranslation();
  const groupName = useId();

  const isCustom = value !== '' && !SWATCHES.some((swatch) => sameColour(swatch, value));
  const [draft, setDraft] = useState(value || '#5A6B7C');

  // Keeps the native picker's starting colour in step when the form is reset or
  // seeded for editing, without making it a controlled input — which is exactly
  // what would reintroduce the stall above.
  useEffect(() => {
    if (value) setDraft(value);
  }, [value]);

  const swatchSx = (selected: boolean, background: string): SxProps<Theme> => ({
    display: 'block',
    width: 26,
    height: 26,
    borderRadius: '50%',
    background,
    cursor: 'pointer',
    border: '1px solid',
    borderColor: 'divider',
    transition: 'transform 160ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 160ms',
    transform: selected ? 'scale(1.12)' : 'none',
    boxShadow: selected ? (theme) => `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}` : 'none',
    '&:hover': { transform: 'scale(1.12)' },
    // The ring belongs on the swatch, not on the hidden input that has the focus.
    'input:focus-visible + &': {
      outline: '2px solid',
      outlineColor: 'primary.main',
      outlineOffset: 3,
    },
  });

  return (
    <Box>
      <Typography
        variant="eyebrow"
        component="div"
        sx={{ color: error ? 'error.main' : 'text.secondary', mb: 1 }}
      >
        {label}
      </Typography>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.25,
          alignItems: 'center',
        }}
      >
        {/* "No colour" — the account falls back to its type icon in the ledger. */}
        <Box component="label" sx={{ display: 'inline-flex', position: 'relative' }}>
          <Box
            component="input"
            type="radio"
            name={groupName}
            checked={value === ''}
            onChange={() => onChange('')}
            aria-label={t('common.none')}
            sx={VISUALLY_HIDDEN}
          />
          <Box
            aria-hidden
            sx={{
              ...swatchSx(value === '', 'transparent'),
              // A diagonal stroke reads as "none" without needing a word, and
              // keeps the option the same size and shape as every other swatch.
              backgroundImage: (theme) =>
                `linear-gradient(to top left, transparent calc(50% - 1px), ${theme.palette.text.disabled} calc(50% - 1px), ${theme.palette.text.disabled} calc(50% + 1px), transparent calc(50% + 1px))`,
            }}
          />
        </Box>

        {SWATCHES.map((swatch) => (
          <Box key={swatch} component="label" sx={{ display: 'inline-flex', position: 'relative' }}>
            <Box
              component="input"
              type="radio"
              name={groupName}
              checked={sameColour(value, swatch)}
              onChange={() => onChange(swatch)}
              aria-label={swatch}
              sx={VISUALLY_HIDDEN}
            />
            <Box aria-hidden sx={swatchSx(sameColour(value, swatch), swatch)} />
          </Box>
        ))}

        {/*
          The custom option. `onChange` here is React's, which maps to the
          native `input` event and therefore fires throughout a drag — it only
          ever touches this component's own state. The form is told on `blur`,
          by which point the operating system's picker has closed.
        */}
        <Box component="label" sx={{ display: 'inline-flex', position: 'relative', ml: 0.5 }}>
          <Box
            component="input"
            type="color"
            value={draft}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
            onBlur={() => onChange(draft)}
            aria-label={t('common.customColour')}
            sx={VISUALLY_HIDDEN}
          />
          <Box
            aria-hidden
            sx={{
              ...swatchSx(isCustom, isCustom ? value : draft),
              // A conic sweep says "anything you like" — the one swatch that is
              // a control rather than a colour.
              backgroundImage: isCustom
                ? 'none'
                : 'conic-gradient(#B23A2E, #C68A2E, #2E8B57, #0F8A7E, #3F6BB5, #7B5EA7, #B23A2E)',
            }}
          />
        </Box>
      </Box>

      {helperText ? (
        <Typography
          variant="caption"
          component="p"
          sx={{ mt: 1, color: error ? 'error.main' : 'text.secondary' }}
        >
          {helperText}
        </Typography>
      ) : null}
    </Box>
  );
}
