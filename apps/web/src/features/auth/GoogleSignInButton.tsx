import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLoginWithGoogleMutation } from '../../api/endpoints/auth';
import { useAppDispatch } from '../../app/hooks';
import { getApiErrorMessage } from '../../lib/apiError';
import { googleClientId, loadGoogleIdentityServices } from '../../lib/googleSignIn';
import { workspaceSelected } from '../workspace/workspaceSlice';
import { credentialsReceived } from './authSlice';

interface GoogleSignInButtonProps {
  /**
   * Which of Google's own labels to draw. `signin_with` on the sign-in screen,
   * `signup_with` on registration — the flow behind them is the same call, and
   * the API decides whether this address is a new account or an existing one.
   */
  text: 'signin_with' | 'signup_with';
}

/**
 * Google's own button, plus the divider that separates it from the form above.
 *
 * **Renders nothing at all without `VITE_GOOGLE_CLIENT_ID`.** That is what makes
 * the feature optional end to end: the same deployment that leaves the server's
 * `GOOGLE_CLIENT_ID` unset leaves this unset too, and the auth screens are then
 * exactly what they were before this existed — no divider, no empty space, no
 * button that answers 401.
 *
 * The button itself is drawn by Google Identity Services rather than by MUI,
 * and deliberately so: Google's branding guidelines govern what a "Sign in with
 * Google" button may look like, and a hand-built one would be both a licence
 * problem and less recognisable. It is given the surrounding surface's colour
 * scheme and the app's current language so it does not read as a foreign object
 * on the card, and the width of the form so it lines up with the submit button.
 * The language reaches it through the *script URL* rather than through the
 * render options — see `lib/googleSignIn.ts` — which is why a language change
 * re-runs the effect below rather than only re-rendering.
 *
 * On success the response is the same `authResultResponse` `/auth/login`
 * returns, so it is handled the same way — store the session, select the
 * default workspace, navigate — see `LoginPage.tsx`.
 */
export default function GoogleSignInButton({ text }: GoogleSignInButtonProps): ReactElement | null {
  const clientId = googleClientId();
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { mode, systemMode } = useColorScheme();
  const [loginWithGoogle, { error }] = useLoginWithGoogleMutation();
  const [loadError, setLoadError] = useState<string | null>(null);
  const target = useRef<HTMLDivElement | null>(null);

  // `mode` is 'system' until the user picks one, and undefined on the first
  // render before the scheme resolves — the same dance `useChartTokens` does.
  const resolved = mode === 'system' ? systemMode : mode;

  /**
   * Held in a ref rather than passed to `initialize` directly, because GIS
   * keeps whichever callback it was given at initialisation and this component
   * re-initialises only when the *button* has to be redrawn. Without the
   * indirection, a language or colour-scheme change between mount and click
   * would leave Google calling into a stale closure.
   */
  const onCredential = useRef<(credential: string) => void>(() => {});

  const signIn = useCallback(
    async (credential: string) => {
      const result = await loginWithGoogle({ credential })
        .unwrap()
        .catch(() => null);
      if (!result) return;

      dispatch(credentialsReceived({ user: result.user, accessToken: result.accessToken }));
      if (result.defaultWorkspaceId) dispatch(workspaceSelected(result.defaultWorkspaceId));
      navigate('/', { replace: true });
    },
    [dispatch, loginWithGoogle, navigate],
  );

  onCredential.current = (credential: string) => void signIn(credential);

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    const parent = target.current;
    if (!parent) return;

    // The language is the script's, not the button's — see `gisSrc`. Passing
    // it here is what makes the effect re-run and re-render on a change.
    void loadGoogleIdentityServices(i18n.language)
      .then((google) => {
        if (cancelled) return;
        setLoadError(null);

        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) onCredential.current(response.credential);
          },
          // No One Tap and no automatic sign-in: the user presses the button or
          // nothing happens. An app holding someone's whole ledger should not
          // sign them in because a browser remembered a Google session.
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // GIS takes a pixel width and ignores percentages, so it is measured
        // from the container the form already sized. Clamped because Google
        // refuses anything over 400, and a button under ~200 truncates its own
        // label in the longer languages.
        const width = Math.min(400, Math.max(200, Math.round(parent.offsetWidth) || 320));

        // Redrawing appends rather than replaces, so the previous button has to
        // go first or a scheme change stacks two of them.
        parent.replaceChildren();
        google.accounts.id.renderButton(parent, {
          type: 'standard',
          theme: resolved === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          logo_alignment: 'center',
          text,
          width,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(t('auth.google.unavailable'));
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, i18n.language, resolved, t, text]);

  if (!clientId) return null;

  return (
    <Stack spacing={2.5}>
      <Divider>
        <Typography variant="caption" color="text.secondary">
          {t('auth.google.or')}
        </Typography>
      </Divider>

      {error ? <Alert severity="error">{getApiErrorMessage(error, t('auth.google.failed'))}</Alert> : null}
      {loadError ? <Alert severity="warning">{loadError}</Alert> : null}

      {/* Google draws into this element. Centred because the rendered button is
          a fixed pixel width and the form around it is fluid, so at a width the
          clamp above caps it would otherwise sit off to one side. */}
      <div ref={target} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
    </Stack>
  );
}
