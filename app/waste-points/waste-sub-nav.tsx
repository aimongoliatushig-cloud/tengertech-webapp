import Link from "next/link";
import { LayoutDashboard, List } from "lucide-react";

import styles from "./waste-points.module.css";

const ITEMS = [
  { key: "dashboard", href: "/waste-points", label: "Хянах самбар", icon: LayoutDashboard },
  { key: "list", href: "/waste-points/list", label: "Хогийн цэгийн жагсаалт", icon: List },
] as const;

export function WasteSubNav({ active }: { active: "dashboard" | "list" }) {
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
