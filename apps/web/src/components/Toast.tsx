import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { AnimatePresence } from 'framer-motion';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseIcon } from '../icons';
import { MotionBox, toastSurface, useReducedMotion } from '../lib/motion';

export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  message: string;
  severity?: ToastSeverity;
  /** Milliseconds before auto-dismiss. 0 means it stays until closed by hand. */
  duration?: number;
}

interface QueuedToast extends Required<Pick<ToastOptions, 'message' | 'severity' | 'duration'>> {
  id: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * A stack of glass toasts, bottom-left, that arrive with `toastSurface` and
 * auto-dismiss. Nothing in the app calls `useToast()` yet — this is the
 * confirmation-feedback primitive the redesign brief asked for, matched to
 * the same glass language as `theme.ts`'s dialogs and menus, and left ready
 * for a mutation handler to adopt.
 *
 * `variant="outlined"` on the `Alert` rather than MUI's default `standard` is
 * deliberate: `standard` paints its own colour-tinted background, which would
 * fight the translucent gradient underneath it, so the outline supplies the
 * severity colour only in the border, icon and text, and the glass container
 * supplies the surface.
 */
export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);
  const nextId = useRef(0);
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, severity = 'info', duration = 5000 }: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, severity, duration }]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Box
        sx={{
          position: 'fixed',
          insetInlineStart: 24,
          insetBlockEnd: 24,
          zIndex: (theme) => theme.zIndex.snackbar,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          width: 'min(380px, calc(100vw - 48px))',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <MotionBox
              key={toast.id}
              layout
              variants={toastSurface}
              initial={reduceMotion ? false : 'hidden'}
              animate="visible"
              exit="exit"
              sx={{ pointerEvents: 'auto' }}
            >
              <Alert
                variant="outlined"
                severity={toast.severity}
                action={
                  <IconButton size="small" onClick={() => dismiss(toast.id)} aria-label={t('common.close')}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                }
                sx={(muiTheme) => ({
                  backgroundImage: muiTheme.palette.glass.surface,
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  boxShadow: muiTheme.palette.glass.shadow,
                  borderRadius: 3,
                })}
              >
                {toast.message}
              </Alert>
            </MotionBox>
          ))}
        </AnimatePresence>
      </Box>
    </ToastContext.Provider>
  );
}

/** Throws outside `ToastProvider`, the same way other app contexts do. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
