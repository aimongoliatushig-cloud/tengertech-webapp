"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, ClipboardCheck, LayoutDashboard, Users } from "lucide-react";

import styles from "./hr.module.css";

const items = [
  { href: "/hr", label: "Хяналт", icon: LayoutDashboard },
  { href: "/hr/employees", label: "Ажилтнууд", icon: Users },
  { href: "/hr/departments", label: "Алба нэгжүүд", icon: Building2 },
  { href: "/hr/leaves", label: "Чөлөө / өвчтэй", icon: CalendarDays },
  { href: "/hr/clearance", label: "Тойрох хуудас", icon: ClipboardCheck },
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
