"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Flag,
  CircleHelp,
  Images,
  LayoutDashboard,
  Leaf,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  PlusCircle,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  DEPARTMENT_GROUPS,
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  matchesDepartmentGroup,
  type DepartmentGroupDefinition,
} from "@/lib/department-groups";
import { isAutoGarbageDepartment } from "@/lib/department-permissions";
import { ProfileAvatar } from "@/app/_components/profile-avatar";
import { useProfileImageUrl } from "@/app/_components/profile-image-client";
import {
  canAccessAutoBaseOverview,
  canAccessGarbageTransportSettings,
  canAccessProcurementModule,
  canViewGarbageWeightReports as canViewGarbageWeightReportsForContext,
  isGarbageDepartmentHead as isGarbageDepartmentHeadRole,
  isReportPlanningSpecialist,
  type RoleGroupFlags,
  type UserRole,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

import { PendingLinkIndicator } from "./pending-link-indicator";
import styles from "./app-menu.module.css";

type MenuKey =
  | "dashboard"
  | "tasks"
  | "employees"
  | "department-work"
  | "auto-base"
  | "fleet-repair"
  | "hr"
  | "field"
  | "projects"
  | "procurement"
  | "shared-work"
  | "profile"
  | "garbage-points"
  | "garbage-settings"
  | "cleaning-areas"
  | "settings"
  | "review"
  | "notifications"
  | "quality"
  | "chat"
  | "help"
  | "new-project"
  | "reports"
  | "reports-albums"
  | "reports-fleet"
  | "data-download"
  | "none";

type AppMenuProps = {
  active: MenuKey;
  canCreateProject?: boolean;
  canCreateTasks?: boolean;
  canWriteReports?: boolean;
  canViewQualityCenter?: boolean;
  canUseFieldConsole?: boolean;
  canViewAllReports?: boolean;
  canViewGarbageWeightReports?: boolean;
  canViewHr?: boolean;
  canManageHr?: boolean;
  canViewGeneralDashboard?: boolean;
  variant?: "default" | "executive";
  userName?: string;
  userRole?: UserRole;
  roleLabel?: string;
  userImageUrl?: string;
  masterMode?: boolean;
  workerMode?: boolean;
  notificationCount?: number;
  departmentScopeName?: string | null;
  groupFlags?: Partial<RoleGroupFlags> | null;
  reportOnlyMode?: boolean;
  hideMobileTopBar?: boolean;
};

type MenuItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  departmentName?: string;
  hardNavigate?: boolean;
  children?: MenuItem[];
};

