"use client";

import { useState } from "react";

import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  FileText,
  Flag,
  LayoutDashboard,
  Leaf,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  PlusCircle,
  Route,
  Settings,
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
import type { RoleGroupFlags } from "@/lib/roles";
import { cn } from "@/lib/utils";

import { PendingLinkIndicator } from "./pending-link-indicator";
import styles from "./app-menu.module.css";

type MenuKey =
  | "dashboard"
  | "tasks"
  | "auto-base"
  | "fleet-repair"
  | "garbage-routes"
  | "hr"
  | "field"
  | "projects"
  | "procurement"
  | "profile"
  | "garbage-settings"
  | "review"
  | "notifications"
  | "quality"
  | "chat"
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
  canViewHr?: boolean;
  variant?: "default" | "executive";
  userName?: string;
  roleLabel?: string;
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
};

const HIDDEN_GLOBAL_MENU_KEYS = new Set([
  "fleet-repair",
  "complaints",
  "garbage-complaints",
  "data-download",
  "procurement",
]);

const HIDDEN_DEPARTMENT_MENU_NAMES = new Set([
  "Хүний нөөц",
  "Дотоод хяналт",
  "Иргэдийн санал, гомдол",
]);

function isHiddenDepartmentMenu(group: DepartmentGroupDefinition) {
  return HIDDEN_DEPARTMENT_MENU_NAMES.has(group.name);
}

function isHiddenMenuItem(item: MenuItem) {
  return HIDDEN_GLOBAL_MENU_KEYS.has(item.key);
}

function getInitials(userName: string) {
  const parts = userName
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "HT";
  }

  return parts.map((part) => part[0]).join("").toLocaleUpperCase("mn-MN");
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
      return "Тохиргоо";
    default:
      return "Цэс";
  }
}

