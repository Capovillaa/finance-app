import { BeachAccessIcon, DirectionsCarIcon, ElderlyIcon, FlagIcon, HomeIcon, SchoolIcon, SecurityIcon, ShowChartIcon, type IconComponent } from '../../icons';
import type { GoalCategory } from '../../api/types';

export const GOAL_CATEGORY_ICON: Record<GoalCategory, IconComponent> = {
  emergency_fund: SecurityIcon,
  vacation: BeachAccessIcon,
  car: DirectionsCarIcon,
  house: HomeIcon,
  education: SchoolIcon,
  retirement: ElderlyIcon,
  investment: ShowChartIcon,
  other: FlagIcon,
};