function MenuLink({
  item,
  className,
  ariaCurrent,
  onClick,
  children,
}: {
  item: MenuItem;
  className: string;
  ariaCurrent?: "page";
  onClick?: () => void;
  children: ReactNode;
}) {
  if (item.hardNavigate) {
    return (
      <a
        href={item.href}
        className={className}
        aria-current={ariaCurrent}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={item.href}
      className={className}
      aria-current={ariaCurrent}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

const HIDDEN_DEPARTMENT_MENU_NAMES = new Set([
  "Хүний нөөц",
  "Дотоод хяналт",
  "Иргэдийн санал, гомдол",
]);

function isHiddenDepartmentMenu(group: DepartmentGroupDefinition) {
  return HIDDEN_DEPARTMENT_MENU_NAMES.has(group.name);
}

function isHiddenMenuItem(item: MenuItem) {
  return item.key === "shared-work" || item.key.startsWith("shared-work-");
}

function getDepartmentMenuIcon(group: DepartmentGroupDefinition): LucideIcon {
  if (group.name.includes("Санхүү")) {
    return BarChart3;
  }
  if (group.name.includes("Захиргаа")) {
    return FileText;
  }
  if (group.name.includes("Авто") || group.name.includes("хог")) {
    return Truck;
  }
  if (group.name.includes("Ногоон")) {
    return Leaf;
  }
  return Flag;
}

function getDockLabel(key: string) {
  switch (key) {
    case "dashboard":
      return "Самбар";
    case "tasks":
      return "Календарь";
    case "chat":
      return "Чат";
    case "review":
      return "Хянах ажил";
    case "field":
      return "Мэдэгдэл";
    case "profile":
      return "Профайл";
    default:
      return "Цэс";
  }
}

function createMenuGroup(
  key: string,
  label: string,
  icon: LucideIcon,
  children: MenuItem[],
): MenuItem | null {
  if (!children.length) {
    return null;
  }

  return {
    key,
    href: children[0].href,
    label,
    icon,
    children,
  };
}

function compactManagerMenuItems(items: MenuItem[]) {
  const dashboardItem = items.find((item) => item.key === "dashboard");
  const hrItem = items.find((item) => item.key === "hr");
  const hrChildren = items.filter((item) => item.key.startsWith("hr-"));
  const departmentChildren = items.filter((item) =>
    item.key.startsWith("department-"),
  );
  const reportItem = items.find((item) => item.key === "reports");
  const communicationChildren = items.filter((item) =>
    ["chat", "help", "review", "notifications"].includes(item.key),
  );
  const settingChildren = items.filter((item) => item.key === "settings");
  const procurementItem = items.find((item) => item.key === "procurement");
  const groupedKeys = new Set([
    "dashboard",
    ...(hrItem ? [hrItem.key] : []),
    "procurement",
    ...hrChildren.map((item) => item.key),
    ...departmentChildren.map((item) => item.key),
    ...(reportItem ? [reportItem.key] : []),
    "data-download",
    ...communicationChildren.map((item) => item.key),
    ...settingChildren.map((item) => item.key),
  ]);
  const dashboardRoutedKeys = new Set([
    "auto-base",
    "garbage-settings",
    "cleaning-areas",
    "tasks",
    "overdue-projects",
    "environment-work",
    "complaints",
  ]);
  const leftovers = items.filter(
    (item) => !groupedKeys.has(item.key) && !dashboardRoutedKeys.has(item.key),
  );

  return [
    dashboardItem,
    hrItem ?? createMenuGroup("manager-hr", "Хүний нөөц", Users, hrChildren),
    createMenuGroup(
      "manager-departments",
      "Хэлтэс, нэгжүүд",
      Flag,
      departmentChildren,
    ),
    procurementItem ? { ...procurementItem, label: "Худалдан авалт" } : null,
    reportItem ? { ...reportItem, label: "Тайлан" } : null,
    createMenuGroup(
      "manager-communication",
      "Харилцаа холбоо",
      MessageSquare,
      communicationChildren,
    ),
    createMenuGroup("manager-settings", "Тохиргоо", Settings, settingChildren),
    ...leftovers,
  ].filter((item): item is MenuItem => Boolean(item));
}

export function AppMenu({
  active,
  canCreateProject = false,
  canCreateTasks = false,
  canWriteReports = false,
  canViewQualityCenter = false,
  canUseFieldConsole = false,
  canViewAllReports = false,
  canViewGarbageWeightReports = false,
  canViewHr = false,
  canManageHr,
  canViewGeneralDashboard = false,
  variant = "default",
  userRole,
  userName = "Хэрэглэгч",
  roleLabel = "Систем",
  userImageUrl = "",
  masterMode = false,
  workerMode = false,
  notificationCount = 0,
  departmentScopeName = null,
  groupFlags = null,
  reportOnlyMode: reportOnlyModeProp = false,
  hideMobileTopBar = false,
}: AppMenuProps) {
  void getDockLabel;
  void canViewQualityCenter;
  void canUseFieldConsole;
  void variant;

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHrRoute = pathname === "/hr" || pathname.startsWith("/hr/");
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const resolvedUserImageUrl = useProfileImageUrl(userImageUrl);

  const profileAvatarContent = (
    <ProfileAvatar
      src={resolvedUserImageUrl}
      className={styles.profileAvatar}
      imageClassName={styles.profileAvatarImage}
      iconClassName={styles.profileAvatarIcon}
      aria-hidden
    />
  );

  useEffect(() => {
    if (!isOpen) {
      delete document.body.dataset.mobileMenuOpen;
      return;
    }

    document.body.dataset.mobileMenuOpen = "true";

    return () => {
      delete document.body.dataset.mobileMenuOpen;
    };
  }, [isOpen]);

  const flags = groupFlags || {};
  const roleLabelLower = roleLabel.toLocaleLowerCase("mn-MN");
  const resolvedRole: UserRole =
    userRole ??
    (workerMode
      ? "worker"
      : roleLabelLower.includes("system admin") ||
          roleLabelLower.includes("системийн админ")
        ? "system_admin"
        : roleLabelLower.includes("захирал")
          ? "director"
          : roleLabelLower.includes("менежер")
            ? "general_manager"
            : "worker");
  const roleContext = {
    role: resolvedRole,
    groupFlags,
    employeeJobTitle: roleLabel,
    name: userName,
  };
  const reportOnlyMode =
    reportOnlyModeProp || isReportPlanningSpecialist(roleContext);
  // "Шатахуун, жин" цэс эрхтэй хэрэглэгчид тогтмол харагдахын тулд props-оор
  // дамжуулаагүй хуудсууд дээр role/flag-аас нь дотооддоо тооцоолно (бусад
  // эрхийг roleContext-аар тооцдогтой ижил загвар). Эрхийн логик өөрчлөгдөхгүй.
  const resolvedCanViewGarbageWeightReports =
    canViewGarbageWeightReports || canViewGarbageWeightReportsForContext(roleContext);
  const roleLooksDepartmentHead =
    roleLabelLower.includes("хэлтсийн дарга") ||
    roleLabelLower.includes("хэлтэсийн дарга") ||
    roleLabelLower.includes("албаны дарга");
  const roleLooksProcurementParticipant =
    roleLooksDepartmentHead ||
    roleLabelLower.includes("худалдан авалт") ||
    roleLabelLower.includes("худалдан авах") ||
    roleLabelLower.includes("хангамж") ||
    roleLabelLower.includes("нярав") ||
    roleLabelLower.includes("бичиг хэргийн ажилтан") ||
    roleLabelLower.includes("бичиг хэрэг") ||
    roleLabelLower.includes("захиргааны ажилтан") ||
    roleLabelLower.includes("ерөнхий ня-бо") ||
    roleLabelLower.includes("ерөнхий нябо") ||
    roleLabelLower.includes("ерөнхий ня бо") ||
    roleLabelLower.includes("ерөнхий нягтлан") ||
    roleLabelLower.includes("хуулийн мэргэжилтэн") ||
    roleLabelLower.includes("хуульч");
  const roleLooksSystemAdmin =
    roleLabelLower.includes("системийн админ") ||
    roleLabelLower.includes("system admin");
  const hasExecutiveMenuAccess = Boolean(
    (canViewGeneralDashboard && !(roleLooksDepartmentHead && departmentScopeName)) ||
    flags.municipalDirector ||
    flags.fleetRepairCeo ||
    flags.fleetRepairGeneralManager ||
    resolvedRole === "director" ||
    resolvedRole === "general_manager",
  );
  const executiveMode =
    hasExecutiveMenuAccess ||
    (!roleLooksDepartmentHead &&
      (roleLabelLower.includes("захирал") ||
        roleLabelLower.includes("менежер")));
  const mfoFieldMode = Boolean(
    flags.mfoDriver || flags.mfoLoader || flags.mfoMobile,
  );
  const mfoManagerMode = Boolean(
    flags.mfoManager || flags.mfoDispatcher || flags.mfoInspector,
  );
  const environmentMode = Boolean(
    flags.environmentWorker ||
    flags.greenEngineer ||
    flags.greenMaster ||
    flags.improvementWelder ||
    flags.improvementFieldEngineer ||
    flags.improvementEngineer ||
    flags.improvementManager ||
    flags.environmentManager,
  );
  const environmentFieldMode =
    workerMode &&
    Boolean(
      flags.environmentWorker ||
      flags.greenEngineer ||
      flags.improvementWelder ||
      flags.improvementFieldEngineer ||
      flags.improvementEngineer,
    );
  const environmentManagerMode = Boolean(
    flags.greenMaster || flags.improvementManager || flags.environmentManager,
  );
  const repairFieldMode =
    workerMode &&
    Boolean(flags.fleetRepairMechanic || flags.fleetRepairTeamLeader);
  const canOpenAutoBase = canAccessAutoBaseOverview(
    roleContext,
    departmentScopeName,
  );
  const canOpenGarbageSettings = canAccessGarbageTransportSettings(
    roleContext,
    departmentScopeName,
  );
  const canOpenGeneralSettings = roleContext.role === "system_admin";
  const canOpenProcurement = canAccessProcurementModule(roleContext);
  const procurementMode = Boolean(
    roleLooksProcurementParticipant ||
    flags.opsStorekeeper ||
    flags.fleetRepairPurchaser ||
    flags.fleetRepairFinance ||
    flags.fleetRepairAccounting ||
    flags.fleetRepairAdministration ||
    flags.fleetRepairGeneralManager ||
    flags.fleetRepairManager ||
    flags.fleetRepairCeo ||
    flags.procurementPurchaseManager ||
    flags.procurementStorekeeper ||
    flags.procurementFinance ||
    flags.procurementAdministration ||
    flags.procurementLegal ||
    flags.procurementGeneralManager ||
    flags.procurementCeo,
  );
  const complaintMode = Boolean(flags.complaintManager);
  const isTransportInspectorRole =
    roleLabelLower.includes("тээвэрлэлтийн хяналтын ажилтан") ||
    roleLabelLower.includes("тээврийн хяналтын ажилтан") ||
    roleLabelLower.includes("хог тээврийн хяналтын ажилтан");
  const inspectorMode = Boolean(
    isTransportInspectorRole ||
    flags.mfoInspector ||
    flags.municipalInspector ||
    flags.greenMaster,
  );
  const departmentManagerMode = Boolean(
    flags.municipalDepartmentHead || environmentManagerMode || mfoManagerMode,
  );
  const isProcurementDepartmentHeadLike = Boolean(
    roleLooksDepartmentHead ||
    resolvedRole === "project_manager" ||
    flags.municipalDepartmentHead,
  );
  const showProcurement =
    canOpenProcurement ||
    procurementMode ||
    roleLooksProcurementParticipant ||
    executiveMode ||
    Boolean(
      flags.municipalDepartmentHead ||
      flags.municipalManager ||
      flags.municipalDirector,
    );
  const procurementWorkerMode = Boolean(
    workerMode &&
    showProcurement &&
    procurementMode &&
    !isProcurementDepartmentHeadLike,
  );
  const procurementActionParticipantMode = Boolean(
    !isProcurementDepartmentHeadLike &&
      !hasExecutiveMenuAccess &&
      !flags.procurementCeo &&
      !flags.procurementGeneralManager &&
      (flags.opsStorekeeper ||
        flags.fleetRepairPurchaser ||
        flags.fleetRepairFinance ||
        flags.fleetRepairAccounting ||
        flags.fleetRepairAdministration ||
        flags.procurementPurchaseManager ||
        flags.procurementStorekeeper ||
        flags.procurementFinance ||
        flags.procurementAdministration ||
        flags.procurementLegal),
  );
  const procurementLandingHref = procurementActionParticipantMode
    ? "/procurement/assigned"
    : "/procurement";
  const showReports =
    canWriteReports ||
    executiveMode ||
    departmentManagerMode ||
    inspectorMode ||
    canViewQualityCenter;
  const baseCanCreate =
    !workerMode && (canCreateProject || canCreateTasks || canWriteReports);
  const reviewHref = "/notifications";
  const roleLooksHr = roleLabelLower.includes("хүний нөөц");
  const transportInspectorMode =
    !workerMode &&
    !executiveMode &&
    Boolean(isTransportInspectorRole || flags.mfoInspector) &&
    !flags.mfoManager &&
    !flags.mfoDispatcher &&
    !flags.municipalDepartmentHead &&
    !roleLooksDepartmentHead;
  const hasHrGroupAccess = Boolean(
    flags.hrUser || flags.hrManager || flags.municipalHr,
  );
  const hasDepartmentHrAccess = Boolean(
    !workerMode &&
    !transportInspectorMode &&
    (resolvedRole === "project_manager" ||
      flags.municipalDepartmentHead ||
      roleLooksDepartmentHead),
  );
  const canShowHrMenu = Boolean(
    !transportInspectorMode && (canViewHr || hasDepartmentHrAccess),
  );
  const hrFocusedMode =
    !workerMode &&
    !hasExecutiveMenuAccess &&
    canShowHrMenu &&
    (roleLooksHr ||
      Boolean(
        hasHrGroupAccess &&
        canViewHr &&
        !departmentManagerMode &&
        !roleLooksDepartmentHead,
      ));
  const isGarbageDepartmentHead =
    !workerMode &&
    !masterMode &&
    !roleLooksSystemAdmin &&
    (isGarbageDepartmentHeadRole(roleContext, departmentScopeName) ||
      Boolean(
        isAutoGarbageDepartment(departmentScopeName) &&
        roleLooksDepartmentHead &&
        !executiveMode,
      ));
  const scopedDepartmentHeadMode = Boolean(
    !workerMode &&
    !transportInspectorMode &&
    !hasExecutiveMenuAccess &&
    !hrFocusedMode &&
    departmentScopeName &&
    !roleLooksSystemAdmin &&
    (roleLooksDepartmentHead ||
      resolvedRole === "project_manager" ||
      flags.municipalDepartmentHead ||
      departmentManagerMode),
  );
  const canCreate =
    baseCanCreate && !masterMode && !isGarbageDepartmentHead && !hrFocusedMode;

  const visibleDepartmentGroups = hrFocusedMode
    ? []
    : hasExecutiveMenuAccess
      ? DEPARTMENT_GROUPS
      : departmentScopeName
        ? DEPARTMENT_GROUPS.filter((group) => {
            const scopedGroup =
              findDepartmentGroupByName(departmentScopeName) ??
              findDepartmentGroupByUnit(departmentScopeName);
            return scopedGroup
              ? group.name === scopedGroup.name
              : matchesDepartmentGroup(group, departmentScopeName);
          })
        : DEPARTMENT_GROUPS;

  const departmentItems: MenuItem[] = visibleDepartmentGroups
    .filter((group) => !isHiddenDepartmentMenu(group))
    .map((group, index) => ({
      key: `department-${index}`,
      href: `/department-work?department=${encodeURIComponent(group.name)}`,
      label: group.name,
      icon: getDepartmentMenuIcon(group),
      departmentName: group.name,
    }));

  const hasHrSpecialistMenuAccess = canManageHr === true;
  const departmentHrMenuKeys = new Set([
    "hr-dashboard",
    "hr-employees",
    "hr-requests",
    "hr-sick",
    "hr-trips",
    "hr-orders",
  ]);
  const hrMenuChildren: MenuItem[] = [
    { key: "hr-dashboard", href: "/hr", label: "Хянах самбар", icon: LayoutDashboard },
    { key: "hr-employees", href: "/hr/employees", label: "Ажилтнууд", icon: Users },
    { key: "hr-new-employee", href: "/hr/employees/new", label: "Шинэ ажилтан", icon: PlusCircle },
    { key: "hr-requests", href: "/hr/leaves", label: "Чөлөө", icon: ClipboardCheck },
    { key: "hr-annual-leave", href: "/hr/sick?type=annual_leave", label: "Ээлжийн амралт", icon: CalendarDays },
    { key: "hr-sick", href: "/hr/sick", label: "Өвчтэй", icon: CalendarDays },
    { key: "hr-trips", href: "/hr/trips", label: "Томилолт", icon: Truck },
    { key: "hr-discipline", href: "/hr/discipline", label: "Сахилга", icon: Flag },
    { key: "hr-orders", href: "/hr/orders", label: "Тушаал", icon: FileText },
    { key: "hr-transfers", href: "/hr/transfers", label: "Шилжилт", icon: ListChecks },
    { key: "hr-clearance", href: "/hr/clearance", label: "Тойрох хуудас", icon: ClipboardCheck },
    { key: "hr-archive", href: "/hr/archive", label: "Ажлаас чөлөөлөх", icon: FileText },
    { key: "hr-reports", href: "/hr/reports", label: "Тайлан", icon: BarChart3 },
    { key: "hr-settings", href: "/hr/settings", label: "Тохиргоо", icon: Settings },
  ].filter((item) => hasHrSpecialistMenuAccess || departmentHrMenuKeys.has(item.key));
  const hrMenuItem: MenuItem = {
    key: "hr",
    href: "/hr",
    label: "Хүний нөөц",
    icon: Users,
    children: hrMenuChildren,
  };

  const hrItems: MenuItem[] = canShowHrMenu
    ? [hrMenuItem]
    : [];

  const roleFocusedItems: MenuItem[] = [
    ...(procurementWorkerMode
      ? [
          {
            key: "procurement",
            href: procurementLandingHref,
            label: "Худалдан авалт",
            icon: ShoppingCart,
          },
        ]
      : []),
    ...(workerMode && mfoFieldMode && !procurementWorkerMode
      ? [
          {
            key: "tasks",
            href: "/tasks",
            label: "Өнөөдрийн ажил",
            icon: ListChecks,
          },
        ]
      : []),
    ...(environmentMode &&
    !(workerMode && mfoFieldMode) &&
    !procurementWorkerMode
      ? [
          workerMode
            ? {
                key: "tasks",
                href: "/tasks",
                label: "Өнөөдрийн ажил",
                icon: ListChecks,
              }
            : {
                key: "environment-work",
                href: "/projects?department=%D0%9D%D0%BE%D0%B3%D0%BE%D0%BE%D0%BD%20%D0%B1%D0%B0%D0%B9%D0%B3%D1%83%D1%83%D0%BB%D0%B0%D0%BC%D0%B6%2C%20%D1%86%D1%8D%D0%B2%D1%8D%D1%80%D0%BB%D1%8D%D0%B3%D1%8D%D1%8D%20%D2%AF%D0%B9%D0%BB%D1%87%D0%B8%D0%BB%D0%B3%D1%8D%D1%8D%D0%BD%D0%B8%D0%B9%20%D1%85%D1%8D%D0%BB%D1%82%D1%8D%D1%81",
                label: "Ногоон байгууламж, тохижилт",
                icon: Leaf,
              },
        ]
      : []),
    ...(complaintMode && canOpenGarbageSettings
      ? [
          {
            key: "complaints",
            href: "/settings/garbage-transport#complaints",
            label: "Иргэдийн санал, гомдол",
            icon: MessageSquare,
          },
        ]
      : []),
  ];

  const procurementMenuItem: MenuItem = {
    key: "procurement",
    href: procurementLandingHref,
    label: "Худалдан авалт",
    icon: FileText,
  };

  const defaultItems: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: workerMode ? "Нүүр" : "Хяналтын самбар",
      icon: LayoutDashboard,
      hardNavigate: workerMode,
    },
    ...hrItems,
    ...roleFocusedItems,
    ...departmentItems,
    ...(canOpenAutoBase
      ? [
          {
            key: "auto-base",
            href: "/auto-base",
            label: "Авто бааз",
            icon: Truck,
          },
        ]
      : []),
    ...(!workerMode
      ? [
          {
            key: "employees",
            href: "/employees",
            label: "Ажилтны даалгавар",
            icon: Users,
          },
          {
            key: "department-work",
            href: "/department-work",
            label: "Хэлтсийн ажил",
            icon: Building2,
          },
          {
            key: "tasks",
            href: "/tasks?view=today",
            label: "Календарь",
            icon: CalendarDays,
          },
        ]
      : []),
    {
      key: "data-download",
      href: "/data-download",
      label: "Баримт бичиг",
      icon: FileText,
    },
    ...(showReports
      ? [
          {
            key: "reports",
            href: canWriteReports ? "/reports" : "/review",
            label: "Тайлан",
            icon: BarChart3,
            // "Тайлан"-г dropdown болгож "Ажлын тайлан" + "Зургийн цомог"
            // (шатахуун/жингийн эрхтэй бол "Шатахуун, жин"-г нэмж) бүлэглэнэ.
            children: [
              {
                key: "reports-work",
                href: canWriteReports ? "/reports" : "/review",
                label: "Ажлын тайлан",
                icon: BarChart3,
              },
              {
                key: "reports-albums",
                href: "/reports/albums",
                label: "Зургийн цомог",
                icon: Images,
              },
              ...(resolvedCanViewGarbageWeightReports
                ? [
                    {
                      key: "reports-fleet",
                      href: "/reports/fleet",
                      label: "Шатахуун, жин",
                      icon: Truck,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(canOpenGarbageSettings && !isGarbageDepartmentHead
      ? [
          {
            key: "garbage-settings",
            href: "/settings/garbage-transport",
            label: "Хог тээвэрлэлтийн тохиргоо",
            icon: Settings,
          },
        ]
      : []),
    ...(canOpenGeneralSettings
      ? [
          {
            key: "settings",
            href: "/settings",
            label: "Ерөнхий тохиргоо",
            icon: Settings,
          },
        ]
      : []),
    ...(showProcurement &&
    !roleFocusedItems.some((item) => item.key === "procurement")
      ? [procurementMenuItem]
      : []),
    {
      key: "chat",
      href: "/chat",
      label: "Чат",
      icon: MessageSquare,
    },
    {
      key: "help",
      href: "/help",
      label: "Тусламж",
      icon: CircleHelp,
    },
    {
      key: "review",
      href: reviewHref,
      label: "Мэдэгдэл",
      icon: Bell,
      badge: notificationCount,
    },
  ].filter((item) => {
    if (isHiddenMenuItem(item)) {
      return false;
    }
    if (hrFocusedMode) {
      return item.key.startsWith("hr") || item.key === "profile";
    }
    if (item.key === "data-download" && masterMode) {
      return false;
    }
    if (!workerMode) {
      return true;
    }
    if (canViewAllReports && ["data-download", "reports"].includes(item.key)) {
      return true;
    }
    if (resolvedCanViewGarbageWeightReports && item.key === "data-download") {
      return true;
    }
    if (item.key.startsWith("hr")) {
      return false;
    }
    if (item.key === "procurement") {
      return showProcurement;
    }
    if (mfoFieldMode) {
      return [
        "dashboard",
        "tasks",
        "shared-work",
        "chat",
        "help",
        "review",
        "notifications",
      ].includes(item.key);
    }
    if (environmentFieldMode) {
      return [
        "dashboard",
        "tasks",
        "shared-work",
        "chat",
        "help",
        "review",
        "notifications",
      ].includes(item.key);
    }
    if (repairFieldMode) {
      return [
        "dashboard",
        "fleet-repair",
        "chat",
        "help",
        "review",
        "notifications",
      ].includes(item.key);
    }
    return !["data-download", "reports", "fleet-repair"].includes(item.key);
  });

  const shouldUseCompactManagerMenu = Boolean(
    !workerMode &&
    (executiveMode ||
      departmentManagerMode ||
      resolvedRole === "director" ||
      resolvedRole === "general_manager"),
  );
  const compactDefaultItems: MenuItem[] = shouldUseCompactManagerMenu
    ? compactManagerMenuItems(defaultItems)
    : defaultItems;

  const garbageDepartmentItems: MenuItem[] = (
    [
      {
        key: "dashboard",
        href: "/",
        label: "Хяналтын самбар",
        icon: LayoutDashboard,
      },
      ...(canShowHrMenu
        ? [hrMenuItem]
        : []),
      {
        key: "projects",
        href: departmentItems[0]?.href ?? "/projects",
        label: "Ажил",
        icon: ListChecks,
      },
      {
        key: "auto-base",
        href: "/auto-base",
        label: "Авто бааз",
        icon: Truck,
      },
      {
        key: "reports",
        href: "/reports",
        label: "Тайлан",
        icon: BarChart3,
      },
      ...(showProcurement ? [procurementMenuItem] : []),
      {
        key: "garbage-settings",
        href: "/settings/garbage-transport",
        label: "Хог тээвэрлэлтийн тохиргоо",
        icon: Settings,
      },
    ] as MenuItem[]
  ).filter((item) => !["auto-base", "garbage-settings"].includes(item.key));

  const scopedDepartmentWorkHref =
    departmentItems[0]?.href ??
    (departmentScopeName
      ? `/projects?department=${encodeURIComponent(departmentScopeName)}`
      : "/projects");
  const scopedDepartmentIsAutoGarbage = Boolean(
    isAutoGarbageDepartment(departmentScopeName),
  );
  const scopedDepartmentHeadItems: MenuItem[] = (
    [
      {
        key: "dashboard",
        href: "/",
        label: "Хяналтын самбар",
        icon: LayoutDashboard,
      },
      {
        key: "projects",
        href: scopedDepartmentWorkHref,
        label: "Ажил",
        icon: ListChecks,
      },
      ...(canShowHrMenu
        ? [hrMenuItem]
        : []),
      ...(scopedDepartmentIsAutoGarbage
        ? [
            {
              key: "auto-base",
              href: "/auto-base",
              label: "Авто бааз",
              icon: Truck,
            },
          ]
        : []),
      ...(showReports
        ? [
            {
              key: "reports",
              href: "/reports",
              label: "Тайлан",
              icon: BarChart3,
            },
          ]
        : []),
      ...(canOpenGarbageSettings && scopedDepartmentIsAutoGarbage
        ? [
            {
              key: "garbage-settings",
              href: "/settings/garbage-transport",
              label: "Хог тээвэрлэлтийн тохиргоо",
              icon: Settings,
            },
          ]
        : []),
      ...(showProcurement ? [procurementMenuItem] : []),
      {
        key: "chat",
        href: "/chat",
        label: "Чат",
        icon: MessageSquare,
      },
      {
        key: "review",
        href: "/review",
        label: "Хянах ажил",
        icon: ClipboardCheck,
        badge: notificationCount,
      },
    ] as MenuItem[]
  ).filter((item) => !["auto-base", "garbage-settings"].includes(item.key));

  const masterItems: MenuItem[] = [
    {
      key: "projects",
      href: scopedDepartmentWorkHref,
      label: "Ажил",
      icon: ListChecks,
    },
  ];

  const transportInspectorItems: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: "Нүүр",
      icon: LayoutDashboard,
    },
    {
      key: "tasks",
      href: "/tasks",
      label: "Хянах",
      icon: ClipboardCheck,
    },
    {
      key: "notifications",
      href: reviewHref,
      label: "Мэдэгдэл",
      icon: Bell,
      badge: notificationCount,
    },
  ];
  const reportOnlyItems: MenuItem[] = [
    {
      key: "reports",
      href: "/reports",
      label: "Тайлан",
      icon: BarChart3,
    },
  ];

  const baseItems = (
    masterMode
      ? masterItems
      : reportOnlyMode
      ? reportOnlyItems
      : transportInspectorMode
        ? transportInspectorItems
        : scopedDepartmentHeadMode
          ? scopedDepartmentHeadItems
          : isGarbageDepartmentHead
          ? garbageDepartmentItems
          : compactDefaultItems
  );
  const items = (isHrRoute
    ? baseItems.flatMap((item) =>
        item.children?.length && item.children.every((child) => child.key.startsWith("hr-"))
          ? item.children
          : item,
      )
    : baseItems
  ).filter((item) => !isHiddenMenuItem(item));

  function isProcurementChildActive(item: MenuItem) {
    const state = searchParams.get("state");
    const panel = searchParams.get("panel");
    const relation = searchParams.get("relation");
    const procurementDetailActive =
      pathname.startsWith("/procurement/") &&
      ![
        "/procurement/dashboard",
        "/procurement/new",
        "/procurement/assigned",
        "/procurement/suppliers",
      ].some((path) => pathname.startsWith(path));

    switch (item.key) {
      case "procurement-dashboard":
        return pathname === "/procurement/dashboard";
      case "procurement-list":
        return pathname === "/procurement" && !state && !panel && !relation
          ? true
          : procurementDetailActive;
      case "procurement-projects":
        return pathname === "/procurement" && relation === "project";
      case "procurement-vehicles":
        return pathname === "/procurement" && relation === "vehicle";
      case "procurement-new":
        return pathname === "/procurement/new";
      case "procurement-quotes":
        return (
          pathname === "/procurement" &&
          (state === "quotation_waiting" ||
            state === "quotations_ready" ||
            searchParams.get("flow") === "quotes")
        );
      case "procurement-suppliers":
        return (
          pathname === "/procurement/suppliers" ||
          (pathname === "/procurement" && panel === "suppliers")
        );
      case "procurement-orders":
        return pathname === "/procurement" && state === "order_waiting";
      case "procurement-contracts":
        return pathname === "/procurement" && state === "contract_waiting";
      case "procurement-receiving":
        return pathname === "/procurement" && state === "received";
      case "procurement-finance":
        return pathname === "/procurement" && state === "payment_waiting";
      case "procurement-assigned":
        return pathname === "/procurement/assigned";
      default:
        return false;
    }
  }

  function isItemActive(item: MenuItem) {
    if (item.key === "shared-work") {
      return (
        active === "shared-work" ||
        pathname === "/shared-work" ||
        pathname.startsWith("/shared-work/")
      );
    }
    if (item.key.startsWith("shared-work-")) {
      const view = searchParams.get("view");
      switch (item.key) {
        case "shared-work-all":
          return pathname === "/shared-work" && !view;
        case "shared-work-mine":
          return pathname === "/shared-work" && view === "mine";
        case "shared-work-progress":
          return pathname === "/shared-work" && view === "progress";
        case "shared-work-completed":
          return pathname === "/shared-work" && view === "completed";
        case "shared-work-reports":
          return pathname === "/shared-work" && view === "reports";
        default:
          return false;
      }
    }
    if (item.key === "procurement") {
      return (
        active === "procurement" ||
        pathname === "/procurement" ||
        pathname.startsWith("/procurement/")
      );
    }
    if (item.key.startsWith("procurement-")) {
      return isProcurementChildActive(item);
    }
    if (item.children?.some((child) => isItemActive(child))) {
      return true;
    }
    if (item.key === "reports-work") {
      return (
        active === "reports" ||
        pathname === "/reports" ||
        (pathname.startsWith("/reports/") && !pathname.startsWith("/reports/fleet"))
      );
    }
    if (item.key === "reports-fleet") {
      return active === "reports-fleet" || pathname.startsWith("/reports/fleet");
    }
    if (item.key === "hr-dashboard") {
      return pathname === "/hr";
    }
    if (item.key === "hr-new-employee") {
      return pathname === "/hr/employees/new";
    }
    if (item.key === "hr-employees") {
      return (
        pathname.startsWith("/hr/employees") && pathname !== "/hr/employees/new"
      );
    }
    if (item.key === "hr-notifications") {
      return (
        pathname === "/hr/leaves" && searchParams.get("state") === "pending"
      );
    }
    if (item.key === "hr-requests") {
      return (
        pathname === "/hr/leaves" && searchParams.get("state") !== "pending"
      );
    }
    if (item.key.startsWith("hr-")) {
      const itemPath = item.href.split("?")[0];
      return itemPath === "/hr"
        ? pathname === "/hr"
        : pathname.startsWith(itemPath);
    }
    if (item.departmentName) {
      return (
        pathname === "/projects" &&
        searchParams.get("department") === item.departmentName
      );
    }
    if (item.key === "overdue-projects") {
      return (
        pathname === "/projects" && searchParams.get("category") === "overdue"
      );
    }
    if (masterMode && item.key === "projects") {
      return (
        active === "dashboard" ||
        active === "projects" ||
        pathname === "/projects" ||
        pathname.startsWith("/projects/")
      );
    }
    if (item.key === active) {
      return true;
    }
    if (item.key === "review" && active === "field") {
      return true;
    }
    if (
      item.key === "review" &&
      item.href === "/notifications" &&
      active === "notifications"
    ) {
      return true;
    }
    if (item.key === "projects" && active === "tasks") {
      return true;
    }
    if (active === "garbage-settings" && item.key === "garbage-settings") {
      return true;
    }
    if (active === "field" && item.href === "/field") {
      return true;
    }
    return false;
  }

  const activeItem = items.find(isItemActive) ?? items[0];
  const mobilePrimaryAction: MenuItem | null =
    !masterMode && (canCreateProject || canCreateTasks)
    ? {
        key: "new-project",
        href: "/create",
        label: "Шинэ ажил",
        icon: PlusCircle,
      }
    : null;
  const mobileHomeAction: MenuItem = {
    key: "dashboard",
    href: "/",
    label: "Нүүр",
    icon: LayoutDashboard,
    hardNavigate: workerMode,
  };
  const mobileProfileAction: MenuItem = {
    key: "profile",
    href: "/profile",
    label: "Профайл",
    icon: Settings,
  };
  const masterMobileDockItems: MenuItem[] = [
    {
      key: "projects",
      href: scopedDepartmentWorkHref,
      label: "Ажил",
      icon: ListChecks,
    },
    ...(canCreateProject || canCreateTasks
      ? [
          {
            key: "new-project",
            href: "/create",
            label: "Ажил нэмэх",
            icon: PlusCircle,
          },
        ]
      : []),
    mobileProfileAction,
  ];

  const normalizeMobilePrimaryItem = (item: MenuItem | undefined) => {
    if (!item) {
      return null;
    }
    if (transportInspectorMode && item.key === "tasks") {
      return { ...item, label: "Хянах", icon: ClipboardCheck };
    }
    if (workerMode && item.key === "tasks") {
      return { ...item, label: "Ажлууд", icon: ListChecks };
    }
    return item;
  };

  const buildMobileDockItems = (dockItems: MenuItem[]) => {
    const visibleItems = dockItems.filter(
      (item) =>
        !isHiddenMenuItem(item) &&
        !(isGarbageDepartmentHead && item.key === "garbage-settings"),
    );
    const rolePrimaryItem = transportInspectorMode
      ? visibleItems.find((item) => item.key === "tasks")
      : workerMode
        ? visibleItems.find((item) =>
            ["tasks", "fleet-repair", "procurement-assigned"].includes(item.key),
          )
        : reportOnlyMode
          ? visibleItems.find((item) => item.key === "reports")
          : hrFocusedMode
            ? visibleItems.find((item) => item.key === "hr")
            : mobilePrimaryAction;
    const fallbackPrimaryItem = visibleItems.find((item) =>
      ["projects", "tasks", "reports", "fleet-repair", "procurement-assigned"].includes(item.key),
    );
    const primaryItem = normalizeMobilePrimaryItem(
      rolePrimaryItem ?? mobilePrimaryAction ?? fallbackPrimaryItem,
    );

    return [mobileHomeAction, primaryItem, mobileProfileAction].filter(
      (item): item is MenuItem => Boolean(item),
    );
  };
  const rawMobileDockItems: MenuItem[] = masterMode
    ? masterItems
    : transportInspectorMode
    ? [
        { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard },
        {
          key: "tasks",
          href: "/tasks",
          label: "Хянах",
          icon: ClipboardCheck,
        },
      ]
    : reportOnlyMode
      ? [{ key: "reports", href: "/reports", label: "Тайлан", icon: BarChart3 }]
      : isGarbageDepartmentHead
        ? [
            {
              key: "dashboard",
              href: "/",
              label: "Самбар",
              icon: LayoutDashboard,
            },
            {
              key: "projects",
              href: departmentItems[0]?.href ?? "/projects",
              label: "Ажил",
              icon: ListChecks,
            },
            {
              key: "reports",
              href: "/reports",
              label: "Тайлан",
              icon: BarChart3,
            },
            {
              key: "garbage-settings",
              href: "/settings/garbage-transport",
              label: "Тохиргоо",
              icon: Settings,
            },
          ]
        : scopedDepartmentHeadMode
          ? [
              {
                key: "dashboard",
                href: "/",
                label: "Самбар",
                icon: LayoutDashboard,
              },
              {
                key: "projects",
                href: scopedDepartmentWorkHref,
                label: "Ажил",
                icon: ListChecks,
              },
              ...(canShowHrMenu
                ? [hrMenuItem]
                : []),
              ...(showProcurement
                ? [
                    {
                      key: "procurement",
                      href: procurementLandingHref,
                      label: "Х.Авалт",
                      icon: ShoppingCart,
                    },
                  ]
                : []),
              {
                key: "review",
                href: "/review",
                label: "Хянах ажил",
                icon: ClipboardCheck,
                badge: notificationCount,
              },
            ]
          : hrFocusedMode
            ? [
                hrMenuItem,
                ...(mobilePrimaryAction ? [mobilePrimaryAction] : []),
                {
                  key: "profile",
                  href: "/profile",
                  label: "Профайл",
                  icon: Settings,
                },
              ]
            : procurementWorkerMode
              ? [
                  {
                    key: "dashboard",
                    href: "/",
                    label: "Нүүр",
                    icon: LayoutDashboard,
                    hardNavigate: true,
                  },
                  {
                    key: "procurement-suppliers",
                    href: "/procurement/suppliers",
                    label: "Нийлүүлэгчид",
                    icon: Users,
                  },
                  {
                    key: "procurement-assigned",
                    href: "/procurement/assigned",
                    label: "Х.Авалтууд",
                    icon: ShoppingCart,
                  },
                  {
                    key: "review",
                    href: "/notifications",
                    label: "Мэдэгдэл",
                    icon: Bell,
                    badge: notificationCount,
                  },
                  {
                    key: "profile",
                    href: "/profile",
                    label: "Профайл",
                    icon: Settings,
                  },
                ]
              : workerMode
                ? mfoFieldMode
                  ? [
                      {
                        key: "dashboard",
                        href: "/",
                        label: "Нүүр",
                        icon: LayoutDashboard,
                        hardNavigate: true,
                      },
                      {
                        key: "tasks",
                        href: "/tasks",
                        label: "Ажил",
                        icon: ListChecks,
                      },
                      {
                        key: "chat",
                        href: "/chat",
                        label: "Чат",
                        icon: MessageSquare,
                      },
                      {
                        key: "review",
                        href: "/notifications",
                        label: "Мэдэгдэл",
                        icon: Bell,
                        badge: notificationCount,
                      },
                      {
                        key: "profile",
                        href: "/profile",
                        label: "Профайл",
                        icon: Settings,
                      },
                    ]
                  : environmentFieldMode
                    ? [
                        {
                          key: "dashboard",
                          href: "/",
                          label: "Нүүр",
                          icon: LayoutDashboard,
                          hardNavigate: true,
                        },
                        {
                          key: "tasks",
                          href: "/tasks",
                          label: "Ажил",
                          icon: ListChecks,
                        },
                        {
                          key: "chat",
                          href: "/chat",
                          label: "Чат",
                          icon: MessageSquare,
                        },
                        {
                          key: "review",
                          href: "/notifications",
                          label: "Мэдэгдэл",
                          icon: Bell,
                          badge: notificationCount,
                        },
                        {
                          key: "profile",
                          href: "/profile",
                          label: "Профайл",
                          icon: Settings,
                        },
                      ]
                    : repairFieldMode
                      ? [
                          {
                            key: "dashboard",
                            href: "/",
                            label: "Нүүр",
                            icon: LayoutDashboard,
                            hardNavigate: true,
                          },
                          {
                            key: "fleet-repair",
                            href: "/fleet-repair/requests",
                            label: "Засвар",
                            icon: Wrench,
                          },
                          {
                            key: "chat",
                            href: "/chat",
                            label: "Чат",
                            icon: MessageSquare,
                          },
                          {
                            key: "review",
                            href: "/notifications",
                            label: "Мэдэгдэл",
                            icon: Bell,
                            badge: notificationCount,
                          },
                          {
                            key: "profile",
                            href: "/profile",
                            label: "Профайл",
                            icon: Settings,
                          },
                        ]
                      : [
                          {
                            key: "dashboard",
                            href: "/",
                            label: "Нүүр",
                            icon: LayoutDashboard,
                            hardNavigate: true,
                          },
                          {
                            key: "tasks",
                            href: "/tasks",
                            label: "Ажил",
                            icon: ListChecks,
                          },
                          {
                            key: "chat",
                            href: "/chat",
                            label: "Чат",
                            icon: MessageSquare,
                          },
                          {
                            key: "review",
                            href: reviewHref,
                            label: "Мэдэгдэл",
                            icon: Bell,
                            badge: notificationCount,
                          },
                          {
                            key: "profile",
                            href: "/profile",
                            label: "Профайл",
                            icon: Settings,
                          },
                        ]
                : [
                    ...(shouldUseCompactManagerMenu
                      ? [
                          {
                            key: "dashboard",
                            href: "/",
                            label: "Нүүр",
                            icon: LayoutDashboard,
                          },
                          {
                            key: "projects",
                            href: "/projects",
                            label: "Ажлууд",
                            icon: ListChecks,
                          },
                          ...(mobilePrimaryAction ? [mobilePrimaryAction] : []),
                          {
                            key: "chat",
                            href: "/chat",
                            label: "Чат",
                            icon: MessageSquare,
                          },
                          {
                            key: "review",
                            href: "/notifications",
                            label: "Хүсэлтүүд",
                            icon: ClipboardCheck,
                            badge: notificationCount,
                          },
                          {
                            key: "reports",
                            href: canWriteReports ? "/reports" : "/review",
                            label: "Тайлан",
                            icon: BarChart3,
                          },
                        ]
                      : [
                          {
                            key: "dashboard",
                            href: "/",
                            label: "Нүүр",
                            icon: LayoutDashboard,
                          },
                          {
                            key: "projects",
                            href: "/projects",
                            label: "Ажлууд",
                            icon: ListChecks,
                          },
                          ...(mobilePrimaryAction ? [mobilePrimaryAction] : []),
                          ...(showProcurement
                            ? [
                                {
                                  key: "procurement",
                                  href: procurementLandingHref,
                                  label: "Худалдан",
                                  icon: ShoppingCart,
                                },
                              ]
                            : []),
                          {
                            key: "reports",
                            href: canWriteReports ? "/reports" : "/review",
                            label: "Тайлан",
                            icon: BarChart3,
                          },
                          canShowHrMenu
                            ? hrMenuItem
                            : {
                                key: "chat",
                                href: "/chat",
                                label: "Чат",
                                icon: MessageSquare,
                              },
                        ]),
                  ];
  const visibleMobileDockItems = masterMode
    ? masterMobileDockItems
    : buildMobileDockItems(rawMobileDockItems);

  const menuList = (
    <nav className={styles.menuList} aria-label="Үндсэн цэс">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = isItemActive(item);
        const hasChildren = Boolean(item.children?.length);
        const isExpanded =
          hasChildren && (isActive || expandedGroups[item.key]);

        if (hasChildren) {
          return (
            <div key={item.key} className={styles.menuGroup}>
              <button
                type="button"
                className={cn(
                  styles.menuLink,
                  styles.menuGroupButton,
                  isActive && styles.menuLinkActive,
                )}
                aria-current={isActive ? "page" : undefined}
                aria-expanded={isExpanded}
                aria-controls={`submenu-${item.key}`}
                onClick={() =>
                  setExpandedGroups((current) => ({
                    ...current,
                    [item.key]: !isExpanded,
                  }))
                }
              >
                <span className={styles.menuIcon} aria-hidden>
                  <Icon />
                </span>
                <span className={styles.menuLabel}>{item.label}</span>
                {item.badge ? (
                  <span className={styles.menuBadge}>{item.badge}</span>
                ) : null}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    styles.menuGroupChevron,
                    isExpanded && styles.menuGroupChevronOpen,
                  )}
                />
              </button>

              {isExpanded ? (
                <div id={`submenu-${item.key}`} className={styles.submenuList}>
                  {item.children?.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive = isItemActive(child);

                    return (
                      <MenuLink
                        key={child.key}
                        item={child}
                        className={cn(
                          styles.submenuLink,
                          childActive && styles.submenuLinkActive,
                        )}
                        ariaCurrent={childActive ? "page" : undefined}
                        onClick={() => setIsOpen(false)}
                      >
                        <span className={styles.submenuIcon} aria-hidden>
                          <ChildIcon />
                        </span>
                        <span className={styles.menuLabel}>{child.label}</span>
                        <PendingLinkIndicator
                          className={styles.linkLoadingHint}
                          overlayClassName={styles.linkLoadingOverlay}
                        />
                      </MenuLink>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <MenuLink
            key={item.key}
            item={item}
            className={cn(styles.menuLink, isActive && styles.menuLinkActive)}
            ariaCurrent={isActive ? "page" : undefined}
            onClick={() => setIsOpen(false)}
          >
            <span className={styles.menuIcon} aria-hidden>
              <Icon />
            </span>
            <span className={styles.menuLabel}>{item.label}</span>
            <PendingLinkIndicator
              className={styles.linkLoadingHint}
              overlayClassName={styles.linkLoadingOverlay}
            />
            {item.badge ? (
              <span className={styles.menuBadge}>{item.badge}</span>
            ) : null}
          </MenuLink>
        );
      })}
    </nav>
  );

  return (
    <nav
      className={cn(
        styles.menuShell,
        workerMode && !procurementWorkerMode && styles.workerMenuShell,
      )}
      aria-label="Ажлын орчны цэс"
    >
      <aside className={styles.menuBar}>
        <Link href={hrFocusedMode ? "/hr" : "/"} className={styles.brandBlock}>
          <Image
            src="/logo.png"
            alt="Хот тохижилт үйлчилгээний төв"
            width={184}
            height={64}
            className={styles.logo}
            style={{ width: "178px", height: "auto" }}
            priority
            unoptimized
          />
          <p>Хоггүй, эрүүл, аюулгүй эко орчинд, эрүүл ирээдүйн төлөө</p>
        </Link>

        <div className={styles.menuScroll} suppressHydrationWarning>
          {menuList}
        </div>

        {canCreate ? (
          <Link href="/create" prefetch={false} className={styles.createButton}>
            <PlusCircle aria-hidden />
            <span>Шинэ ажил</span>
            <PendingLinkIndicator
              className={styles.createLoadingHint}
              overlayClassName={styles.linkLoadingOverlay}
            />
          </Link>
        ) : null}

        <div className={styles.profileMenuWrap}>
          <button
            type="button"
            className={styles.profileCard}
            aria-expanded={isProfileMenuOpen}
            aria-controls="account-menu"
            onClick={() => setIsProfileMenuOpen((open) => !open)}
          >
            {profileAvatarContent}
            <span className={styles.profileText}>
              <strong>{userName}</strong>
              <small>{roleLabel}</small>
            </span>
            <ChevronDown
              aria-hidden
              className={cn(isProfileMenuOpen && styles.profileChevronOpen)}
            />
          </button>
          {isProfileMenuOpen ? (
            <div id="account-menu" className={styles.profileMenu} role="menu">
              <Link
                href="/profile"
                role="menuitem"
                className={styles.profileMenuLink}
              >
                <Settings aria-hidden />
                <span>Тохиргоо</span>
              </Link>
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  role="menuitem"
                  className={styles.profileMenuLink}
                >
                  <LogOut aria-hidden />
                  <span>Гарах</span>
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </aside>

      {!hideMobileTopBar ? (
        <div className={styles.mobileTopBar}>
          <button
            type="button"
            className={styles.mobileMenuButton}
            aria-expanded={isOpen}
            onClick={() => setIsOpen(true)}
          >
            <Menu aria-hidden />
            <span>{activeItem.label}</span>
          </button>

          <Link
            href="/notifications"
            className={styles.mobileNotification}
            aria-label={`${notificationCount} мэдэгдэл харах`}
          >
            <Bell aria-hidden />
            {notificationCount > 0 ? <span>{notificationCount}</span> : null}
          </Link>

          <Link
            href="/profile"
            className={styles.mobileProfile}
            aria-label="Профайл харах"
          >
            {profileAvatarContent}
          </Link>
        </div>
      ) : null}

      {isOpen ? (
        <>
          <button
            type="button"
            className={styles.mobileBackdrop}
            aria-label="Цэс хаах"
            onClick={() => setIsOpen(false)}
          />
          <aside className={styles.mobileSheet} role="dialog" aria-label="Цэс">
            <div className={styles.mobileSheetHeader}>
              <div>
                <span>Цэс</span>
                <strong>{activeItem.label}</strong>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Цэс хаах"
              >
                <X aria-hidden />
              </button>
            </div>
            {menuList}
            <div className={styles.mobileSheetFooter}>
              <Link
                href="/profile"
                className={styles.mobileSheetProfile}
                onClick={() => setIsOpen(false)}
              >
                {profileAvatarContent}
                <span>
                  <strong>{userName}</strong>
                  <small>{roleLabel}</small>
                </span>
              </Link>
              <div className={styles.mobileSheetActions}>
                <Link
                  href="/profile"
                  className={styles.mobileSheetAction}
                  onClick={() => setIsOpen(false)}
                >
                  <Settings aria-hidden />
                  <span>Тохиргоо</span>
                </Link>
                <form action="/auth/logout" method="post">
                  <button type="submit" className={styles.mobileSheetAction}>
                    <LogOut aria-hidden />
                    <span>Гарах</span>
                  </button>
                </form>
              </div>
            </div>
          </aside>
        </>
      ) : null}

      <div
        className={cn(
          styles.mobileDock,
          visibleMobileDockItems.length === 3 && styles.mobileDockThree,
        )}
        style={
          {
            "--mobile-dock-count": visibleMobileDockItems.length,
          } as CSSProperties
        }
        aria-label="Хурдан цэс"
      >
        {visibleMobileDockItems.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item);

          return (
            <MenuLink
              key={`dock-${item.key}`}
              item={item}
              className={cn(
                styles.dockLink,
                (item.key === "new-project" ||
                  item.key === "procurement-new") &&
                  styles.dockLinkCreate,
                isActive && styles.dockLinkActive,
              )}
              ariaCurrent={isActive ? "page" : undefined}
            >
              <Icon aria-hidden />
              <span>{item.label}</span>
              <PendingLinkIndicator
                className={styles.dockLoadingHint}
                overlayClassName={styles.linkLoadingOverlay}
                label="..."
              />
            </MenuLink>
          );
        })}
      </div>
    </nav>
  );
}
