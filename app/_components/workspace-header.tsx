import Image from "next/image";

import styles from "./workspace-header.module.css";

type WorkspaceHeaderProps = {
  title?: string;
  subtitle?: string;
  userName: string;
  roleLabel: string;
  notificationCount?: number;
  notificationNote?: string;
};

function BellGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.noticeSvg}
      aria-hidden
    >
      <path
        d="M9.5 18C9.8 19.2 10.8 20 12 20C13.2 20 14.2 19.2 14.5 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 15.5H18L16.8 13.6C16.2 12.7 15.9 11.6 15.9 10.5V9.7C15.9 7.4 14.1 5.5 12 5.5C9.9 5.5 8.1 7.4 8.1 9.7V10.5C8.1 11.6 7.8 12.7 7.2 13.6L6 15.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

export function WorkspaceHeader({
  title = "Ажлын орчин",
  subtitle = "Odoo-той холбогдсон ажлын урсгал",
  userName,
  roleLabel,
  notificationCount = 0,
  notificationNote,
}: WorkspaceHeaderProps) {
  const safeNotificationCount = Math.max(0, Math.round(notificationCount));
  const noticeText =
    notificationNote ??
    (safeNotificationCount > 0
      ? `${safeNotificationCount} анхаарах зүйл байна`
      : "Шинэ анхаарах зүйл алга");

  return (
    <header className={styles.header}>
      <div className={styles.primaryBlock}>
        <div className={styles.brandBlock}>
          <div className={styles.logoShell}>
            <Image
              src="/logo.png"
              alt="Хот тохижилтын удирдлагын төв"
              width={112}
              height={38}
              className={styles.logo}
              unoptimized
            />
          </div>

          <div className={styles.brandCopy}>
            <span className={styles.kicker}>Odoo урсгал</span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
        </div>

        <div className={styles.liveNote}>
          <span className={styles.liveDot} aria-hidden />
          <span>{noticeText}</span>
        </div>
      </div>

      <div className={styles.metaGrid}>
        <article className={`${styles.metaCard} ${styles.noticeCard}`}>
          <div className={styles.metaHead}>
            <span className={styles.noticeIcon} aria-hidden>
              <BellGlyph />
            </span>
            <div className={styles.metaCopy}>
              <span>Анхаарах</span>
              <strong>{safeNotificationCount}</strong>
              <small>{noticeText}</small>
            </div>
          </div>
        </article>

        <article className={`${styles.metaCard} ${styles.accountCard}`}>
          <span className={styles.avatar}>{getInitials(userName)}</span>
          <div className={styles.metaCopy}>
            <span>Хэрэглэгч</span>
            <strong>{userName}</strong>
            <small>{roleLabel}</small>
          </div>
        </article>
      </div>
    </header>
  );
}
