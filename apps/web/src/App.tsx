import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ForgotPasswordPage from './features/auth/ForgotPasswordPage';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import RequireAuth from './features/auth/RequireAuth';
import ResetPasswordPage from './features/auth/ResetPasswordPage';
import VerifyEmailPage from './features/auth/VerifyEmailPage';
import AccountsPage from './pages/AccountsPage';
import AlertsPage from './pages/AlertsPage';
import BudgetsPage from './pages/BudgetsPage';
import DashboardPage from './pages/DashboardPage';
import GoalsPage from './pages/GoalsPage';
import RecurringPage from './pages/RecurringPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import TransactionsPage from './pages/TransactionsPage';
import { useLanguage } from './i18n/useLanguage';

/**
 * Routing.
 *
 * Everything below `RequireAuth` is workspace-scoped in practice — the screens
 * read the active workspace from the store rather than from the URL. Putting the
 * workspace id in the path was considered and rejected: it would double every
 * route, and the API already rejects any request for a workspace the caller is
 * not a member of, so the URL is not what enforces the boundary.
 *
 * This component also subscribes to i18next, which is what makes a language
 * change repaint the whole app rather than only the components that happen to
 * call `useTranslation`. Nothing here is wrapped in `React.memo`, so a re-render
 * at the root reaches every screen — including the numbers, which are formatted
 * by plain functions that read the locale rather than by hooks that could
 * subscribe on their own.
 */
export default function App(): ReactElement {
  useTranslation();
  // Mounted here so the signed-in profile's language is adopted once the
  // session resolves, wherever in the app the user happens to land.
  useLanguage();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Reachable signed in or out: the token is the proof, not the session. */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
