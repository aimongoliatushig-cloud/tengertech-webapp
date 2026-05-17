"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Banknote,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Flag,
  CircleHelp,
  HeartPulse,
  LayoutDashboard,
  Leaf,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  PackageCheck,
  PlusCircle,
  ReceiptText,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Truck,
  UserPlus,
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
import {
  canAccessGarbageTransportSettings,
  canAccessProcurementModule,
  isGarbageDepartmentHead as isGarbageDepartmentHeadRole,
  type RoleGroupFlags,
  type UserRole,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

import { PendingLinkIndicator } from "./pending-link-indicator";
import styles from "./app-menu.module.css";
import { HR_NOTIFICATION_HREF } from "@/app/hr/constants";

const AUTO_GARBAGE_DEPARTMENT_NAME = "Авто бааз, хог тээвэрлэлтийн хэлтэс";

type MenuKey =
  | "dashboard"
  | "tasks"
  | "auto-base"
  | "fleet-repair"
  | "hr"
  | "field"
  | "projects"
  | "procurement"
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
  | "data-download";

type AppMenuProps = {
  active: MenuKey;
  canCreateProject?: boolean;
  canCreateTasks?: boolean;
  canWriteReports?: boolean;
  canViewQualityCenter?: boolean;
  canUseFieldConsole?: boolean;
  canViewAllReports?: boolean;
  canViewHr?: boolean;
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
  void item;
  return false;
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

function isOperationalDepartmentItem(item: MenuItem) {
  return (
    item.key.startsWith("department-") &&
    (item.label.includes("Ногоон") ||
      item.label.includes("Авто") ||
      item.label.includes("хог") ||
      item.label.includes("Тохижилт"))
  );
}

function dedupeMenuItems(items: MenuItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const dedupeKey = item.href || item.key;
    if (seen.has(dedupeKey)) {
      return false;
    }
    seen.add(dedupeKey);
    return true;
  });
}

