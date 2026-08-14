import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateProfileMutation } from '../api/endpoints/users';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { userLoaded } from '../features/auth/authSlice';
import { adoptProfileLanguage, setLanguage } from '.';
import { LANGUAGES, resolveLanguage, type Language } from './languages';

interface UseLanguage {
  /** The language in force right now, always one of `LANGUAGES`. */
  current: Language;
  languages: readonly Language[];
  /** Applies a language everywhere and remembers it. */
  change: (code: string) => void;
}

/**
 * The one place that owns "what language is this app in".
 *
 * A language lives in two places and they answer different questions. The
 * browser's copy answers "what should this device show, right now, even before
 * anyone signs in" — it is what makes the login screen readable. The profile's
 * `locale` answers "what does this person read", and is what carries the
 * choice to their phone. Changing the language writes both; only the browser's
 * copy is consulted at startup.
 *
 * Saving to the profile is fire-and-forget on purpose. The language has already
 * changed on screen by the time the request goes out, and a failed PATCH should
 * not roll the interface back under the user — the local choice still holds,
 * and the next successful save will carry it.
 */
export function useLanguage(): UseLanguage {
  const { i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const [updateProfile] = useUpdateProfileMutation();

  // The profile's language is adopted once per signed-in session. Without the
  // ref this would re-run on every render that touches the user object and
  // fight anything the user does with the picker.
  const adopted = useRef(false);
  useEffect(() => {
    if (!user) {
      adopted.current = false;
      return;
    }
    if (adopted.current) return;
    adopted.current = true;
    void adoptProfileLanguage(user.locale);
  }, [user]);

  const change = useCallback(
    (code: string) => {
      const resolved = resolveLanguage(code);
      if (!resolved) return;

      void setLanguage(resolved);

      if (!user || user.locale === resolved) return;
      void updateProfile({ locale: resolved })
        .unwrap()
        .then((result) => dispatch(userLoaded(result.user)))
        .catch(() => undefined);
    },
    [dispatch, updateProfile, user],
  );

  const current = LANGUAGES.find((language) => language.code === i18n.language) ?? LANGUAGES[0]!;

  return { current, languages: LANGUAGES, change };
}
