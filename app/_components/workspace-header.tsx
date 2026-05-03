import type { CSSProperties } from "react";

import Link from "next/link";
import { Bell, CalendarDays, ChevronDown, Leaf } from "lucide-react";

import styles from "./workspace-header.module.css";

type WorkspaceHeaderProps = {
  title?: string;
  subtitle?: string;
  userName: string;
  roleLabel: string;
  notificationCount?: number;
  notificationNote?: string;
  notificationHref?: string;
  backgroundImage?: string;
};

const DEFAULT_HEADER_IMAGE =
  "/illustrations/green-city-hero.svg";

function formatHeaderDate() {
  const parts = new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    timeZone: "Asia/Ulaanbaatar",
  }).formatToParts(new Date());
  const partByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${partByType.get("year")}.${partByType.get("month")}.${partByType.get(
    "day",
  )}. ${partByType.get("weekday")}`;
}

export function WorkspaceHeader({
  title = "Ажлын орчин",
  subtitle = "Odoo-той холбогдсон ажлын урсгал",
  userName,
  roleLabel,
  notificationCount = 0,
  notificationNote,
  notificationHref = "/notifications",
  backgroundImage = DEFAULT_HEADER_IMAGE,
}: WorkspaceHeaderProps) {
  const safeNotificationCount = Math.max(0, Math.round(notificationCount));
  const noticeText =
    notificationNote ??
    (safeNotificationCount > 0
      ? `${safeNotificationCount} анхаарах зүйл байна`
      : "Шинэ анхаарах зүйл алга");

  return (
    <header
      className={styles.header}
      style={{ "--workspace-header-image": `url("${backgroundImage}")` } as CSSProperties}
    >
      <Leaf className={styles.leafOne} aria-hidden />
      <Leaf className={styles.leafTwo} aria-hidden />
      <Leaf className={styles.leafThree} aria-hidden />

      <div className={styles.titleArea}>
        <div className={styles.titleBlock}>
          <h1>
            {title}
            <Leaf className={styles.titleLeaf} aria-hidden />
          </h1>
          <span>{subtitle}</span>
        </div>
      </div>

      <div className={styles.headerActions}>
        <div className={styles.datePill}>
          <CalendarDays aria-hidden />
          <span>{formatHeaderDate()}</span>
        </div>

        <Link
          className={styles.notificationButton}
          href={notificationHref}
          title={noticeText}
          aria-label={`${noticeText}. Мэдэгдэл харах`}
        >
          <Bell aria-hidden />
          {safeNotificationCount > 0 ? <span>{safeNotificationCount}</span> : null}
        </Link>

        <div className={styles.headerUser}>
          <div>
            <strong>{userName}</strong>
            <small>{roleLabel}</small>
          </div>
          <ChevronDown aria-hidden />
        </div>
      </div>
    </header>
  );
}
