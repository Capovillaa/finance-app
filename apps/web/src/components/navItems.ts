import { AccountBalanceIcon, AssessmentIcon, AutorenewIcon, DashboardIcon, FlagIcon, NotificationsActiveIcon, PieChartIcon, ReceiptLongIcon, SettingsIcon, type IconComponent } from '../icons';

export interface NavItem {
  /**
   * A catalogue key rather than a label. This module is plain data, evaluated
   * once at import time, so it cannot hold a translated string — that would
   * freeze the language at whatever it was when the bundle first ran.
   */
  labelKey: string;
  to: string;
  icon: IconComponent;
}

/**
 * Sidebar navigation. The order follows the build order in CLAUDE.md's task
 * list, because each screen depends on the data model the one before it
 * establishes.
 */
export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.dashboard', to: '/', icon: DashboardIcon },
  { labelKey: 'nav.accounts', to: '/accounts', icon: AccountBalanceIcon },
  { labelKey: 'nav.transactions', to: '/transactions', icon: ReceiptLongIcon },
  { labelKey: 'nav.budgets', to: '/budgets', icon: PieChartIcon },
  { labelKey: 'nav.goals', to: '/goals', icon: FlagIcon },
  { labelKey: 'nav.recurring', to: '/recurring', icon: AutorenewIcon },
  { labelKey: 'nav.alerts', to: '/alerts', icon: NotificationsActiveIcon },
  { labelKey: 'nav.reports', to: '/reports', icon: AssessmentIcon },
  { labelKey: 'nav.settings', to: '/settings', icon: SettingsIcon },
];
