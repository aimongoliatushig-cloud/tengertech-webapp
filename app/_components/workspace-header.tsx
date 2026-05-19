import type { CSSProperties } from "react";

import Link from "next/link";
import { Bell, CalendarDays, Leaf } from "lucide-react";

import { loadCurrentUserProfileImageUrl } from "@/lib/current-user-profile";

import { WorkspaceMobileBackButton } from "./workspace-mobile-back-button";
import { WorkspaceHeaderUserMenu } from "./workspace-header-user-menu";
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
  showUserMenu?: boolean;
  userImageUrl?: string;
  mobileBackHref?: string;
  showMobileBack?: boolean;
};

const DEFAULT_HEADER_IMAGE =
  "/illustrations/green-city-hero.svg";

type WorkspaceHeaderAccountMenuProps = {
  userName: string;
  roleLabel: string;
  userImageUrl?: string;
};

async function WorkspaceHeaderAccountMenu({
  userName,
  roleLabel,
  userImageUrl = "",
}: WorkspaceHeaderAccountMenuProps) {
  const resolvedUserImageUrl = userImageUrl || await loadCurrentUserProfileImageUrl();

  return (
    <WorkspaceHeaderUserMenu
      userName={userName}
      roleLabel={roleLabel}
      userImageUrl={resolvedUserImageUrl}
    />
  );
}

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
  subtitle = "",
  userName,
  roleLabel,
  notificationCount = 0,
  notificationNote,
  notificationHref = "/notifications",
  backgroundImage = DEFAULT_HEADER_IMAGE,
  showUserMenu = true,
  userImageUrl = "",
  mobileBackHref = "/",
  showMobileBack = true,
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
        <WorkspaceMobileBackButton fallbackHref={mobileBackHref} showMobileBack={showMobileBack} />
        <div className={styles.titleBlock}>
          <h1>
            {title}
            <Leaf className={styles.titleLeaf} aria-hidden />
          </h1>
          {subtitle ? <span>{subtitle}</span> : null}
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

        {showUserMenu ? (
          <WorkspaceHeaderAccountMenu userName={userName} roleLabel={roleLabel} userImageUrl={userImageUrl} />
        ) : null}
      </div>
    </header>
  );
}