export function AppMenu({
  active,
  canCreateProject = false,
  canCreateTasks = false,
  canWriteReports = false,
  canViewQualityCenter = false,
  canUseFieldConsole = false,
  canViewHr = false,
  variant = "default",
  userName = "Хэрэглэгч",
  roleLabel = "Систем",
  masterMode = false,
  workerMode = false,
  notificationCount = 0,
  departmentScopeName = null,
  groupFlags = null,
}: AppMenuProps) {
  void getDockLabel;
  void canViewQualityCenter;
  void variant;

  const [isOpen, setIsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const flags = groupFlags || {};
  const executiveMode =
    Boolean(flags.municipalDirector || flags.municipalManager || flags.fleetRepairCeo) ||
    roleLabel.toLocaleLowerCase("mn-MN").includes("\u0437\u0430\u0445\u0438\u0440\u0430\u043B") ||
    roleLabel.toLocaleLowerCase("mn-MN").includes("\u043C\u0435\u043D\u0435\u0436\u0435\u0440");
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
  const procurementMode = Boolean(
    flags.opsStorekeeper ||
      flags.fleetRepairPurchaser ||
      flags.fleetRepairFinance ||
      flags.fleetRepairAccounting ||
      flags.fleetRepairManager ||
      flags.fleetRepairCeo,
  );
  const complaintMode = Boolean(flags.complaintManager);
  const inspectorMode = Boolean(
    flags.mfoInspector || flags.municipalInspector || flags.greenMaster,
  );
  const departmentManagerMode = Boolean(
    flags.municipalDepartmentHead || environmentManagerMode || mfoManagerMode,
  );
  const showFleetRepair = repairMode || mfoManagerMode || executiveMode;
  const showProcurement = procurementMode || executiveMode || flags.municipalDepartmentHead;
  const showReports =
    canWriteReports || executiveMode || departmentManagerMode || inspectorMode || canViewQualityCenter;
  const baseCanCreate = !workerMode && (canCreateProject || canCreateTasks || canWriteReports);
  const reviewHref = workerMode && canUseFieldConsole ? "/field" : "/notifications";
  const roleLabelLower = roleLabel.toLocaleLowerCase("mn-MN");
  const roleLooksHr = roleLabelLower.includes("\u0445\u04AF\u043D\u0438\u0439 \u043D\u04E9\u04E9\u0446");
  const roleLooksDepartmentHead = roleLabelLower.includes("\u0445\u044D\u043B\u0442\u0441\u0438\u0439\u043D \u0434\u0430\u0440\u0433\u0430");
  const hasHrGroupAccess = Boolean(flags.hrUser || flags.hrManager || flags.municipalHr);
  const hrFocusedMode =
    roleLooksHr || Boolean(hasHrGroupAccess && canViewHr && !departmentManagerMode && !roleLooksDepartmentHead);
  const isGarbageDepartmentHead =
    !workerMode &&
    !masterMode &&
    Boolean(departmentScopeName) &&
    isAutoGarbageDepartment(departmentScopeName) &&
    canCreateProject &&
    canCreateTasks;
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

  const hrItems: MenuItem[] = canViewHr || flags.hrUser || flags.hrManager || flags.municipalHr || roleLooksHr
    ? [
        { key: "hr", href: "/hr", label: "\u0425\u04AF\u043D\u0438\u0439 \u043D\u04E9\u04E9\u0446", icon: Users },
      ]
    : [];

  const roleFocusedItems: MenuItem[] = [
    ...(mfoFieldMode || mfoManagerMode
      ? [
          {
            key: workerMode ? "tasks" : "garbage-routes",
            href: workerMode ? "/tasks" : "/garbage-routes",
            label: workerMode ? "Өнөөдрийн ажил" : "\u0425\u043E\u0433 \u0442\u044D\u044D\u0432\u0440\u0438\u0439\u043D \u043C\u0430\u0440\u0448\u0440\u0443\u0442",
            icon: workerMode ? ListChecks : Route,
          },
        ]
      : []),
    ...(environmentMode
      ? [
          {
            key: "environment-work",
            href: "/projects?department=%D0%9D%D0%BE%D0%B3%D0%BE%D0%BE%D0%BD%20%D0%B1%D0%B0%D0%B9%D0%B3%D1%83%D1%83%D0%BB%D0%B0%D0%BC%D0%B6%2C%20%D1%86%D1%8D%D0%B2%D1%8D%D1%80%D0%BB%D1%8D%D0%B3%D1%8D%D1%8D%20%D2%AF%D0%B9%D0%BB%D1%87%D0%B8%D0%BB%D0%B3%D1%8D%D1%8D%D0%BD%D0%B8%D0%B9%20%D1%85%D1%8D%D0%BB%D1%82%D1%8D%D1%81",
            label: "\u041D\u043E\u0433\u043E\u043E\u043D \u0431\u0430\u0439\u0433\u0443\u0443\u043B\u0430\u043C\u0436, \u0442\u043E\u0445\u0438\u0436\u0438\u043B\u0442",
            icon: Leaf,
          },
        ]
      : []),
    ...(repairMode
      ? [
          {
            key: "fleet-repair",
            href: "/fleet-repair/requests",
            label: "\u0417\u0430\u0441\u0432\u0430\u0440\u044B\u043D \u0445\u04AF\u0441\u044D\u043B\u0442",
            icon: Wrench,
          },
        ]
      : []),
    ...(complaintMode
      ? [
          {
            key: "complaints",
            href: "/settings/garbage-transport#complaints",
            label: "\u0418\u0440\u0433\u044D\u0434\u0438\u0439\u043D \u0441\u0430\u043D\u0430\u043B, \u0433\u043E\u043C\u0434\u043E\u043B",
            icon: MessageSquare,
          },
        ]
      : []),
  ];

  const defaultItems: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: "Хяналтын самбар",
      icon: LayoutDashboard,
    },
    ...hrItems,
    ...roleFocusedItems,
    ...departmentItems,
    ...(showFleetRepair && !roleFocusedItems.some((item) => item.key === "fleet-repair")
      ? [
          {
            key: "fleet-repair",
            href: "/fleet-repair/requests",
            label: "\u0417\u0430\u0441\u0432\u0430\u0440\u044B\u043D \u0445\u04AF\u0441\u044D\u043B\u0442",
            icon: Wrench,
          },
        ]
      : []),
    ...(!workerMode
      ? [
          {
            key: "tasks",
            href: "/tasks?view=today",
            label: "\u041A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C",
            icon: CalendarDays,
          },
        ]
      : []),
    {
      key: "data-download",
      href: "/data-download",
      label: "\u0411\u0430\u0440\u0438\u043C\u0442 \u0431\u0438\u0447\u0438\u0433",
      icon: FileText,
    },
    ...(showReports
      ? [
          {
            key: "reports",
            href: canWriteReports ? "/reports" : "/review",
            label: "\u0422\u0430\u0439\u043B\u0430\u043D, \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A",
            icon: BarChart3,
          },
        ]
      : []),
    ...(showProcurement
      ? [
          {
            key: "procurement",
            href: "/procurement/dashboard",
            label: "\u0425\u0443\u0434\u0430\u043B\u0434\u0430\u043D \u0430\u0432\u0430\u043B\u0442",
            icon: FileText,
          },
        ]
      : []),
    {
      key: "chat",
      href: "/chat",
      label: "\u0427\u0430\u0442",
      icon: MessageSquare,
    },
    {
      key: "review",
      href: reviewHref,
      label: "\u041C\u044D\u0434\u044D\u0433\u0434\u044D\u043B",
      icon: Bell,
      badge: notificationCount,
    },
  ].filter((item) => {
    if (isHiddenMenuItem(item)) {
      return false;
    }
    if (hrFocusedMode) {
      return ["hr", "profile"].includes(item.key);
    }
    if (!workerMode) {
      return true;
    }
    if (item.key.startsWith("hr")) {
      return false;
    }
    if (item.key === "field") {
      return false;
    }
    if (mfoFieldMode) {
      return ["dashboard", "tasks", "chat", "review", "notifications"].includes(item.key);
    }
    if (environmentFieldMode) {
      return ["dashboard", "environment-work", "chat", "review", "notifications"].includes(item.key);
    }
    if (repairFieldMode) {
      return ["dashboard", "fleet-repair", "chat", "review", "notifications"].includes(item.key);
    }
    return !["data-download", "reports", "procurement", "fleet-repair"].includes(item.key);
  });

  const garbageDepartmentItems: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: "Хяналтын самбар",
      icon: LayoutDashboard,
    },
    ...(canViewHr || flags.hrUser || flags.hrManager || flags.municipalHr
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
      key: "tasks",
      href: "/tasks?view=today",
      label: "Ажлын даалгавар",
      icon: CalendarDays,
    },
    {
      key: "garbage-teams",
      href: "/settings/garbage-transport#teams",
      label: "Багууд",
      icon: Users,
    },
    {
      key: "garbage-vehicles",
      href: "/fleet-repair/dashboard",
      label: "Машинууд",
      icon: Truck,
    },
    {
      key: "garbage-routes",
      href: "/garbage-routes",
      label: "Хог тээврийн маршрут",
      icon: Route,
    },
    {
      key: "garbage-route-settings",
      href: "/settings/garbage-transport#routes",
      label: "Маршрут",
      icon: Flag,
    },
    {
      key: "garbage-points",
      href: "/settings/garbage-transport#points",
      label: "Хогийн цэгүүд",
      icon: MapPin,
    },
    {
      key: "reports",
      href: "/reports",
      label: "Тайлан",
      icon: BarChart3,
    },
    {
      key: "garbage-complaints",
      href: "/settings/garbage-transport#complaints",
      label: "Гомдол",
      icon: MessageSquare,
    },
    {
      key: "garbage-settings",
      href: "/settings/garbage-transport",
      label: "Хог тээвэрлэлтийн тохиргоо",
      icon: Settings,
    },
  ];

  const items = (isGarbageDepartmentHead ? garbageDepartmentItems : defaultItems).filter(
    (item) => !isHiddenMenuItem(item),
  );

  function isItemActive(item: MenuItem) {
    if (item.key === active) {
      return true;
    }
    if (item.key === "review" && active === "field") {
      return true;
    }
    if (item.key === "review" && active === "notifications") {
      return true;
    }
    if (active === "auto-base" && item.departmentName?.includes("Авто")) {
      return true;
    }
    if (active === "fleet-repair" && item.key === "garbage-vehicles") {
      return true;
    }
    return false;
  }

  const activeItem = items.find(isItemActive) ?? items[0];
  const mobileDockItems: MenuItem[] = (isGarbageDepartmentHead
    ? [
        { key: "dashboard", href: "/", label: "Самбар", icon: LayoutDashboard },
        {
          key: "projects",
          href: departmentItems[0]?.href ?? "/projects",
          label: "Ажил",
          icon: ListChecks,
        },
        { key: "tasks", href: "/tasks?view=today", label: "Даалгавар", icon: CalendarDays },
        { key: "garbage-routes", href: "/garbage-routes/today", label: "Маршрут", icon: Route },
        { key: "reports", href: "/reports", label: "Тайлан", icon: BarChart3 },
        {
          key: "garbage-settings",
          href: "/settings/garbage-transport",
          label: "Тохиргоо",
          icon: Settings,
        },
      ]
    : hrFocusedMode
      ? [
          { key: "hr", href: "/hr", label: "HR", icon: Users },
          { key: "profile", href: "/profile", label: "Профайл", icon: Settings },
        ]
      : workerMode
      ? mfoFieldMode
        ? [
            { key: "dashboard", href: "/", label: "\u041D\u04AF\u04AF\u0440", icon: LayoutDashboard },
            { key: "tasks", href: "/tasks", label: "Ажил", icon: ListChecks },
            { key: "chat", href: "/chat", label: "\u0427\u0430\u0442", icon: MessageSquare },
            { key: "review", href: "/notifications", label: "\u041C\u044D\u0434\u044D\u0433\u0434\u044D\u043B", icon: Bell, badge: notificationCount },
            { key: "profile", href: "/profile", label: "\u041F\u0440\u043E\u0444\u0430\u0439\u043B", icon: Settings },
          ]
        : environmentFieldMode
          ? [
              { key: "dashboard", href: "/", label: "\u041D\u04AF\u04AF\u0440", icon: LayoutDashboard },
              {
                key: "environment-work",
                href: "/projects?department=%D0%9D%D0%BE%D0%B3%D0%BE%D0%BE%D0%BD%20%D0%B1%D0%B0%D0%B9%D0%B3%D1%83%D1%83%D0%BB%D0%B0%D0%BC%D0%B6%2C%20%D1%86%D1%8D%D0%B2%D1%8D%D1%80%D0%BB%D1%8D%D0%B3%D1%8D%D1%8D%20%D2%AF%D0%B9%D0%BB%D1%87%D0%B8%D0%BB%D0%B3%D1%8D%D1%8D%D0%BD%D0%B8%D0%B9%20%D1%85%D1%8D%D0%BB%D1%82%D1%8D%D1%81",
                label: "\u0410\u0436\u0438\u043B",
                icon: Leaf,
              },
              { key: "chat", href: "/chat", label: "\u0427\u0430\u0442", icon: MessageSquare },
              { key: "review", href: "/notifications", label: "\u041C\u044D\u0434\u044D\u0433\u0434\u044D\u043B", icon: Bell, badge: notificationCount },
              { key: "profile", href: "/profile", label: "\u041F\u0440\u043E\u0444\u0430\u0439\u043B", icon: Settings },
            ]
          : repairFieldMode
            ? [
                { key: "dashboard", href: "/", label: "\u041D\u04AF\u04AF\u0440", icon: LayoutDashboard },
                { key: "fleet-repair", href: "/fleet-repair/requests", label: "\u0417\u0430\u0441\u0432\u0430\u0440", icon: Wrench },
                { key: "chat", href: "/chat", label: "\u0427\u0430\u0442", icon: MessageSquare },
                { key: "review", href: "/notifications", label: "\u041C\u044D\u0434\u044D\u0433\u0434\u044D\u043B", icon: Bell, badge: notificationCount },
                { key: "profile", href: "/profile", label: "\u041F\u0440\u043E\u0444\u0430\u0439\u043B", icon: Settings },
              ]
            : [
                { key: "dashboard", href: "/", label: "\u041D\u04AF\u04AF\u0440", icon: LayoutDashboard },
                {
                  key: "projects",
                  href: departmentItems[0]?.href ?? "/projects",
                  label: "\u0410\u0436\u043B\u0443\u0443\u0434",
                  icon: ListChecks,
                },
                { key: "chat", href: "/chat", label: "\u0427\u0430\u0442", icon: MessageSquare },
                { key: "review", href: reviewHref, label: "\u041C\u044D\u0434\u044D\u0433\u0434\u044D\u043B", icon: Bell, badge: notificationCount },
              ]
      : [
          { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard },
          { key: "projects", href: "/projects", label: "Ажлууд", icon: ListChecks },
          { key: "new-project", href: "/create", label: "Шинэ ажил", icon: PlusCircle },
          { key: "reports", href: canWriteReports ? "/reports" : "/review", label: "Тайлан", icon: BarChart3 },
          canViewHr
            ? { key: "hr", href: "/hr", label: "HR", icon: Users }
            : { key: "chat", href: "/chat", label: "Чат", icon: MessageSquare },
        ]).filter((item) => !isHiddenMenuItem(item));

  const menuList = (
    <nav className={styles.menuList} aria-label="Үндсэн цэс">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = isItemActive(item);

        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(styles.menuLink, isActive && styles.menuLinkActive)}
            aria-current={isActive ? "page" : undefined}
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
          </Link>
        );
      })}
    </nav>
  );

  return (
    <nav
      className={cn(styles.menuShell, workerMode && styles.workerMenuShell)}
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
            <span className={styles.profileAvatar} aria-hidden>
              {getInitials(userName)}
            </span>
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
              <Link href="/auth/logout" role="menuitem" className={styles.profileMenuLink}>
                <LogOut aria-hidden />
                <span>Гарах</span>
              </Link>
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
          href="/profile"
          className={styles.mobileProfile}
        >
          {getInitials(userName)}
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
          </aside>
        </>
      ) : null}

      <div className={styles.mobileDock} aria-label="Хурдан цэс">
        {mobileDockItems.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item);

          return (
            <Link
              key={`dock-${item.key}`}
              href={item.href}
              className={cn(
                styles.dockLink,
                item.key === "new-project" && styles.dockLinkCreate,
                isActive && styles.dockLinkActive,
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon aria-hidden />
              <span>{item.label}</span>
              <PendingLinkIndicator
                className={styles.dockLoadingHint}
                overlayClassName={styles.linkLoadingOverlay}
                label="..."
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
