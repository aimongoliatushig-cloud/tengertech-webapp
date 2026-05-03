"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  CalendarDays,
  ClipboardCheck,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Plane,
  ScrollText,
  Settings,
  ShieldAlert,
  Shuffle,
  UserPlus,
  Users,
} from "lucide-react";

import styles from "./hr.module.css";

const items = [
  { href: "/hr", label: "Dashboard", icon: LayoutDashboard },
  { href: "/hr/employees", label: "Ажилтнууд", icon: Users },
  { href: "/hr/employees/new", label: "Шинэ ажилтан бүртгэх", icon: UserPlus },
  { href: "/hr/leaves", label: "Чөлөө", icon: CalendarDays },
  { href: "/hr/sick", label: "Өвчтэй", icon: HeartPulse },
  { href: "/hr/trips", label: "Томилолт", icon: Plane },
  { href: "/hr/discipline", label: "Сахилгын бүртгэл", icon: ShieldAlert },
  { href: "/hr/orders", label: "Тушаал", icon: ScrollText },
  { href: "/hr/transfers", label: "Шилжилт хөдөлгөөн", icon: Shuffle },
  { href: "/hr/clearance", label: "Тойрох хуудас", icon: ClipboardCheck },
  { href: "/hr/archive", label: "Архив", icon: Archive },
  { href: "/hr/reports", label: "Тайлан", icon: FileText },
  { href: "/hr/settings", label: "Тохиргоо", icon: Settings },
];

export function HrSectionNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.hrTabs} aria-label="Хүний нөөцийн дотоод цэс">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/hr" ? pathname === "/hr" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? styles.hrTabActive : styles.hrTab}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
