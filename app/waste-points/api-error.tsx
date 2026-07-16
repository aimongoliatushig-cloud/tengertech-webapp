import { AlertTriangle, RotateCcw } from "lucide-react";

import { WastePointsApiError } from "@/lib/waste-points/api";

import styles from "./waste-points.module.css";

const FALLBACK = "Хогийн цэгийн мэдээллийг ачаалж чадсангүй. Дараа дахин оролдоно уу.";

export function toFriendlyMessage(error: unknown): string {
  if (error instanceof WastePointsApiError) return error.friendly;
  return FALLBACK;
}

/**
 * API боломжгүй үед харуулах найрсаг алдаа + дахин оролдох товч.
 * retryHref нь тухайн хуудсаа дахин ачаалж, API руу шинээр хүсэлт явуулна.
 */
export function WasteApiError({ error, retryHref }: { error: unknown; retryHref: string }) {
  const message = toFriendlyMessage(error);
  const status = error instanceof WastePointsApiError ? error.status : 0;

  return (
    <section className={styles.apiError}>
      <span className={styles.apiErrorIcon}>
        <AlertTriangle size={22} aria-hidden />
      </span>
      <h2>Мэдээлэл ачаалагдсангүй</h2>
      <p>{message}</p>
      {status === 401 || status === 403 ? (
        <p className={styles.apiErrorHint}>
          ERP нь мэдээллийг серверээс татдаг тул хөтчийн нэвтрэлт (cookie) хүрэлцэхгүй. Smart Clean UB
          системээс ERP-д зориулсан <b>хандалтын token</b> авч, <code>WASTE_POINTS_API_TOKEN</code>{" "}
          тохиргоонд нэмснээр шууд ажиллана.
        </p>
      ) : null}
      <a href={retryHref} className={`${styles.button} ${styles.buttonPrimary}`}>
        <RotateCcw size={15} aria-hidden /> Дахин оролдох
      </a>
    </section>
  );
}
