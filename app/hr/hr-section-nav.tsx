"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FileText,
  HeartPulse,
  LayoutDashboard,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";

import styles from "./hr.module.css";

const hrItems = [
  { href: "/hr", label: "Самбар", icon: LayoutDashboard },
  { href: "/hr/employees", label: "Бүх ажилтнууд", icon: Users },
  { href: "/hr/employees/new", label: "Шинэ ажилтан бүртгэх", icon: UserPlus },
  { href: "/hr/leaves", label: "Ирсэн хүсэлтүүд", icon: CalendarDays },
  { href: "/hr/sick", label: "Чөлөө / өвчтэй хүсэлтүүд", icon: HeartPulse },
  { href: "/hr/discipline", label: "Сахилгын бүртгэл", icon: ShieldAlert },
  { href: "/hr/reports", label: "Тайлан", icon: FileText },
];

const departmentItems = [
  { href: "/hr", label: "Самбар", icon: LayoutDashboard },
  { href: "/hr/employees", label: "Миний хэлтсийн ажилтнууд", icon: Users },
  { href: "/hr/leaves", label: "Миний илгээсэн хүсэлтүүд", icon: CalendarDays },
  { href: "/hr/sick", label: "Чөлөө / өвчтэй хүсэлт", icon: HeartPulse },
];

export function HrSectionNav({ mode = "hr" }: { mode?: "hr" | "department" }) {
  const pathname = usePathname();
  const items = mode === "department" ? departmentItems : hrItems;

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
