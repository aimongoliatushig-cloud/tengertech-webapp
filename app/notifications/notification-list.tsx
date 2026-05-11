"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, ClipboardList } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { cn } from "@/lib/utils";

import styles from "./notifications.module.css";

export type NotificationListItem = {
  key: string;
  name: string;
  departmentName: string;
  projectName: string;
  stageLabel: string;
  href: string;
  progress: number;
  taskCount: number;
  timeLabel: string;
  isRead: boolean;
  reasons: Array<"new" | "review" | "overdue" | "issue">;
};

function reasonLabel(reason: NotificationListItem["reasons"][number]) {
  switch (reason) {
    case "new":
      return "Шинэ ажил";
    case "review":
      return "Хянах";
    case "overdue":
      return "Хугацаа хэтэрсэн";
    case "issue":
      return "Анхаарах";
  }
}

async function markRead(keys: string[]) {
  if (!keys.length) {
    return true;
  }

  try {
    const response = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
      keepalive: true,
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    return Boolean(response.ok && payload?.ok);
  } catch (error) {
    console.warn("Notification mark-read failed:", error);
    return false;
  }
}

export function NotificationList({
  items,
  groupedByWorkMode,
}: {
  items: NotificationListItem[];
  groupedByWorkMode: boolean;
}) {
  const workerMode = groupedByWorkMode;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [readKeys, setReadKeys] = useState(
    () => new Set(items.filter((item) => item.isRead).map((item) => item.key)),
  );
  const unreadKeys = useMemo(
    () => items.filter((item) => !readKeys.has(item.key)).map((item) => item.key),
    [items, readKeys],
  );

  const markOneReadInBackground = (item: NotificationListItem) => {
    if (readKeys.has(item.key)) {
      return;
    }
    setReadKeys((current) => new Set(current).add(item.key));
    void markRead([item.key]);
  };

  const markAllRead = () => {
    if (!unreadKeys.length) {
      return;
    }

    const keysToMark = unreadKeys;
    setReadKeys((current) => new Set([...current, ...keysToMark]));
    startTransition(async () => {
      const ok = await markRead(keysToMark);
      if (ok) {
        router.refresh();
      }
    });
  };

  return (
    <div className={styles.notificationListBlock}>
      <div className={styles.readToolbar}>
        <span>
          {unreadKeys.length
            ? `${unreadKeys.length} уншаагүй мэдэгдэл`
            : "Бүх мэдэгдэл уншсан"}
        </span>
        <button type="button" onClick={markAllRead} disabled={!unreadKeys.length || isPending}>
          Бүгдийг уншсан болгох
        </button>
      </div>

      <div className={styles.notificationList}>
        {items.map((item) => {
          const isRead = readKeys.has(item.key);

          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={(event) => {
                event.preventDefault();
                markOneReadInBackground(item);
                router.push(item.href);
              }}
              className={cn(styles.notificationCard, !isRead && styles.notificationCardUnread)}
            >
              <span className={styles.iconBubble} aria-hidden>
                {item.reasons.includes("overdue") || item.reasons.includes("issue") ? (
                  <AlertTriangle />
                ) : item.reasons.includes("review") ? (
                  <ClipboardList />
                ) : (
                  <Bell />
                )}
              </span>
              <div>
                <div className={styles.notificationTitle}>
                  <strong>{item.name}</strong>
                  {!isRead ? (
                    <span className={styles.unreadPill}>Уншаагүй</span>
                  ) : (
                    <span className={styles.readPill}>Уншсан</span>
                  )}
                  {item.reasons.map((reason) => (
                    <span
                      key={reason}
                      className={cn(
                        styles.reasonPill,
                        (reason === "overdue" || reason === "issue") && styles.reasonPillUrgent,
                      )}
                    >
                      {reasonLabel(reason)}
                    </span>
                  ))}
                  <span className={styles.timePill}>{item.timeLabel}</span>
                </div>
                <p className={styles.notificationMeta}>
                  {item.departmentName} ·{" "}
                  {workerMode || item.taskCount > 1 ? `${item.taskCount} даалгавар` : item.projectName} ·{" "}
                  {item.stageLabel}
                </p>
              </div>
              <div className={styles.notificationProgress}>
                <strong>{item.progress}%</strong>
                <span>Явц</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
