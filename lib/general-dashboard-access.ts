import type { RoleGroupFlags, UserRole } from "@/lib/roles";

export const GENERAL_DASHBOARD_PATH = "/general-dashboard";

const GENERAL_DASHBOARD_ALLOWED_LOGINS = new Set(["99996632", "80007504"]);

type GeneralDashboardAccessContext = {
  login?: string;
  role?: UserRole;
  groupFlags?: Partial<RoleGroupFlags> | null;
};

export function normalizeLoginDigits(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function canAccessGeneralDashboard(context: GeneralDashboardAccessContext) {
  const flags = context.groupFlags || {};

  return Boolean(
    GENERAL_DASHBOARD_ALLOWED_LOGINS.has(normalizeLoginDigits(context.login)) ||
      context.role === "director" ||
      context.role === "general_manager" ||
      flags.municipalDirector ||
      flags.fleetRepairCeo ||
      flags.fleetRepairGeneralManager,
  );
}
