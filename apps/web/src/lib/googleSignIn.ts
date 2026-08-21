/**
 * Google Identity Services, the browser half of "Sign in with Google".
 *
 * GIS is a small script from `accounts.google.com` that draws Google's own
 * button, runs the account chooser, and hands back a signed **ID token** — a
 * JWT the API verifies against the same client ID. There is no redirect, no
 * authorization code and no client secret anywhere in this app; see
 * `docs/decisions.md`, "Sign in with Google verifies an ID token in place".
 *
 * The script is loaded on demand rather than from `index.html`, and only when
 * a client ID exists. A deployment that does not want Google login sets no
 * `VITE_GOOGLE_CLIENT_ID`, `googleClientId()` returns undefined, the button
 * never renders and this file never fetches anything — which is the whole
 * reason the feature is optional on the client as well as on the server.
 *
 * Note that the CSP in `apps/web/nginx.conf.template` has to allow the script,
 * its frame and its stylesheet; the header there names the exact
 * `accounts.google.com` paths and nothing wider — the `hl` query string below
 * does not affect that, since a CSP source matches on path prefix.
 */

/**
 * The GIS script, with the button's language in the query string.
 *
 * **`hl` is what actually decides the button's wording.** `renderButton` also
 * takes a `locale`, and it is documented, and it does nothing — a button
 * rendered with `locale: 'en'` from a script loaded without `hl` came back
 * reading "Fazer Login com o Google" on a machine whose browser prefers
 * pt-BR, which is precisely the silent-English-fallback failure this project's
 * i18n rules exist to prevent, in reverse. Checked in a real browser; there is
 * no way to see it from the types.
 */
function gisSrc(language: string): string {
  return `https://accounts.google.com/gsi/client?hl=${encodeURIComponent(language)}`;
}

/**
 * The OAuth client ID, baked in at build time by Vite.
 *
 * Public by construction — the browser hands it to Google to obtain a token in
 * the first place — so unlike a secret it belongs in the bundle. Blank is
 * treated as unset: a declared-but-empty `VITE_GOOGLE_CLIENT_ID=` arrives as
 * `''`, exactly the way `blankAsUndefined` handles the server's own copy.
 */
export function googleClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || undefined;
}

/** Minimal shape of what GIS puts on `window`. Only what this app calls. */
interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        /** Keeps the flow to the button; no auto sign-in, no One Tap prompt. */
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        use_fedcm_for_prompt?: boolean;
      }): void;
      renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
      /** Clears GIS's own session hint, so the chooser reappears next time. */
      disableAutoSelect(): void;
    };
  };
}

export interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  /** Pixels. GIS refuses anything above 400 and ignores percentages. */
  width?: number;
  // `locale` belongs here in Google's own documentation and is deliberately
  // absent: it has no effect. The script's `hl` parameter is the language —
  // see `gisSrc` above.
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

/**
 * Loads the GIS script, once per language.
 *
 * Both auth screens mount a button and a user moves between them, so the
 * promise is shared rather than a `<script>` being appended per mount. It is
 * keyed on the language because `hl` is fixed at fetch time: someone who
 * switches the language on the sign-in screen — where the picker deliberately
 * is, because a person who cannot read the page cannot sign in to go and
 * change it — would otherwise be left with one control still in the old one.
 * Re-fetching is the only way to relabel it; there is no API for the language.
 *
 * The previous script and `window.google` are removed first, so the reload is
 * a replacement rather than a second copy of Google's script racing the first.
 */
let loading: Promise<GoogleIdentityServices> | undefined;
let loadedLanguage: string | undefined;

export function loadGoogleIdentityServices(language: string): Promise<GoogleIdentityServices> {
  if (loading && loadedLanguage === language) return loading;

  if (loadedLanguage !== undefined) {
    for (const stale of document.querySelectorAll('script[src^="https://accounts.google.com/gsi/client"]')) {
      stale.remove();
    }
    delete window.google;
  }

  const src = gisSrc(language);
  loadedLanguage = language;

  loading = new Promise<GoogleIdentityServices>((resolve, reject) => {
    const script = document.createElement('script');

    script.addEventListener(
      'load',
      () => {
        if (window.google?.accounts?.id) resolve(window.google);
        // Loaded but with nothing on `window` means something replaced or
        // blocked the script — a rejection the caller can show, not a hang.
        else reject(new Error('Google Identity Services loaded without an accounts API'));
      },
      { once: true },
    );

    script.addEventListener(
      'error',
      () => {
        // Let a later attempt try again: this is usually a blocked request or
        // a dropped connection rather than something permanent.
        loading = undefined;
        loadedLanguage = undefined;
        script.remove();
        reject(new Error('Could not load Google Identity Services'));
      },
      { once: true },
    );

    script.src = src;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });

  return loading;
}

/**
 * Forgets which Google account was used, so the next sign-in shows the chooser.
 *
 * Called when this app's own session ends. Without it GIS keeps its hint and
 * the next person at the same browser is offered the previous user's account
 * as the obvious choice, which on a shared machine reads as "still signed in".
 * Safe to call when the script was never loaded — that is the common case, and
 * it does nothing.
 */
export function forgetGoogleAccount(): void {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* GIS not loaded, or a browser that blocks it. Nothing to forget. */
  }
}
