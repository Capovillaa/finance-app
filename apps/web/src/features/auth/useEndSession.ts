import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/api';
import { useAppDispatch } from '../../app/hooks';
import { forgetGoogleAccount } from '../../lib/googleSignIn';
import { workspaceCleared } from '../workspace/workspaceSlice';
import { credentialsCleared } from './authSlice';

/**
 * Tears the session down locally and sends the user to the login page.
 *
 * Signing out is not the only thing that ends a session: changing the password,
 * signing out of every device, and deleting the account all revoke every
 * refresh-token family server-side, which leaves this tab holding an access
 * token that will stop working at its next expiry. Each of those needs the same
 * four steps, and forgetting `resetApiState` in any one of them would leave the
 * previous account's cached rows on screen after the next login.
 *
 * It deliberately does *not* call the logout endpoint — the callers have each
 * already made a request that revoked the tokens, and a second one would just
 * 401.
 */
export function useEndSession(): () => void {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  return useCallback(() => {
    // Google keeps its own hint about which account was chosen here, and it
    // outlives this app's session. Left alone, the next person at a shared
    // browser is offered the previous user's account as the obvious choice,
    // which reads as still being signed in. A no-op when Google sign-in is not
    // configured, which is the common case.
    forgetGoogleAccount();
    dispatch(credentialsCleared());
    dispatch(workspaceCleared());
    dispatch(api.util.resetApiState());
    navigate('/login', { replace: true });
  }, [dispatch, navigate]);
}
