export type UserRole =
  | "system_admin"
  | "director"
  | "general_manager"
  | "project_manager"
  | "senior_master"
  | "team_leader"
  | "hse_officer"
  | "public_relations"
  | "worker"
  | string;

export type RoleGroupFlags = {
  municipalWorker?: boolean;
  municipalMaster?: boolean;
  municipalInspector?: boolean;
  municipalDepartmentHead?: boolean;
  municipalManager?: boolean;
  municipalDirector?: boolean;
  municipalHr?: boolean;
  municipalIt?: boolean;
  mfoManager: boolean;
  mfoDispatcher: boolean;
  mfoInspector: boolean;
  mfoMobile: boolean;
  mfoDriver?: boolean;
  mfoLoader?: boolean;
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
  municipalHse?: boolean;
  municipalPublicRelations?: boolean;
  complaintManager?: boolean;
  environmentWorker?: boolean;
  greenEngineer?: boolean;
  greenMaster?: boolean;
  improvementWelder?: boolean;
  improvementFieldEngineer?: boolean;
  improvementEngineer?: boolean;
  improvementManager?: boolean;
  environmentManager?: boolean;
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
  municipalWorker: false,
  municipalMaster: false,
  municipalInspector: false,
  municipalDepartmentHead: false,
  municipalManager: false,
  municipalDirector: false,
  municipalHr: false,
  municipalIt: false,
  mfoManager: false,
  mfoDispatcher: false,
  mfoInspector: false,
  mfoMobile: false,
  mfoDriver: false,
  mfoLoader: false,
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
  municipalHse: false,
  municipalPublicRelations: false,
  complaintManager: false,
  environmentWorker: false,
  greenEngineer: false,
  greenMaster: false,
  improvementWelder: false,
  improvementFieldEngineer: false,
  improvementEngineer: false,
  improvementManager: false,
  environmentManager: false,
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
  if (groupFlags.municipalDirector || groupFlags.fleetRepairCeo) {
    return "executive";
  }
  if (groupFlags.mfoDispatcher) {
    return "dispatcher";
  }
  if (groupFlags.mfoInspector || groupFlags.municipalInspector) {
    return "inspector";
  }
  if (context.role === "hse_officer" || groupFlags.municipalHse) {
    return "inspector";
  }
  if (
    context.role === "project_manager" ||
    groupFlags.mfoManager ||
    groupFlags.municipalManager ||
    groupFlags.municipalDepartmentHead ||
    groupFlags.environmentManager ||
    groupFlags.improvementManager ||
    groupFlags.fleetRepairManager
  ) {
    return "manager";
  }
  if (
    context.role === "senior_master" ||
    context.role === "team_leader" ||
    groupFlags.municipalMaster ||
    groupFlags.greenMaster ||
    groupFlags.fleetRepairTeamLeader
  ) {
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
    case "hse_officer":
      return "ХАБЭА хяналтын ажилтан";
    case "public_relations":
      return "Олон нийттэй харилцах ажилтан";
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
      return Boolean(
        context.role === "system_admin" ||
        context.role === "director" ||
        context.role === "general_manager" ||
        context.role === "project_manager" ||
        groupFlags.complaintManager ||
        groupFlags.municipalDepartmentHead ||
        groupFlags.environmentManager ||
        groupFlags.improvementManager ||
        groupFlags.greenMaster ||
        groupFlags.improvementEngineer ||
        context.role === "public_relations" ||
        groupFlags.municipalPublicRelations ||
        context.role === "senior_master" ||
        context.role === "team_leader"
      );
    case "create_tasks":
      return Boolean(
        context.role === "system_admin" ||
        context.role === "director" ||
        context.role === "general_manager" ||
        context.role === "project_manager" ||
        groupFlags.complaintManager ||
        groupFlags.municipalDepartmentHead ||
        groupFlags.environmentManager ||
        groupFlags.improvementManager ||
        groupFlags.greenMaster ||
        groupFlags.greenEngineer ||
        groupFlags.improvementEngineer ||
        groupFlags.improvementFieldEngineer ||
        context.role === "public_relations" ||
        groupFlags.municipalPublicRelations ||
        context.role === "senior_master" ||
        context.role === "team_leader"
      );
    case "write_workspace_reports":
      return Boolean(
        context.role === "system_admin" ||
        context.role === "general_manager" ||
        context.role === "project_manager" ||
        groupFlags.complaintManager ||
        groupFlags.mfoMobile ||
        groupFlags.mfoDriver ||
        groupFlags.mfoLoader ||
        groupFlags.environmentWorker ||
        groupFlags.greenEngineer ||
        groupFlags.greenMaster ||
        groupFlags.improvementWelder ||
        groupFlags.improvementFieldEngineer ||
        groupFlags.improvementEngineer ||
        context.role === "public_relations" ||
        groupFlags.municipalPublicRelations ||
        context.role === "senior_master" ||
        context.role === "team_leader" ||
        context.role === "worker"
      );
    case "view_quality_center":
      return Boolean(
        context.role === "system_admin" ||
        context.role === "director" ||
        context.role === "general_manager" ||
        context.role === "project_manager" ||
        groupFlags.municipalInspector ||
        groupFlags.municipalDepartmentHead ||
        context.role === "hse_officer" ||
        groupFlags.municipalHse ||
        groupFlags.mfoManager ||
        groupFlags.mfoDispatcher ||
        groupFlags.mfoInspector ||
        groupFlags.environmentManager ||
        groupFlags.greenMaster ||
        groupFlags.improvementManager ||
        groupFlags.fleetRepairManager ||
        groupFlags.fleetRepairTeamLeader
      );
    case "use_field_console":
      if (context.role === "general_manager") {
        return false;
      }
      return Boolean(
        context.role === "system_admin" ||
        context.role === "senior_master" ||
        context.role === "team_leader" ||
        context.role === "worker" ||
        groupFlags.complaintManager ||
        context.role === "public_relations" ||
        groupFlags.municipalPublicRelations ||
        groupFlags.mfoManager ||
        groupFlags.mfoDispatcher ||
        groupFlags.mfoInspector ||
        groupFlags.mfoMobile ||
        groupFlags.mfoDriver ||
        groupFlags.mfoLoader ||
        groupFlags.environmentWorker ||
        groupFlags.greenEngineer ||
        groupFlags.greenMaster ||
        groupFlags.improvementWelder ||
        groupFlags.improvementFieldEngineer ||
        groupFlags.improvementEngineer ||
        groupFlags.fleetRepairMechanic ||
        groupFlags.fleetRepairTeamLeader
      );
    default:
      return false;
  }
}

