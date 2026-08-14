import { AccountBalanceIcon, CreditCardIcon, HomeIcon, PaymentsIcon, SavingsIcon, ShowChartIcon, type IconComponent } from '../../icons';
import type { AccountType } from '../../api/types';

export const ACCOUNT_TYPE_ICON: Record<AccountType, IconComponent> = {
  checking: AccountBalanceIcon,
  savings: SavingsIcon,
  credit_card: CreditCardIcon,
  investment: ShowChartIcon,
  cash: PaymentsIcon,
  loan: HomeIcon,
};
