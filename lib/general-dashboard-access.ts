import type { RoleGroupFlags, UserRole } from "@/lib/roles";
import {
  isGeneralDashboardPerson,
  isInternalControlPerson,
  normalizeLoginDigits,
} from "@/lib/special-access";

export const GENERAL_DASHBOARD_PATH = "/general-dashboard";

export { normalizeLoginDigits };

type GeneralDashboardAccessContext = {
  login?: string | null;
  name?: string | null;
  employeeJobTitle?: string | null;
  role?: UserRole;
  groupFlags?: Partial<RoleGroupFlags> | null;
};

export function canAccessGeneralDashboard(context: GeneralDashboardAccessContext) {
  const flags = context.groupFlags || {};

  return Boolean(
    isGeneralDashboardPerson(context.login) ||
      isInternalControlPerson(context.login, context.name, context.employeeJobTitle) ||
      context.role === "director" ||
      context.role === "general_manager" ||
      flags.municipalManager ||
      flags.municipalDirector ||
      flags.fleetRepairCeo ||
      flags.fleetRepairGeneralManager,
  );
}