export function canSubmitWorkspaceReport(context: RoleContext) {
  const groupFlags = normalizeGroupFlags(context.groupFlags);
  return Boolean(
    context.role === "system_admin" ||
    context.role === "senior_master" ||
    context.role === "team_leader" ||
    context.role === "worker" ||
    groupFlags.mfoMobile ||
    groupFlags.mfoDriver ||
    groupFlags.mfoLoader ||
    groupFlags.environmentWorker ||
    groupFlags.greenEngineer ||
    groupFlags.greenMaster ||
    groupFlags.improvementWelder ||
    groupFlags.improvementFieldEngineer ||
    groupFlags.improvementEngineer
  );
}

export function isWorkerOnly(context: RoleContext) {
  const groupFlags = normalizeGroupFlags(context.groupFlags);
  return (
    context.role === "worker" &&
    !groupFlags.mfoManager &&
    !groupFlags.mfoDispatcher &&
    !groupFlags.mfoInspector &&
    !groupFlags.municipalDepartmentHead &&
    !groupFlags.municipalManager &&
    !groupFlags.environmentManager &&
    !groupFlags.improvementManager &&
    !groupFlags.greenMaster &&
    !groupFlags.fleetRepairManager &&
    !groupFlags.fleetRepairTeamLeader &&
    !groupFlags.hrManager &&
    !groupFlags.municipalHr &&
    !groupFlags.municipalHse &&
    !groupFlags.municipalPublicRelations
  );
}

export function isHrOnlyRole(context: RoleContext) {
  const groupFlags = normalizeGroupFlags(context.groupFlags);
  const explicitHrRole = context.role === "hr_specialist" || context.role === "hr_manager";
  const hasHrAccess = Boolean(
    explicitHrRole ||
      groupFlags.hrUser ||
      groupFlags.hrManager ||
      groupFlags.municipalHr
  );
  const hasExecutiveOrAdminAccess = Boolean(
    context.role === "system_admin" ||
      context.role === "director" ||
      context.role === "general_manager" ||
      groupFlags.municipalDirector ||
      groupFlags.fleetRepairCeo
  );
  const hasDepartmentHeadAccess = Boolean(
    context.role === "project_manager" ||
      groupFlags.municipalDepartmentHead ||
      groupFlags.municipalManager ||
      groupFlags.mfoManager ||
      groupFlags.environmentManager ||
      groupFlags.improvementManager
  );

  return hasHrAccess && !hasExecutiveOrAdminAccess && (explicitHrRole || !hasDepartmentHeadAccess);
}
