import Link from "next/link";
import { BarChart3, LayoutDashboard, List, Map } from "lucide-react";

import styles from "./waste-points.module.css";

const ITEMS = [
  { key: "dashboard", href: "/waste-points", label: "Хянах самбар", icon: LayoutDashboard },
  { key: "list", href: "/waste-points/list", label: "Хогийн цэгийн жагсаалт", icon: List },
  { key: "map", href: "/waste-points/map", label: "Газрын зураг", icon: Map },
  { key: "report", href: "/waste-points/report", label: "Тайлан", icon: BarChart3 },
] as const;

export function WasteSubNav({ active }: { active: "dashboard" | "list" | "map" | "report" }) {
  return (
    <nav className={styles.subNav} aria-label="Хогийн цэгийн хэсгүүд">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`${styles.subNavLink} ${active === item.key ? styles.subNavLinkActive : ""}`}
          >
            <Icon size={15} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
