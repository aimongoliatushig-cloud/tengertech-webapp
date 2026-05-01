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
  UserCircle,
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
  variant?: "default" | "executive";
  userName?: string;
  roleLabel?: string;
  masterMode?: boolean;
  workerMode?: boolean;
  notificationCount?: number;
  departmentScopeName?: string | null;
};

type MenuItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  departmentName?: string;
};

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
  variant = "default",
  userName = "Хэрэглэгч",
  roleLabel = "Систем",
  masterMode = false,
  workerMode = false,
  notificationCount = 0,
  departmentScopeName = null,
}: AppMenuProps) {
  void getDockLabel;
  void canViewQualityCenter;
  void variant;

  const [isOpen, setIsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const baseCanCreate = !workerMode && (canCreateProject || canCreateTasks || canWriteReports);
  const reviewHref = workerMode && canUseFieldConsole ? "/field" : "/notifications";
  const isGarbageDepartmentHead =
    !workerMode &&
    !masterMode &&
    Boolean(departmentScopeName) &&
    isAutoGarbageDepartment(departmentScopeName) &&
    canCreateProject &&
    canCreateTasks;
  const canCreate = baseCanCreate && !isGarbageDepartmentHead;

  const visibleDepartmentGroups = departmentScopeName
    ? DEPARTMENT_GROUPS.filter((group) => {
        const scopedGroup =
          findDepartmentGroupByName(departmentScopeName) ??
          findDepartmentGroupByUnit(departmentScopeName);
        return scopedGroup
          ? group.name === scopedGroup.name
          : matchesDepartmentGroup(group, departmentScopeName);
      })
    : DEPARTMENT_GROUPS;

  const departmentItems: MenuItem[] = visibleDepartmentGroups.map((group, index) => ({
    key: `department-${index}`,
    href: `/projects?department=${encodeURIComponent(group.name)}`,
    label: group.name,
    icon: getDepartmentMenuIcon(group),
    departmentName: group.name,
  }));

  const defaultItems: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: "Ажлын самбар",
      icon: LayoutDashboard,
    },
    ...departmentItems,
    {
      key: "fleet-repair",
      href: "/fleet-repair/requests",
      label: "Засварын хүсэлт",
      icon: Wrench,
    },
    {
      key: "hr",
      href: "/hr",
      label: "Хүний нөөц",
      icon: Users,
    },
    {
      key: "tasks",
      href: "/tasks?view=today",
      label: "Календарь",
      icon: CalendarDays,
    },
    {
      key: "data-download",
      href: "/data-download",
      label: "Баримт бичиг",
      icon: FileText,
    },
    {
      key: "reports",
      href: canWriteReports ? "/reports" : "/review",
      label: "Тайлан, статистик",
      icon: BarChart3,
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
      label: "Тохиргоо",
      icon: Settings,
    },
  ].filter((item) => {
    if (!workerMode) {
      return true;
    }
    return !["hr", "data-download", "reports", "chat"].includes(item.key);
  });

  const garbageDepartmentItems: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: "Хяналтын самбар",
      icon: LayoutDashboard,
    },
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

  const items = isGarbageDepartmentHead ? garbageDepartmentItems : defaultItems;

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
  const mobileDockItems: MenuItem[] = isGarbageDepartmentHead
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
    : workerMode
      ? [
          { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard },
          {
            key: "projects",
            href: departmentItems[0]?.href ?? "/projects",
            label: "Ажлууд",
            icon: ListChecks,
          },
          { key: "review", href: reviewHref, label: "Мэдэгдэл", icon: Bell, badge: notificationCount },
          { key: "profile", href: "/profile", label: "Тохиргоо", icon: Settings },
        ]
      : [
          { key: "dashboard", href: "/", label: "Нүүр", icon: LayoutDashboard },
          { key: "projects", href: "/projects", label: "Ажлууд", icon: ListChecks },
          { key: "new-project", href: "/create", label: "Шинэ ажил", icon: PlusCircle },
          { key: "reports", href: canWriteReports ? "/reports" : "/review", label: "Тайлан", icon: BarChart3 },
          { key: "hr", href: "/hr", label: "Миний баг", icon: Users },
        ];

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
    <nav className={styles.menuShell} aria-label="Ажлын орчны цэс">
      <aside className={styles.menuBar}>
        <Link href="/" className={styles.brandBlock}>
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
                <UserCircle aria-hidden />
                <span>Профайл</span>
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
          href={isGarbageDepartmentHead ? "/settings/garbage-transport" : "/profile"}
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
