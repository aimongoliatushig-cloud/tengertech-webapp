"use client";

import { useState } from "react";

import Image from "next/image";
import Link from "next/link";

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
  | "new-project"
  | "reports"
  | "data-download";

type IconName =
  | "dashboard"
  | "tasks"
  | "field"
  | "projects"
  | "procurement"
  | "review"
  | "reports"
  | "download"
  | "garage"
  | "team"
  | "menu"
  | "plus"
  | "profile"
  | "more";

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
};

type MenuItem = {
  key: MenuKey;
  href: string;
  label: string;
  note: string;
  icon: IconName;
};

type QuickAction = {
  key: "project" | "task" | "report";
  href: string;
  label: string;
  note: string;
  icon: IconName;
};

function MenuIcon({
  icon,
  className,
}: {
  icon: IconName;
  className?: string;
}) {
  switch (icon) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M4.5 10.2L12 4.5L19.5 10.2V18.2C19.5 19.0284 18.8284 19.7 18 19.7H6C5.17157 19.7 4.5 19.0284 4.5 18.2V10.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9.2 19.7V13.3H14.8V19.7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "tasks":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M9 7H19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M9 12H19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M9 17H19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="5.4" cy="7" r="1.4" fill="currentColor" />
          <circle cx="5.4" cy="12" r="1.4" fill="currentColor" />
          <circle cx="5.4" cy="17" r="1.4" fill="currentColor" />
        </svg>
      );
    case "field":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M12 20C15.6 16.3 17.4 13.5 17.4 10.8C17.4 7.6 15 5.2 12 5.2C9 5.2 6.6 7.6 6.6 10.8C6.6 13.5 8.4 16.3 12 20Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10.6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "projects":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M4.8 8.3C4.8 7.52753 5.42753 6.9 6.2 6.9H10.1L11.8 8.6H17.8C18.5725 8.6 19.2 9.22753 19.2 10V17.8C19.2 18.5725 18.5725 19.2 17.8 19.2H6.2C5.42753 19.2 4.8 18.5725 4.8 17.8V8.3Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "procurement":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M7.2 9.2H16.8L16.2 18.2C16.1478 18.9828 15.4973 19.59 14.7128 19.59H9.28718C8.50268 19.59 7.85218 18.9828 7.8 18.2L7.2 9.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9.6 9.2V7.8C9.6 6.47452 10.6745 5.4 12 5.4C13.3255 5.4 14.4 6.47452 14.4 7.8V9.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "review":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M12 4.9L18.2 7.3V11.8C18.2 15.9 15.7 18.8 12 20.1C8.3 18.8 5.8 15.9 5.8 11.8V7.3L12 4.9Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9.6 12.1L11.2 13.7L14.8 10.1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "reports":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M8.1 5.4H13.5L17.7 9.6V18.1C17.7 18.8732 17.0732 19.5 16.3 19.5H8.1C7.3268 19.5 6.7 18.8732 6.7 18.1V6.8C6.7 6.0268 7.3268 5.4 8.1 5.4Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M13.5 5.6V9.6H17.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9.4 12.6H14.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M9.4 15.8H14.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "download":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M12 5.2V14.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M8.6 11.8L12 15.2L15.4 11.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 18.2H18.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "garage":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M4.8 10.4L12 5L19.2 10.4V18.4C19.2 18.9523 18.7523 19.4 18.2 19.4H5.8C5.24772 19.4 4.8 18.9523 4.8 18.4V10.4Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9.4 19.4V13.5H14.6V19.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "team":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M9.2 11C10.7464 11 12 9.7464 12 8.2C12 6.6536 10.7464 5.4 9.2 5.4C7.6536 5.4 6.4 6.6536 6.4 8.2C6.4 9.7464 7.6536 11 9.2 11Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M15.8 10.2C17.0144 10.2 18 9.21442 18 8C18 6.78558 17.0144 5.8 15.8 5.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M4.9 18.6C5.7 15.9 7.9 14.5 10.2 14.5C12.5 14.5 14.7 15.9 15.5 18.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M16 14.8C17.7 15.1 19 16.3 19.6 18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "menu":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M5 7.5H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 16.5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M12 6.4V17.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6.4 12H17.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path
            d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 19.5C6.9 16.9 9.1 15.5 12 15.5C14.9 15.5 17.1 16.9 18.5 19.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "more":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <circle cx="6.5" cy="12" r="1.7" fill="currentColor" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" />
          <circle cx="17.5" cy="12" r="1.7" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

