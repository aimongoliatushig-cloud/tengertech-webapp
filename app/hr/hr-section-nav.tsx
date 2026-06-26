"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Flag,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

import styles from "./hr.module.css";

type HrSectionItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

// Зүүн талын ерөнхий цэстэй ижил эрхийн логик: HR мэргэжилтэн бүгдийг,
// хэлтсийн дарга зөвхөн доорх дэд багцыг харна.
const HR_SECTION_ITEMS: HrSectionItem[] = [
  { key: "hr-dashboard", href: "/hr", label: "Хянах самбар", icon: LayoutDashboard },
  { key: "hr-employees", href: "/hr/employees", label: "Ажилтнууд", icon: Users },
  { key: "hr-requests", href: "/hr/leaves", label: "Чөлөө", icon: ClipboardCheck },
  { key: "hr-sick", href: "/hr/sick", label: "Өвчтэй", icon: HeartPulse },
  { key: "hr-trips", href: "/hr/trips", label: "Томилолт", icon: Truck },
  { key: "hr-orders", href: "/hr/orders", label: "Тушаал", icon: CalendarDays },
  { key: "hr-discipline", href: "/hr/discipline", label: "Сахилга", icon: Flag },
  { key: "hr-transfers", href: "/hr/transfers", label: "Шилжилт", icon: ListChecks },
  { key: "hr-clearance", href: "/hr/clearance", label: "Тойрох хуудас", icon: ClipboardCheck },
  { key: "hr-archive", href: "/hr/archive", label: "Ажлаас чөлөөлөх", icon: Archive },
  { key: "hr-reports", href: "/hr/reports", label: "Тайлан", icon: BarChart3 },
  { key: "hr-settings", href: "/hr/settings", label: "Тохиргоо", icon: Settings },
];

const DEPARTMENT_SECTION_KEYS = new Set([
  "hr-dashboard",
  "hr-employees",
  "hr-requests",
  "hr-sick",
  "hr-trips",
  "hr-orders",
]);

function isActiveSection(pathname: string, href: string) {
  if (href === "/hr") {
    return pathname === "/hr";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HrSectionNav({ mode = "hr" }: { mode?: "hr" | "department" }) {
  const pathname = usePathname() ?? "/hr";
  const items =
    mode === "hr"
      ? HR_SECTION_ITEMS
      : HR_SECTION_ITEMS.filter((item) => DEPARTMENT_SECTION_KEYS.has(item.key));

  return (
    <nav className={styles.sectionNav} aria-label="Хүний нөөцийн хэсгүүд">
      <div className={styles.sectionNavInner}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActiveSection(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`${styles.sectionNavLink} ${active ? styles.sectionNavLinkActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={16} strokeWidth={2.2} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
