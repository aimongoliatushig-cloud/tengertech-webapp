export type UserRole =
  | "system_admin"
  | "director"
  | "general_manager"
  | "project_manager"
  | "senior_master"
  | "team_leader"
  | "worker"
  | string;

export type RoleGroupFlags = {
  mfoManager: boolean;
  mfoDispatcher: boolean;
  mfoInspector: boolean;
  mfoMobile: boolean;
  fleetRepairAny?: boolean;
  fleetRepairMechanic?: boolean;
  fleetRepairTeamLeader?: boolean;
  fleetRepairAccounting?: boolean;
  fleetRepairAdministration?: boolean;
  fleetRepairFinance?: boolean;
  fleetRepairPurchaser?: boolean;
  fleetRepairGeneralManager?: boolean;
  fleetRepairCeo?: boolean;
  fleetRepairManager?: boolean;
  opsStorekeeper?: boolean;
  hrUser?: boolean;
  hrManager?: boolean;
};

export type RoleContext = {
  role: UserRole;
  groupFlags?: Partial<RoleGroupFlags> | null;
};

export type AppRole =
  | "admin"
  | "executive"
  | "manager"
  | "dispatcher"
  | "inspector"
  | "leader"
  | "field_user";

export type Capability =
  | "create_projects"
  | "create_tasks"
  | "write_workspace_reports"
  | "view_quality_center"
  | "use_field_console";

const EMPTY_GROUP_FLAGS: RoleGroupFlags = {
  mfoManager: false,
  mfoDispatcher: false,
  mfoInspector: false,
  mfoMobile: false,
  fleetRepairAny: false,
  fleetRepairMechanic: false,
  fleetRepairTeamLeader: false,
  fleetRepairAccounting: false,
  fleetRepairAdministration: false,
  fleetRepairFinance: false,
  fleetRepairPurchaser: false,
  fleetRepairGeneralManager: false,
  fleetRepairCeo: false,
  fleetRepairManager: false,
  opsStorekeeper: false,
  hrUser: false,
  hrManager: false,
};

function normalizeGroupFlags(groupFlags?: Partial<RoleGroupFlags> | null): RoleGroupFlags {
  return {
    ...EMPTY_GROUP_FLAGS,
    ...(groupFlags || {}),
  };
}

export function getPrimaryAppRole(context: RoleContext): AppRole {
  const groupFlags = normalizeGroupFlags(context.groupFlags);

  if (context.role === "system_admin") {
    return "admin";
  }
  if (context.role === "director" || context.role === "general_manager") {
    return "executive";
  }
  if (groupFlags.mfoDispatcher) {
    return "dispatcher";
  }
  if (groupFlags.mfoInspector) {
    return "inspector";
  }
  if (context.role === "project_manager" || groupFlags.mfoManager) {
    return "manager";
  }
  if (context.role === "senior_master" || context.role === "team_leader") {
    return "leader";
  }
  return "field_user";
}

export function isMasterRole(role: UserRole) {
  return role === "senior_master" || role === "team_leader";
}

export function getRoleLabel(role: UserRole) {
  switch (role) {
    case "system_admin":
      return "Системийн админ";
    case "director":
      return "Захирал";
    case "general_manager":
      return "Үйл ажиллагаа хариуцсан менежер";
    case "project_manager":
      return "Хэлтсийн дарга";
    case "senior_master":
      return "Ахлах мастер";
    case "team_leader":
      return "Мастер";
    case "hr_specialist":
      return "Хүний нөөцийн мэргэжилтэн";
    case "hr_manager":
      return "Хүний нөөцийн менежер";
    case "worker":
      return "Ажилтан";
    default:
      return "Хэрэглэгч";
  }
}

export function hasCapability(context: RoleContext, capability: Capability) {
  const groupFlags = normalizeGroupFlags(context.groupFlags);

  switch (capability) {
    case "create_projects":
      return (
        context.role === "system_admin" ||
        context.role === "director" ||
        context.role === "general_manager" ||
        context.role === "project_manager" ||
        context.role === "senior_master" ||
        context.role === "team_leader"
      );
    case "create_tasks":
      return (
        context.role === "system_admin" ||
        context.role === "director" ||
        context.role === "general_manager" ||
        context.role === "project_manager" ||
        context.role === "senior_master" ||
        context.role === "team_leader"
      );
    case "write_workspace_reports":
      return (
        context.role === "system_admin" ||
        context.role === "project_manager" ||
        context.role === "senior_master" ||
        context.role === "team_leader" ||
        context.role === "worker"
      );
    case "view_quality_center":
      return (
        context.role === "system_admin" ||
        context.role === "director" ||
        context.role === "general_manager" ||
        context.role === "project_manager" ||
        groupFlags.mfoManager ||
        groupFlags.mfoDispatcher ||
        groupFlags.mfoInspector
      );
    case "use_field_console":
      if (context.role === "general_manager") {
        return false;
      }
      return (
        context.role === "system_admin" ||
        context.role === "senior_master" ||
        context.role === "team_leader" ||
        context.role === "worker" ||
        groupFlags.mfoManager ||
        groupFlags.mfoDispatcher ||
        groupFlags.mfoInspector ||
        groupFlags.mfoMobile
      );
    default:
      return false;
  }
}

export function isWorkerOnly(context: RoleContext) {
  const groupFlags = normalizeGroupFlags(context.groupFlags);
  return (
    context.role === "worker" &&
    !groupFlags.mfoManager &&
    !groupFlags.mfoDispatcher &&
    !groupFlags.mfoInspector
  );
}
