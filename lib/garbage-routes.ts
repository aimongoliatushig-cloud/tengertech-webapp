import { isAutoGarbageDepartment } from "@/lib/department-permissions";
import type { RoleContext } from "@/lib/roles";

export type GarbageRoutePermissions = {
  weekly_create: boolean;
  weekly_edit: boolean;
  daily_change: boolean;
  today_view: boolean;
  point_execute: boolean;
  inspection_write: boolean;
  dashboard_view: boolean;
  all_view: boolean;
};

function flags(context: RoleContext) {
  return context.groupFlags || {};
}

export function getGarbageRoutePermissions(
  context: RoleContext,
  departmentName?: string | null,
): GarbageRoutePermissions {
  const groupFlags = flags(context);
  const isAdmin = context.role === "system_admin";
  const isHead = Boolean(
    isAdmin ||
      groupFlags.mfoManager ||
      ((context.role === "project_manager" || groupFlags.municipalDepartmentHead) &&
        isAutoGarbageDepartment(departmentName)),
  );
  const isDispatcher = Boolean(groupFlags.mfoDispatcher);
  const isInspector = Boolean(
    context.role === "transport_inspector" ||
      context.role === "hse_officer" ||
      groupFlags.mfoInspector ||
      groupFlags.municipalInspector ||
      groupFlags.municipalHse,
  );
  const isExecutive = Boolean(
    context.role === "director" ||
      context.role === "general_manager" ||
      groupFlags.municipalDirector,
  );
  const isMobile = Boolean(groupFlags.mfoMobile || groupFlags.mfoDriver || groupFlags.mfoLoader);

  return {
    weekly_create: isAdmin || isHead || isDispatcher,
    weekly_edit: isAdmin || isHead || isDispatcher,
    daily_change: isAdmin || isHead || isDispatcher,
    today_view: isAdmin || isHead || isDispatcher || isInspector || isExecutive || isMobile,
    point_execute: isAdmin || isMobile,
    inspection_write: isAdmin || isInspector,
    dashboard_view: isAdmin || isHead || isDispatcher || isInspector || isExecutive,
    all_view: isAdmin || isHead || isDispatcher || isInspector || isExecutive,
  };
}
