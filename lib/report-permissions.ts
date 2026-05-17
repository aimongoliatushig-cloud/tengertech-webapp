import { isReportPlanningSpecialist, type RoleContext } from "@/lib/roles";

export function canViewAllWorkspaceReports(context: RoleContext) {
  const flags = context.groupFlags || {};

  return Boolean(
    context.role === "system_admin" ||
      context.role === "director" ||
      context.role === "general_manager" ||
      flags.municipalDirector ||
      flags.municipalManager ||
      flags.mfoManager ||
      flags.mfoDispatcher ||
      flags.fleetRepairManager ||
      flags.fleetRepairGeneralManager ||
      flags.fleetRepairCeo ||
      isReportPlanningSpecialist(context)
  );
}
