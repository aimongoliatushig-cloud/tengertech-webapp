import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

const NOTIFICATION_STATE_MODEL = "tengertech.notification.state";

function getConnectionOverrides(session: AppSession) {
  return {
    login: session.login,
    password: session.password,
  };
}

function normalizeNotificationKeys(keys: string[]) {
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
}

export async function loadReadNotificationKeys(session: AppSession, keys: string[]) {
  const normalizedKeys = normalizeNotificationKeys(keys);
  if (!normalizedKeys.length) {
    return new Set<string>();
  }

  try {
    const readKeys = await executeOdooKw<string[]>(
      NOTIFICATION_STATE_MODEL,
      "read_keys_for_current_user",
      [normalizedKeys],
      {},
      getConnectionOverrides(session),
    );
    return new Set(readKeys);
  } catch (error) {
    console.warn("Notification read state load failed:", error);
    return new Set<string>();
  }
}

export async function markNotificationsRead(session: AppSession, keys: string[]) {
  const normalizedKeys = normalizeNotificationKeys(keys);
  if (!normalizedKeys.length) {
    return true;
  }

  try {
    return await executeOdooKw<boolean>(
      NOTIFICATION_STATE_MODEL,
      "mark_read_for_current_user",
      [normalizedKeys],
      {},
      getConnectionOverrides(session),
    );
  } catch (error) {
    console.warn("Notification read state save failed:", error);
    return false;
  }
}
