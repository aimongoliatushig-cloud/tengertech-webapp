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
  Menu,
  MessageSquare,
  PlusCircle,
  Settings,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { DEPARTMENT_GROUPS, type DepartmentGroupDefinition } from "@/lib/department-groups";
import { cn } from "@/lib/utils";

import styles from "./app-menu.module.css";

type MenuKey =
  | "dashboard"
  | "tasks"
  | "auto-base"
  | "hr"
  | "field"
  | "projects"
  | "procurement"
  | "profile"
  | "review"
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
}: AppMenuProps) {
  void canViewQualityCenter;
  void variant;
  void masterMode;
  void workerMode;

  const [isOpen, setIsOpen] = useState(false);
  const canCreate = canCreateProject || canCreateTasks || canWriteReports;
  const reviewHref = canUseFieldConsole ? "/field" : "/review";

  const departmentItems: MenuItem[] = DEPARTMENT_GROUPS.map((group, index) => ({
    key: `department-${index}`,
    href: `/projects?department=${encodeURIComponent(group.name)}`,
    label: group.name,
    icon: getDepartmentMenuIcon(group),
    departmentName: group.name,
  }));

  const items: MenuItem[] = [
    {
      key: "dashboard",
      href: "/",
      label: "Ажлын самбар",
      icon: LayoutDashboard,
    },
    ...departmentItems,
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
  ];

  function isItemActive(item: MenuItem) {
    if (item.key === active) {
      return true;
    }
    if (item.key === "review" && active === "field") {
      return true;
    }
    if (active === "auto-base" && item.departmentName?.includes("Авто")) {
      return true;
    }
    return false;
  }

  const activeItem = items.find(isItemActive) ?? items[0];
  const mobileDockItems = [
    items.find((item) => item.key === "dashboard"),
    items.find((item) => item.key === "tasks"),
    items.find((item) => item.key === "chat"),
    items.find((item) => item.key === "review"),
    items.find((item) => item.key === "profile"),
  ].filter((item): item is MenuItem => Boolean(item));

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
          <Link href="/create" className={styles.createButton}>
            <PlusCircle aria-hidden />
            <span>Шинэ ажил</span>
          </Link>
        ) : null}

        <Link href="/profile" className={styles.profileCard}>
          <span className={styles.profileAvatar} aria-hidden>
            {getInitials(userName)}
          </span>
          <span className={styles.profileText}>
            <strong>{userName}</strong>
            <small>{roleLabel}</small>
          </span>
          <ChevronDown aria-hidden />
        </Link>
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

        <Link href="/profile" className={styles.mobileProfile}>
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
              className={cn(styles.dockLink, isActive && styles.dockLinkActive)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon aria-hidden />
              <span>{getDockLabel(item.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
