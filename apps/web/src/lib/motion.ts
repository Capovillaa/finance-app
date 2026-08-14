import Box from '@mui/material/Box';
import { motion, useReducedMotion, type Transition, type Variants } from 'framer-motion';

/**
 * Motion in this app is only ever allowed to say "this updated".
 *
 * There is no bounce, no parallax, no confetti and no hover flourish: it is
 * money, and movement that draws attention to itself is movement that competes
 * with the figures. Everything here is short, eased out, and small in
 * amplitude — enough to show that a list arrived or that a value settled, and
 * nothing more.
 *
 * The theme also disables animation wholesale under `prefers-reduced-motion`;
 * these variants exist so the components can additionally skip the work rather
 * than run an animation the browser then flattens to zero duration.
 */

/** A MUI `Box` that accepts Framer Motion's props, so `sx` and motion coexist. */
export const MotionBox = motion.create(Box);

/** Short, decelerating, no overshoot. */
export const EASE_OUT: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };

/** Applied to a list container; the rows carry `ledgerRow`. */
export const ledgerList: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

/**
 * A statement line arriving. The rise is 4px — a line of a ledger settling into
 * place, not an element flying in.
 */
export const ledgerRow: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: EASE_OUT },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** True when the viewer has asked their OS for less movement. */
export { useReducedMotion };