function compactManagerMenuItems(items: MenuItem[]) {
  const dashboardItem = items.find((item) => item.key === "dashboard");
  const hrChildren = items.filter((item) => item.key.startsWith("hr-"));
  const operationalDepartmentChildren = items.filter(isOperationalDepartmentItem);
  const departmentChildren = items.filter(
    (item) => item.key.startsWith("department-") && !isOperationalDepartmentItem(item),
  );
  const operationChildren = dedupeMenuItems([
    ...items.filter((item) =>
      ["tasks", "environment-work", "fleet-repair", "cleaning-areas", "garbage-settings", "complaints"].includes(
        item.key,
      ),
    ),
    ...operationalDepartmentChildren,
  ]);
  const reportChildren = items.filter((item) => ["reports", "data-download"].includes(item.key));
  const communicationChildren = items.filter((item) => ["chat", "help", "review", "notifications"].includes(item.key));
  const settingChildren = items.filter((item) => item.key === "settings");
  const procurementItem = items.find((item) => item.key === "procurement");
  const groupedKeys = new Set([
    "dashboard",
    "procurement",
    ...hrChildren.map((item) => item.key),
    ...operationChildren.map((item) => item.key),
    ...operationalDepartmentChildren.map((item) => item.key),
    ...departmentChildren.map((item) => item.key),
    ...reportChildren.map((item) => item.key),
    ...communicationChildren.map((item) => item.key),
    ...settingChildren.map((item) => item.key),
  ]);
  const leftovers = items.filter((item) => !groupedKeys.has(item.key));

  return [
    dashboardItem,
    createMenuGroup("manager-operations", "Үйл ажиллагаа", Leaf, operationChildren),
    createMenuGroup("manager-hr", "Хүний нөөц", Users, hrChildren),
    createMenuGroup("manager-departments", "Хэлтэс, нэгжүүд", Flag, departmentChildren),
    procurementItem ? { ...procurementItem, label: "Санхүү, худалдан авалт" } : null,
    createMenuGroup("manager-reports", "Тайлан, баримт", BarChart3, reportChildren),
    createMenuGroup("manager-communication", "Харилцаа холбоо", MessageSquare, communicationChildren),
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
  canViewHr = false,
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
}: AppMenuProps) {
  void getDockLabel;
  void canViewQualityCenter;
  void canUseFieldConsole;
  void variant;

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [fetchedUserImageUrl, setFetchedUserImageUrl] = useState("");
  const resolvedUserImageUrl = userImageUrl || fetchedUserImageUrl;

  useEffect(() => {
    if (userImageUrl) {
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    fetch("/api/profile-image", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { imageUrl?: string } | null) => {
        if (!isCancelled && payload?.imageUrl) {
          setFetchedUserImageUrl(payload.imageUrl);
        }
      })
      .catch(() => {
        // The initials fallback is enough when the image endpoint is unavailable.
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [userImageUrl]);

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
  };
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
  const executiveMode =
    Boolean(
      canViewGeneralDashboard ||
        flags.municipalDirector ||
        flags.fleetRepairCeo ||
        flags.fleetRepairGeneralManager ||
        resolvedRole === "director" ||
        resolvedRole === "general_manager",
    ) ||
    (!roleLooksDepartmentHead &&
      (roleLabelLower.includes("захирал") ||
        roleLabelLower.includes("менежер")));
  const mfoFieldMode = Boolean(flags.mfoDriver || flags.mfoLoader || flags.mfoMobile);
  const mfoManagerMode = Boolean(flags.mfoManager || flags.mfoDispatcher || flags.mfoInspector);
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
  const repairMode = Boolean(flags.fleetRepairAny);
  const repairFieldMode =
    workerMode && Boolean(flags.fleetRepairMechanic || flags.fleetRepairTeamLeader);
  const canOpenGarbageSettings = canAccessGarbageTransportSettings(roleContext, departmentScopeName);
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
    isTransportInspectorRole || flags.mfoInspector || flags.municipalInspector || flags.greenMaster,
  );
  const departmentManagerMode = Boolean(
    flags.municipalDepartmentHead || environmentManagerMode || mfoManagerMode,
  );
  const showFleetRepair = repairMode || mfoManagerMode || executiveMode;
  const isProcurementDepartmentHeadLike = Boolean(
    roleLooksDepartmentHead || resolvedRole === "project_manager" || flags.municipalDepartmentHead,
  );
  const showProcurement =
    canOpenProcurement ||
    procurementMode ||
    roleLooksProcurementParticipant ||
    executiveMode ||
    Boolean(flags.municipalDepartmentHead || flags.municipalManager || flags.municipalDirector);
  const procurementWorkerMode = Boolean(
    workerMode && showProcurement && procurementMode && !isProcurementDepartmentHeadLike,
  );
  const showReports =
    canWriteReports || executiveMode || departmentManagerMode || inspectorMode || canViewQualityCenter;
  const baseCanCreate = !workerMode && (canCreateProject || canCreateTasks || canWriteReports);
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
  const departmentScopeLower = (departmentScopeName ?? "").toLocaleLowerCase("mn-MN");
  const canOpenCleaningAreas = Boolean(
    !workerMode &&
      !transportInspectorMode &&
      (executiveMode ||
        environmentManagerMode ||
        (flags.municipalDepartmentHead &&
          (departmentScopeLower.includes("ногоон") ||
            departmentScopeLower.includes("цэвэрлэгээ") ||
            departmentScopeLower.includes("зам талбай")))),
  );
  const hasHrGroupAccess = Boolean(flags.hrUser || flags.hrManager || flags.municipalHr);
  const hasDepartmentHrAccess = Boolean(
    !workerMode &&
      !transportInspectorMode &&
      (resolvedRole === "project_manager" || flags.municipalDepartmentHead || roleLooksDepartmentHead),
  );
  const canShowHrMenu = Boolean(!transportInspectorMode && (canViewHr || hasDepartmentHrAccess));
  const hrFocusedMode =
    !workerMode &&
    canShowHrMenu &&
    (roleLooksHr || Boolean(hasHrGroupAccess && canViewHr && !departmentManagerMode && !roleLooksDepartmentHead));
  const isGarbageDepartmentHead =
    !workerMode &&
    !masterMode &&
    !roleLooksSystemAdmin &&
    (isGarbageDepartmentHeadRole(roleContext, departmentScopeName) ||
      Boolean(isAutoGarbageDepartment(departmentScopeName) && roleLooksDepartmentHead && !executiveMode));
  const scopedDepartmentHeadMode = Boolean(
    !workerMode &&
      !transportInspectorMode &&
      !hrFocusedMode &&
      departmentScopeName &&
      !roleLooksSystemAdmin &&
      (roleLooksDepartmentHead ||
        resolvedRole === "project_manager" ||
        flags.municipalDepartmentHead ||
        departmentManagerMode),
  );
  const canCreate = baseCanCreate && !isGarbageDepartmentHead && !hrFocusedMode;

  const visibleDepartmentGroups = hrFocusedMode
    ? []
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
      href: `/projects?department=${encodeURIComponent(group.name)}`,
      label: group.name,
      icon: getDepartmentMenuIcon(group),
      departmentName: group.name,
    }));

  const hrItems: MenuItem[] = canShowHrMenu
    ? [
        { key: "hr-dashboard", href: "/hr", label: "Самбар", icon: LayoutDashboard },
        { key: "hr-employees", href: "/hr/employees", label: "Бүх ажилтнууд", icon: Users },
        { key: "hr-new-employee", href: "/hr/employees/new", label: "Шинэ ажилтан", icon: UserPlus },
        { key: "hr-requests", href: "/hr/leaves", label: "Ирсэн хүсэлтүүд", icon: CalendarDays },
        { key: "hr-sick", href: "/hr/sick", label: "Чөлөө / өвчтэй", icon: HeartPulse },
        { key: "hr-discipline", href: "/hr/discipline", label: "Сахилгын бүртгэл", icon: ShieldAlert },
        { key: "hr-notifications", href: HR_NOTIFICATION_HREF, label: "Мэдэгдэл", icon: Bell },
        { key: "hr-reports", href: "/hr/reports", label: "Тайлан", icon: FileText },
      ]
    : [];
  const departmentHrFocusedMode = Boolean(active === "hr" && hasDepartmentHrAccess && canShowHrMenu && !hrFocusedMode);
  const departmentHrItems: MenuItem[] = departmentHrFocusedMode
    ? [
        { key: "hr-dashboard", href: "/hr", label: "Хэлтсийн хүний нөөц", icon: LayoutDashboard },
        { key: "hr-employees", href: "/hr/employees", label: "Манай ажилтнууд", icon: Users },
        { key: "hr-requests", href: "/hr/leaves", label: "Ирсэн хүсэлтүүд", icon: CalendarDays },
        { key: "hr-sick", href: "/hr/sick", label: "Чөлөө / өвчтэй", icon: HeartPulse },
        { key: "hr-discipline", href: "/hr/discipline", label: "Сахилгын бүртгэл", icon: ShieldAlert },
        { key: "hr-notifications", href: HR_NOTIFICATION_HREF, label: "Мэдэгдэл", icon: Bell },
        { key: "hr-reports", href: "/hr/reports", label: "Тайлан", icon: FileText },
      ]
    : [];

  const roleFocusedItems: MenuItem[] = [
    ...(procurementWorkerMode
      ? [
          {
            key: "procurement",
            href: "/procurement/dashboard",
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
    ...(environmentMode && !(workerMode && mfoFieldMode) && !procurementWorkerMode
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
    ...(repairMode
      ? [
          {
            key: "fleet-repair",
            href: "/fleet-repair/requests",
            label: "Засварын хүсэлт",
            icon: Wrench,
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

  const isProcurementDepartmentHeadMenu = Boolean(
    !workerMode &&
      !executiveMode &&
      !roleLooksSystemAdmin &&
      isProcurementDepartmentHeadLike,
  );

  const departmentHeadProcurementSubmenuItems: MenuItem[] = [
    {
      key: "procurement-dashboard",
      href: "/procurement/dashboard",
      label: "Хяналтын самбар",
      icon: LayoutDashboard,
    },
    {
      key: "procurement-projects",
      href: "/procurement?relation=project",
      label: "Төслийн худалдан авалт",
      icon: ListChecks,
    },
    {
      key: "procurement-vehicles",
      href: "/procurement?relation=vehicle",
      label: "Машин / засварын худалдан авалт",
      icon: Truck,
    },
    {
      key: "procurement-new",
      href: "/procurement/new",
      label: "Шинэ хүсэлт үүсгэх",
      icon: PlusCircle,
    },
    {
      key: "procurement-quotes",
      href: "/procurement?state=quotation_waiting",
      label: "Нийлүүлэгчийн саналууд",
      icon: Users,
    },
    {
      key: "procurement-contracts",
      href: "/procurement?state=contract_waiting",
      label: "Гэрээ, баримт бичиг",
      icon: FileText,
    },
  ];

  const fullProcurementSubmenuItems: MenuItem[] = [
    {
      key: "procurement-dashboard",
      href: "/procurement/dashboard",
      label: "Хяналтын самбар",
      icon: LayoutDashboard,
    },
    {
      key: "procurement-list",
      href: "/procurement",
      label: "Худалдан авах хүсэлт",
      icon: ShoppingCart,
    },
    {
      key: "procurement-new",
      href: "/procurement/new",
      label: "Шинэ хүсэлт үүсгэх",
      icon: PlusCircle,
    },
    {
      key: "procurement-suppliers",
      href: "/procurement/suppliers",
      label: "Нийлүүлэгчид",
      icon: Users,
    },
    {
      key: "procurement-orders",
      href: "/procurement?state=order_waiting",
      label: "Захиалга (PO)",
      icon: ReceiptText,
    },
    {
      key: "procurement-contracts",
      href: "/procurement?state=contract_waiting",
      label: "Гэрээ, баримт бичиг",
      icon: FileText,
    },
    {
      key: "procurement-receiving",
      href: "/procurement?state=received",
      label: "Агуулах хүлээн авалт",
      icon: PackageCheck,
    },
    {
      key: "procurement-finance",
      href: "/procurement?state=payment_waiting",
      label: "Төлбөр, санхүү",
      icon: Banknote,
    },
    {
      key: "procurement-assigned",
      href: "/procurement/assigned",
      label: "Х.Авалтууд",
      icon: ClipboardCheck,
    },
  ];

  const procurementMenuItem: MenuItem = {
    key: "procurement",
    href: "/procurement/dashboard",
    label: "Худалдан авалт",
    icon: FileText,
    children: isProcurementDepartmentHeadMenu ? departmentHeadProcurementSubmenuItems : fullProcurementSubmenuItems,
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
    ...(showFleetRepair && !roleFocusedItems.some((item) => item.key === "fleet-repair")
      ? [
          {
            key: "fleet-repair",
            href: "/fleet-repair/requests",
            label: "Засварын хүсэлт",
            icon: Wrench,
          },
        ]
      : []),
    ...(!workerMode
      ? [
          {
            key: "tasks",
            href: "/tasks?view=today",
            label: "Календарь",
            icon: CalendarDays,
          },
        ]
      : []),
    ...(canOpenCleaningAreas
      ? [
          {
            key: "cleaning-areas",
            href: "/cleaning-areas",
            label: "Цэвэрлэх талбай",
            icon: MapPin,
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
            label: "Тайлан, статистик",
            icon: BarChart3,
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
    ...(showProcurement && !roleFocusedItems.some((item) => item.key === "procurement")
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
    if (item.key.startsWith("hr")) {
      return false;
    }
    if (item.key === "procurement") {
      return showProcurement;
    }
    if (mfoFieldMode) {
      return ["dashboard", "tasks", "chat", "help", "review", "notifications"].includes(item.key);
    }
    if (environmentFieldMode) {
      return ["dashboard", "tasks", "chat", "help", "review", "notifications"].includes(item.key);
    }
    if (repairFieldMode) {
      return ["dashboard", "fleet-repair", "chat", "help", "review", "notifications"].includes(item.key);
    }
    return !["data-download", "reports", "fleet-repair"].includes(item.key);
  });

  const shouldUseCompactManagerMenu = Boolean(
    !workerMode &&
      (executiveMode || departmentManagerMode || resolvedRole === "director" || resolvedRole === "general_manager"),
  );
  const compactDefaultItems: MenuItem[] = shouldUseCompactManagerMenu
    ? compactManagerMenuItems(defaultItems)
    : defaultItems;

  const garbageDepartmentItems: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: "Хяналтын самбар",
      icon: LayoutDashboard,
    },
    ...(canShowHrMenu
      ? [
          {
            key: "hr",
            href: "/hr",
            label: "Хүний нөөц",
            icon: Users,
          },
        ]
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
  ];

  const scopedDepartmentWorkHref =
    departmentItems[0]?.href ??
    (departmentScopeName ? `/projects?department=${encodeURIComponent(departmentScopeName)}` : "/projects");
  const scopedDepartmentIsAutoGarbage = Boolean(isAutoGarbageDepartment(departmentScopeName));
  const scopedDepartmentHeadItems: MenuItem[] = [
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
      ? [
          {
            key: "hr",
            href: "/hr",
            label: "Хэлтсийн хүний нөөц",
            icon: Users,
          },
        ]
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
    ...(canOpenCleaningAreas
      ? [
          {
            key: "cleaning-areas",
            href: "/cleaning-areas",
            label: "Цэвэрлэх талбай",
            icon: MapPin,
          },
        ]
      : []),
    ...(showReports
      ? [
          {
            key: "reports",
            href: "/reports",
            label: "Тайлан, статистик",
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
      key: "review",
      href: reviewHref,
      label: "Мэдэгдэл",
      icon: Bell,
      badge: notificationCount,
    },
  ];

  const inspectorWorkHref = `/projects?department=${encodeURIComponent(AUTO_GARBAGE_DEPARTMENT_NAME)}`;
  const inspectorNewWorkHref = `/projects/new?department=${encodeURIComponent(AUTO_GARBAGE_DEPARTMENT_NAME)}`;
  const transportInspectorItems: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: "Ажлын самбар",
      icon: LayoutDashboard,
    },
    {
      key: "auto-base",
      href: "/#my-vehicles",
      label: "Миний машин",
      icon: Truck,
    },
    {
      key: "projects",
      href: inspectorWorkHref,
      label: "Миний ажил",
      icon: ListChecks,
    },
    {
      key: "new-project",
      href: inspectorNewWorkHref,
      label: "Ажил нэмэх",
      icon: PlusCircle,
    },
    {
      key: "review",
      href: reviewHref,
      label: "Мэдэгдэл",
      icon: Bell,
      badge: notificationCount,
    },
  ];

  const items = (transportInspectorMode
    ? transportInspectorItems
    : departmentHrFocusedMode
      ? departmentHrItems
    : scopedDepartmentHeadMode
      ? scopedDepartmentHeadItems
      : isGarbageDepartmentHead
      ? garbageDepartmentItems
      : compactDefaultItems
  ).filter((item) => !isHiddenMenuItem(item));

  function isProcurementChildActive(item: MenuItem) {
    const state = searchParams.get("state");
    const panel = searchParams.get("panel");
    const relation = searchParams.get("relation");
    const procurementDetailActive =
      pathname.startsWith("/procurement/") &&
      !["/procurement/dashboard", "/procurement/new", "/procurement/assigned", "/procurement/suppliers"].some((path) =>
        pathname.startsWith(path),
      );

    switch (item.key) {
      case "procurement-dashboard":
        return pathname === "/procurement/dashboard";
      case "procurement-list":
        return pathname === "/procurement" && !state && !panel && !relation ? true : procurementDetailActive;
      case "procurement-projects":
        return pathname === "/procurement" && relation === "project";
      case "procurement-vehicles":
        return pathname === "/procurement" && relation === "vehicle";
      case "procurement-new":
        return pathname === "/procurement/new";
      case "procurement-quotes":
        return (
          pathname === "/procurement" &&
          (state === "quotation_waiting" || state === "quotations_ready" || searchParams.get("flow") === "quotes")
        );
      case "procurement-suppliers":
        return pathname === "/procurement/suppliers" || (pathname === "/procurement" && panel === "suppliers");
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
    if (item.key === "procurement") {
      return active === "procurement" || pathname === "/procurement" || pathname.startsWith("/procurement/");
    }
    if (item.key.startsWith("procurement-")) {
      return isProcurementChildActive(item);
    }
    if (item.children?.some((child) => isItemActive(child))) {
      return true;
    }
    if (item.key === "hr-dashboard") {
      return pathname === "/hr";
    }
    if (item.key === "hr-new-employee") {
      return pathname === "/hr/employees/new";
    }
    if (item.key === "hr-employees") {
      return pathname.startsWith("/hr/employees") && pathname !== "/hr/employees/new";
    }
    if (item.key === "hr-notifications") {
      return pathname === "/hr/leaves" && searchParams.get("state") === "pending";
    }
    if (item.key === "hr-requests") {
      return pathname === "/hr/leaves" && searchParams.get("state") !== "pending";
    }
    if (item.key.startsWith("hr-")) {
      const itemPath = item.href.split("?")[0];
      return itemPath === "/hr" ? pathname === "/hr" : pathname.startsWith(itemPath);
    }
    if (item.key === active) {
      return true;
    }
    if (item.key === "review" && active === "field") {
      return true;
    }
    if (item.key === "review" && active === "notifications") {
      return true;
    }
    if (item.key === "projects" && active === "tasks") {
      return true;
    }
    if (active === "auto-base" && item.departmentName?.includes("Авто")) {
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
  const isDepartmentHeadProcurementContext = Boolean(
    isProcurementDepartmentHeadMenu && (pathname === "/procurement" || pathname.startsWith("/procurement/")),
  );
  const canUseMobilePrimaryAction = Boolean(canCreateProject || canCreateTasks || canWriteReports);
  const mobilePrimaryAction: MenuItem | null = canUseMobilePrimaryAction
    ? {
        key: "new-project",
        href: canCreateProject || canCreateTasks ? "/create" : "/create/report",
        label: canCreateProject || canCreateTasks ? "Шинэ ажил" : "Тайлан",
        icon: PlusCircle,
      }
    : null;
  const withMobilePrimaryAction = (dockItems: MenuItem[]) => {
    if (!mobilePrimaryAction || dockItems.some((item) => item.key === mobilePrimaryAction.key)) {
      return dockItems;
    }

    const preferredItems = dockItems.filter((item) => !["chat", "field"].includes(item.key));
    const baseItems = preferredItems.length >= 4 ? preferredItems : dockItems;
    return [
      ...baseItems.slice(0, 2),
      mobilePrimaryAction,
      ...baseItems.slice(2),
    ];
  };
  const rawMobileDockItems: MenuItem[] = isDepartmentHeadProcurementContext
    ? [
        { key: "procurement-dashboard", href: "/procurement/dashboard", label: "Самбар", icon: LayoutDashboard },
        { key: "procurement-list", href: "/procurement", label: "Бүх хүсэлт", icon: ShoppingCart },
        { key: "procurement-new", href: "/procurement/new", label: "Шинэ хүсэлт", icon: PlusCircle },
        { key: "procurement-projects", href: "/procurement?relation=project", label: "Төслийн", icon: ListChecks },
        { key: "procurement-vehicles", href: "/procurement?relation=vehicle", label: "Авто/засвар", icon: Truck },
      ]
    : transportInspectorMode
    ? [
        { key: "dashboard", href: "/", label: "Самбар", icon: LayoutDashboard },
        {
          key: "projects",
          href: inspectorWorkHref,
          label: "Ажил",
          icon: ListChecks,
        },
        {
          key: "new-project",
          href: inspectorNewWorkHref,
          label: "Нэмэх",
          icon: PlusCircle,
        },
        { key: "review", href: reviewHref, label: "Мэдэгдэл", icon: Bell, badge: notificationCount },
        { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
      ]
    : isGarbageDepartmentHead
    ? [
        { key: "dashboard", href: "/", label: "Самбар", icon: LayoutDashboard },
        {
          key: "projects",
          href: departmentItems[0]?.href ?? "/projects",
          label: "Ажил",
          icon: ListChecks,
        },
        { key: "reports", href: "/reports", label: "Тайлан", icon: BarChart3 },
        {
          key: "garbage-settings",
          href: "/settings/garbage-transport",
          label: "Тохиргоо",
          icon: Settings,
        },
      ]
    : departmentHrFocusedMode
      ? [
          { key: "hr-dashboard", href: "/hr", label: "HR", icon: Users },
          { key: "hr-employees", href: "/hr/employees", label: "Ажилтнууд", icon: Users },
          { key: "hr-sick", href: "/hr/sick", label: "Чөлөө", icon: HeartPulse },
          { key: "hr-reports", href: "/hr/reports", label: "Тайлан", icon: FileText },
          { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
        ]
    : hrFocusedMode
      ? [
          { key: "hr", href: "/hr", label: "Хүний нөөц", icon: Users },
          ...(mobilePrimaryAction ? [mobilePrimaryAction] : []),
          { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
        ]
      : procurementWorkerMode
        ? [
            { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard, hardNavigate: true },
            { key: "procurement-suppliers", href: "/procurement/suppliers", label: "Нийлүүлэгчид", icon: Users },
            { key: "procurement-assigned", href: "/procurement/assigned", label: "Х.Авалтууд", icon: ShoppingCart },
            { key: "review", href: "/notifications", label: "Мэдэгдэл", icon: Bell, badge: notificationCount },
            { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
          ]
      : workerMode
      ? mfoFieldMode
        ? [
            { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard, hardNavigate: true },
            { key: "tasks", href: "/tasks", label: "Ажил", icon: ListChecks },
            { key: "chat", href: "/chat", label: "Чат", icon: MessageSquare },
            { key: "review", href: "/notifications", label: "Мэдэгдэл", icon: Bell, badge: notificationCount },
            { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
          ]
        : environmentFieldMode
          ? [
              { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard, hardNavigate: true },
              { key: "tasks", href: "/tasks", label: "Ажил", icon: ListChecks },
              { key: "chat", href: "/chat", label: "Чат", icon: MessageSquare },
              { key: "review", href: "/notifications", label: "Мэдэгдэл", icon: Bell, badge: notificationCount },
              { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
            ]
          : repairFieldMode
            ? [
                { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard, hardNavigate: true },
                { key: "fleet-repair", href: "/fleet-repair/requests", label: "Засвар", icon: Wrench },
                { key: "chat", href: "/chat", label: "Чат", icon: MessageSquare },
                { key: "review", href: "/notifications", label: "Мэдэгдэл", icon: Bell, badge: notificationCount },
                { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
              ]
            : [
                { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard, hardNavigate: true },
                { key: "tasks", href: "/tasks", label: "Ажил", icon: ListChecks },
                { key: "chat", href: "/chat", label: "Чат", icon: MessageSquare },
                { key: "review", href: reviewHref, label: "Мэдэгдэл", icon: Bell, badge: notificationCount },
                { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
              ]
      : [
          ...(shouldUseCompactManagerMenu
            ? [
                { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard },
                { key: "projects", href: "/projects", label: "Ажлууд", icon: ListChecks },
                ...(mobilePrimaryAction ? [mobilePrimaryAction] : []),
                {
                  key: "review",
                  href: "/notifications",
                  label: "Хүсэлтүүд",
                  icon: ClipboardCheck,
                  badge: notificationCount,
                },
                { key: "reports", href: canWriteReports ? "/reports" : "/review", label: "Тайлан", icon: BarChart3 },
              ]
            : [
                { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard },
                { key: "projects", href: "/projects", label: "Ажлууд", icon: ListChecks },
                ...(mobilePrimaryAction ? [mobilePrimaryAction] : []),
                ...(showProcurement
                  ? [{ key: "procurement", href: "/procurement/dashboard", label: "Худалдан", icon: ShoppingCart }]
                  : []),
                { key: "reports", href: canWriteReports ? "/reports" : "/review", label: "Тайлан", icon: BarChart3 },
                canShowHrMenu
                  ? { key: "hr", href: "/hr", label: "HR", icon: Users }
                  : { key: "chat", href: "/chat", label: "Чат", icon: MessageSquare },
              ]),
        ];
  const mobileDockItems: MenuItem[] = (
    isDepartmentHeadProcurementContext || procurementWorkerMode ? rawMobileDockItems : withMobilePrimaryAction(rawMobileDockItems)
  ).filter((item) => !isHiddenMenuItem(item));
  const visibleMobileDockItems = mobileDockItems.slice(0, 5);

  const menuList = (
    <nav className={styles.menuList} aria-label="Үндсэн цэс">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = isItemActive(item);
        const hasChildren = Boolean(item.children?.length);
        const isExpanded = hasChildren && (isActive || expandedGroups[item.key]);

        if (hasChildren) {
          return (
            <div key={item.key} className={styles.menuGroup}>
              <button
                type="button"
                className={cn(styles.menuLink, styles.menuGroupButton, isActive && styles.menuLinkActive)}
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
                {item.badge ? <span className={styles.menuBadge}>{item.badge}</span> : null}
                <ChevronDown
                  aria-hidden
                  className={cn(styles.menuGroupChevron, isExpanded && styles.menuGroupChevronOpen)}
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
                        className={cn(styles.submenuLink, childActive && styles.submenuLinkActive)}
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
            {item.badge ? <span className={styles.menuBadge}>{item.badge}</span> : null}
          </MenuLink>
        );
      })}
    </nav>
  );

  return (
    <nav
      className={cn(styles.menuShell, workerMode && !procurementWorkerMode && styles.workerMenuShell)}
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
            priority
            unoptimized
          />
          <p>Хоггүй, эрүүл, аюулгүй эко орчинд, эрүүл ирээдүйн төлөө</p>
        </Link>

        <div className={styles.menuScroll}>{menuList}</div>

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
            <ChevronDown aria-hidden className={cn(isProfileMenuOpen && styles.profileChevronOpen)} />
          </button>
          {isProfileMenuOpen ? (
            <div id="account-menu" className={styles.profileMenu} role="menu">
              <Link href="/profile" role="menuitem" className={styles.profileMenuLink}>
                <Settings aria-hidden />
                <span>Тохиргоо</span>
              </Link>
              <form action="/auth/logout" method="post">
                <button type="submit" role="menuitem" className={styles.profileMenuLink}>
                  <LogOut aria-hidden />
                  <span>Гарах</span>
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </aside>

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
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Цэс хаах">
                <X aria-hidden />
              </button>
            </div>
            {menuList}
            <div className={styles.mobileSheetFooter}>
              <Link href="/profile" className={styles.mobileSheetProfile} onClick={() => setIsOpen(false)}>
                {profileAvatarContent}
                <span>
                  <strong>{userName}</strong>
                  <small>{roleLabel}</small>
                </span>
              </Link>
              <div className={styles.mobileSheetActions}>
                <Link href="/profile" className={styles.mobileSheetAction} onClick={() => setIsOpen(false)}>
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
        className={styles.mobileDock}
        style={{ "--mobile-dock-count": visibleMobileDockItems.length } as CSSProperties}
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
                  item.key === "procurement-new" ||
                  (procurementWorkerMode && item.key === "procurement-assigned")) &&
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