function getInitials(userName: string) {
  const parts = userName
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "ХТ";
  }

  return parts
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("mn-MN");
}

function getDockLabel(key: MenuKey) {
  switch (key) {
    case "dashboard":
      return "Нүүр";
    case "tasks":
      return "Ажил";
    case "projects":
      return "Төсөл";
    case "procurement":
      return "Авалт";
    case "reports":
      return "Тайлан";
    case "review":
      return "Хяналт";
    case "field":
      return "Маршрут";
    case "auto-base":
      return "Бааз";
    case "hr":
      return "ХН";
    case "quality":
      return "Чанар";
    case "data-download":
      return "Файл";
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
}: AppMenuProps) {
  void canViewQualityCenter;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const createHubHref = "/create";
  const autoBaseHref = "/auto-base";
  const profileHref = "/profile";
  const canOpenCreateHub = canCreateProject || canCreateTasks || canWriteReports;
  const canViewHrDirectory =
    roleLabel === "Үйл ажиллагаа хариуцсан менежер" ||
    roleLabel === "Захирал" ||
    roleLabel === "Системийн админ";
  const canViewAutoBaseShortcut = canViewHrDirectory;

  const items: MenuItem[] =
    variant === "executive"
      ? [
          {
            key: "dashboard",
            href: "/",
            label: "Хяналтын самбар",
            note: "Ерөнхий төлөв",
            icon: "dashboard",
          },
          {
            key: "tasks",
            href: "/tasks",
            label: "Өнөөдрийн ажил",
            note: "Ажилбарын жагсаалт",
            icon: "tasks",
          },
          {
            key: "procurement",
            href: "/procurement",
            label: "Худалдан авалт",
            note: "Хүсэлт ба шат",
            icon: "procurement",
          },
          ...(canViewAutoBaseShortcut
            ? [
                {
                  key: "auto-base",
                  href: autoBaseHref,
                  label: "Авто бааз",
                  note: "Машины төлөв",
                  icon: "garage",
                } satisfies MenuItem,
              ]
            : []),
          ...(canViewHrDirectory
            ? [
                {
                  key: "hr",
                  href: "/hr",
                  label: "Хүний нөөц",
                  note: "Ажилтны бүртгэл",
                  icon: "team",
                } satisfies MenuItem,
              ]
            : []),
          {
            key: "reports",
            href: "/reports",
            label: "Тайлан",
            note: "Хяналт ба тайлан",
            icon: "reports",
          },
        ]
      : workerMode
        ? [
            {
              key: "dashboard",
              href: "/",
              label: "Миний ажил",
              note: "Надад хамаарах ажил",
              icon: "dashboard",
            },
            ...(canUseFieldConsole
              ? [
                  {
                    key: "field",
                    href: "/field",
                    label: "Өнөөдрийн ажил",
                    note: "Тухайн өдрийн маршрут",
                    icon: "field",
                  } satisfies MenuItem,
                ]
              : []),
            {
              key: "tasks",
              href: "/tasks",
              label: "Ажилбар",
              note: "Надад оноогдсон жагсаалт",
              icon: "tasks",
            },
            {
              key: "procurement",
              href: "/procurement",
              label: "Худалдан авалт",
              note: "Надад хамаарах хүсэлт",
              icon: "procurement",
            },
          ]
        : masterMode
          ? [
              {
                key: "dashboard",
                href: "/",
                label: "Нэгжийн самбар",
                note: "Өнөөдрийн хураангуй",
                icon: "dashboard",
              },
              {
                key: "tasks",
                href: "/tasks",
                label: "Өнөөдрийн ажил",
                note: "Зөвхөн өнөөдөр харагдана",
                icon: "tasks",
              },
              {
                key: "new-project",
                href: createHubHref,
                label: "Ажил нэмэх",
                note: "Өөрийн нэгжийн ажил үүсгэх",
                icon: "plus",
              },
              {
                key: "procurement",
                href: "/procurement",
                label: "Худалдан авалт",
                note: "Нэгжийн хүсэлтүүд",
                icon: "procurement",
              },
              {
                key: "reports",
                href: "/reports",
                label: "Тайлан",
                note: "Илгээсэн тайлан",
                icon: "reports",
              },
            ]
          : [
              ...(canUseFieldConsole
                ? [
                    {
                      key: "field",
                      href: "/field",
                      label: "Өнөөдрийн маршрут",
                      note: "Талбайн ажил",
                      icon: "field",
                    } satisfies MenuItem,
                  ]
                : []),
              {
                key: "dashboard",
                href: "/",
                label: "Хяналтын самбар",
                note: "Нүүр хуудас",
                icon: "dashboard",
              },
              ...(canViewAutoBaseShortcut
                ? [
                    {
                      key: "auto-base",
                      href: autoBaseHref,
                      label: "Авто бааз",
                      note: "Машины төлөв",
                      icon: "garage",
                    } satisfies MenuItem,
                  ]
                : []),
              {
                key: "projects",
                href: "/projects",
                label: "Ажил",
                note: "Ажлын жагсаалт",
                icon: "projects",
              },
              {
                key: "procurement",
                href: "/procurement",
                label: "Худалдан авалт",
                note: "Хүсэлт ба явц",
                icon: "procurement",
              },
              {
                key: "review",
                href: "/review",
                label: "Хяналт",
                note: "Баталгаажуулалт",
                icon: "review",
              },
              ...(canViewHrDirectory
                ? [
                    {
                      key: "hr",
                      href: "/hr",
                      label: "Хүний нөөц",
                      note: "Бүх ажилтан",
                      icon: "team",
                    } satisfies MenuItem,
                  ]
                : []),
              ...(canCreateProject
                ? [
                    {
                      key: "new-project",
                      href: createHubHref,
                      label: "Шинэ ажил",
                      note: "Шууд үүсгэх",
                      icon: "plus",
                    } satisfies MenuItem,
                  ]
                : []),
              {
                key: "reports",
                href: "/reports",
                label: "Тайлан",
                note: "Өдрийн урсгал",
                icon: "reports",
              },
              {
                key: "data-download",
                href: "/data-download",
                label: "Өгөгдөл татах",
                note: "Файл ба тайлан",
                icon: "download",
              },
            ];

  const quickActions: QuickAction[] = [
    ...(canCreateProject
      ? [
          {
            key: "project",
            href: "/projects/new",
            label: "Ажил нэмэх",
            note: "Шинэ ажил, төсөл",
            icon: "plus",
          } satisfies QuickAction,
        ]
      : []),
    ...(canCreateTasks
      ? [
          {
            key: "task",
            href: "/projects?quickAction=task",
            label: "Ажилбар нэмэх",
            note: "Ажил сонгоод үргэлжлүүлнэ",
            icon: "tasks",
          } satisfies QuickAction,
        ]
      : []),
    ...(canWriteReports
      ? [
          {
            key: "report",
            href: "/create/report",
            label: "Тайлан оруулах",
            note: "Идэвхтэй ажлаас сонгоно",
            icon: "reports",
          } satisfies QuickAction,
        ]
      : []),
  ];

  const menuTitle =
    variant === "executive"
      ? "Ерөнхий цэс"
      : masterMode
        ? "Мастерын цэс"
        : "Ажлын цэс";
  const activeItem =
    items.find((item) => item.key === active) ??
    (active === "new-project" && canOpenCreateHub
      ? {
          key: "new-project",
          href: createHubHref,
          label: "Нэмэх",
          note: "Шинэ үйлдэл сонгох",
          icon: "plus",
        }
      : active === "profile"
        ? {
            key: "profile",
            href: profileHref,
            label: "Профайл",
            note: "Таны бүртгэл ба эрх",
            icon: "profile",
          }
      : items[0]);

  const homeItem = items.find((item) => item.key === "dashboard") ?? items[0] ?? null;
  const workItem =
    (workerMode
      ? items.find((item) => item.key === (active === "field" ? "field" : "tasks"))
      : masterMode
        ? items.find((item) => item.key === "tasks")
        : items.find((item) => item.key === "projects")) ??
    items.find((item) => item.key === "tasks") ??
    items.find((item) => item.key === "projects") ??
    items.find((item) => item.key === "field") ??
    null;
  const procurementItem = items.find((item) => item.key === "procurement") ?? null;
  const activeDockItem =
    activeItem?.key !== "new-project"
      ? items.find((item) => item.key === activeItem?.key) ?? null
      : null;

  const dockItems: MenuItem[] = [];
  for (const candidate of [homeItem, workItem, procurementItem, activeDockItem, ...items]) {
    if (!candidate || candidate.key === "new-project") {
      continue;
    }
    if (dockItems.some((item) => item.key === candidate.key)) {
      continue;
    }
    dockItems.push(candidate);
    if (dockItems.length === 4) {
      break;
    }
  }

  const mobileLeadingItems = dockItems.slice(0, 2);
  const mobileTrailingItems = dockItems.slice(2, 4);
  const mobileMenuLinks = items.filter((item) => item.key !== "new-project");
  const dockHasActiveShortcut = dockItems.some((item) => item.key === active);
  const menuUtilityActive =
    isMenuOpen || (!dockHasActiveShortcut && active !== "new-project" && active !== "profile");

  function closeMobileOverlays() {
    setIsMenuOpen(false);
  }

  function toggleMenu() {
    setIsMenuOpen((current) => !current);
  }

  return (
    <nav
      className={`${styles.menuShell} ${
        variant === "executive" ? styles.menuShellExecutive : ""
      }`}
      aria-label="Үндсэн цэс"
    >
      <aside
        className={`${styles.menuBar} ${
          variant === "executive" ? styles.menuBarExecutive : ""
        }`}
      >
        <div className={styles.menuHeader}>
          <div className={styles.menuBrand}>
            <div className={styles.menuBrandLogo}>
              <Image
                src="/logo.png"
                alt="Хот тохижилтын удирдлагын төв"
                width={112}
                height={36}
                className={styles.menuLogo}
                unoptimized
              />
            </div>
            <div className={styles.menuBrandText}>
              <span className={styles.menuKicker}>Навигаци</span>
              <strong>{menuTitle}</strong>
              <small>Нэг дэлгэц дээр нэг гол зорилго баримталсан цэс</small>
            </div>
          </div>

          <Link href={profileHref} className={`${styles.menuUserCard} ${styles.menuUserCardLink}`}>
            <div className={styles.menuUserAvatar} aria-hidden>
              {getInitials(userName)}
            </div>
            <div className={styles.menuUserBody}>
              <span>Нэвтэрсэн хэрэглэгч</span>
              <strong>{userName}</strong>
              <small>{roleLabel}</small>
            </div>
          </Link>
        </div>

        <div className={styles.menuScrollArea}>
          <div className={styles.menuInner}>
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`${styles.menuLink} ${active === item.key ? styles.menuLinkActive : ""}`}
                aria-current={active === item.key ? "page" : undefined}
              >
                <span className={styles.menuLinkIcon} aria-hidden>
                  <MenuIcon icon={item.icon} className={styles.menuIconSvg} />
                </span>
                <span className={styles.menuLinkBody}>
                  <span className={styles.menuLabel}>{item.label}</span>
                  <small className={styles.menuNote}>{item.note}</small>
                </span>
              </Link>
            ))}
          </div>

          {quickActions.length ? (
            <section className={styles.menuQuickPanel} aria-label="Товч үйлдэл">
              <div className={styles.menuQuickPanelHeader}>
                <span className={styles.menuKicker}>Товч үйлдэл</span>
                <strong>Нэмэх төв</strong>
              </div>

              <div className={styles.menuQuickGrid}>
                {quickActions.map((action) => (
                  <Link
                    key={action.key}
                    href={action.href}
                    className={styles.menuQuickActionCard}
                  >
                    <span className={styles.menuQuickActionIcon} aria-hidden>
                      <MenuIcon icon={action.icon} className={styles.menuIconSvg} />
                    </span>
                    <div>
                      <strong>{action.label}</strong>
                      <small>{action.note}</small>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className={styles.menuFooter}>
              <form action="/auth/logout" method="post">
            <button type="submit" className={styles.menuLogoutButton}>
              Гарах
            </button>
          </form>
        </div>
      </aside>

      {isMenuOpen ? (
        <>
          <button
            type="button"
            className={styles.menuMobileBackdrop}
            aria-label="Цэс хаах"
            onClick={closeMobileOverlays}
          />

          {isMenuOpen ? (
            <div className={styles.menuQuickSheet} role="dialog" aria-label="Хажуугийн цэс">
            <div className={styles.menuQuickSheetHeader}>
              <div>
                <span className={styles.menuKicker}>Дэлгэрэнгүй цэс</span>
                <strong>{activeItem?.label ?? menuTitle}</strong>
              </div>

              <button
                type="button"
                className={styles.menuQuickSheetClose}
                onClick={closeMobileOverlays}
              >
                Хаах
              </button>
            </div>

            <Link href={profileHref} className={styles.menuProfileCardLink} onClick={closeMobileOverlays}>
              <div className={styles.menuProfileCard}>
                <div className={styles.menuProfileAvatar} aria-hidden>
                  <MenuIcon icon="profile" className={styles.menuProfileAvatarSvg} />
                </div>
                <div className={styles.menuProfileBody}>
                  <span>Профайл</span>
                  <strong>{userName}</strong>
                  <small>{roleLabel}</small>
                </div>
              </div>
            </Link>

            {quickActions.length ? (
              <section className={styles.menuQuickPanel} aria-label="Товч үйлдэл">
                <div className={styles.menuQuickPanelHeader}>
                  <span className={styles.menuKicker}>Нэмэх төв</span>
                  <strong>Шууд эхлэх үйлдлүүд</strong>
                </div>

                <div className={styles.menuQuickGrid}>
                  {quickActions.map((action) => (
                    <Link
                      key={`sheet-${action.key}`}
                      href={action.href}
                      className={styles.menuQuickActionCard}
                      onClick={closeMobileOverlays}
                    >
                      <span className={styles.menuQuickActionIcon} aria-hidden>
                        <MenuIcon icon={action.icon} className={styles.menuIconSvg} />
                      </span>
                      <div>
                        <strong>{action.label}</strong>
                        <small>{action.note}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {mobileMenuLinks.length ? (
              <div className={styles.menuSheetLinks}>
                {mobileMenuLinks.map((item) => (
                  <Link
                    key={`sheet-${item.key}`}
                    href={item.href}
                    className={`${styles.menuSheetLink} ${
                      active === item.key ? styles.menuSheetLinkActive : ""
                    }`}
                    aria-current={active === item.key ? "page" : undefined}
                    onClick={closeMobileOverlays}
                  >
                    <span className={styles.menuLinkIcon} aria-hidden>
                      <MenuIcon icon={item.icon} className={styles.menuIconSvg} />
                    </span>
                    <span className={styles.menuLinkBody}>
                      <span className={styles.menuLabel}>{item.label}</span>
                      <small className={styles.menuNote}>{item.note}</small>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}

            <div className={styles.menuProfileMeta}>
              <span>Одоогийн хэсэг</span>
              <strong>{activeItem?.label ?? menuTitle}</strong>
            </div>

          <form action="/auth/logout" method="post">
              <button type="submit" className={styles.menuProfileLogoutButton}>
                Гарах
              </button>
            </form>
            </div>
          ) : null}
        </>
      ) : null}

      <div className={styles.menuMobileUtilityBar} aria-label="Туслах цэс">
        <button
          type="button"
          className={`${styles.menuUtilityButton} ${
            menuUtilityActive ? styles.menuUtilityButtonActive : ""
          }`}
          aria-expanded={isMenuOpen}
          onClick={toggleMenu}
        >
          <span className={styles.menuUtilityIcon} aria-hidden>
            <MenuIcon icon="menu" className={styles.menuIconSvg} />
          </span>
          <span className={styles.menuUtilityCopy}>
            <strong>Цэс</strong>
            <small>{activeItem?.label ?? menuTitle}</small>
          </span>
        </button>

        <Link
          href={profileHref}
          className={`${styles.menuUtilityButton} ${
            active === "profile" ? styles.menuUtilityButtonActive : ""
          }`}
          aria-current={active === "profile" ? "page" : undefined}
          onClick={closeMobileOverlays}
        >
          <span className={styles.menuUtilityAvatar} aria-hidden>
            {getInitials(userName)}
          </span>
          <span className={styles.menuUtilityCopy}>
            <strong>Профайл</strong>
            <small>{roleLabel}</small>
          </span>
        </Link>
      </div>

      {!isMenuOpen ? (
      <div
        className={`${styles.menuMobileDock} ${
          canOpenCreateHub ? styles.menuMobileDockWithAdd : styles.menuMobileDockCompact
        }`}
        aria-label="Хурдан цэс"
      >
        {mobileLeadingItems.map((item) => (
          <Link
            key={`mobile-${item.key}`}
            href={item.href}
            className={`${styles.menuDockLink} ${
              active === item.key ? styles.menuDockLinkActive : ""
            }`}
            aria-current={active === item.key ? "page" : undefined}
            onClick={closeMobileOverlays}
          >
            <span className={styles.menuDockIcon} aria-hidden>
              <MenuIcon icon={item.icon} className={styles.menuIconSvg} />
            </span>
            <span className={styles.menuDockLabel}>{getDockLabel(item.key)}</span>
          </Link>
        ))}

        {canOpenCreateHub ? (
          <Link
            href={createHubHref}
            className={`${styles.menuDockAddTrigger} ${
              active === "new-project" ? styles.menuDockAddTriggerActive : ""
            }`}
            aria-label="Нэмэх төв"
            onClick={closeMobileOverlays}
          >
            <span className={styles.menuDockAddIcon} aria-hidden>
              <MenuIcon icon="plus" className={styles.menuIconSvg} />
            </span>
            <span className={styles.srOnly}>Нэмэх</span>
          </Link>
        ) : null}

        {mobileTrailingItems.map((item) => (
          <Link
            key={`mobile-${item.key}`}
            href={item.href}
            className={`${styles.menuDockLink} ${
              active === item.key ? styles.menuDockLinkActive : ""
            }`}
            aria-current={active === item.key ? "page" : undefined}
            onClick={closeMobileOverlays}
          >
            <span className={styles.menuDockIcon} aria-hidden>
              <MenuIcon icon={item.icon} className={styles.menuIconSvg} />
            </span>
            <span className={styles.menuDockLabel}>{getDockLabel(item.key)}</span>
          </Link>
        ))}
      </div>
      ) : null}
    </nav>
  );
}
