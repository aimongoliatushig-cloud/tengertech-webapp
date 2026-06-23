import type { RoleGroupFlags, UserRole } from "@/lib/roles";
import { isGeneralDashboardPerson, normalizeLoginDigits } from "@/lib/special-access";

export const GENERAL_DASHBOARD_PATH = "/general-dashboard";

export { normalizeLoginDigits };

type GeneralDashboardAccessContext = {
  login?: string;
  role?: UserRole;
  groupFlags?: Partial<RoleGroupFlags> | null;
};

export function canAccessGeneralDashboard(context: GeneralDashboardAccessContext) {
  const flags = context.groupFlags || {};

  return Boolean(
    isGeneralDashboardPerson(context.login) ||
      context.role === "director" ||
      context.role === "general_manager" ||
      flags.municipalManager ||
      flags.municipalDirector ||
      flags.fleetRepairCeo ||
      flags.fleetRepairGeneralManager,
  );
}
