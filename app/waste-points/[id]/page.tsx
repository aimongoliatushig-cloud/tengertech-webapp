import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Plus } from "lucide-react";

import { getWastePointById } from "@/lib/waste-points/service";
import {
  WASTE_STATUS_LABELS,
  WASTE_STATUS_TONE,
  WASTE_TASK_TYPES,
  WASTE_TYPE_LABELS,
  formatGps,
} from "@/lib/waste-points/types";

import { requireWasteAccess } from "../access";
import { createWastePointTaskAction } from "../actions";
import { QrViewer } from "../qr-viewer";
import { WasteShell } from "../waste-shell";
import styles from "../waste-points.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const TONE_CLASS: Record<string, string> = {
  ok: "pillOk",
  warn: "pillWarn",
  danger: "pillDanger",
  muted: "pillMuted",
};

function formatDate(iso: string) {
  return iso ? iso.slice(0, 10) : "—";
}

export default async function WastePointDetailPage({ params, searchParams }: PageProps) {
  const { session, scopedDepartmentName } = await requireWasteAccess();
  const { id } = await params;
  const point = await getWastePointById(Number(id));
  if (!point) {
    notFound();
  }

  const sp = (await searchParams) ?? {};
  const notice = firstParam(sp.notice);
  const errorMessage = firstParam(sp.error);

  return (
    <WasteShell
      session={session}
      scopedDepartmentName={scopedDepartmentName}
      title={point.name}
      subtitle={`${point.code} · ${point.districtName}, ${point.khorooName}`}
    >
      <div className={styles.page}>
        <Link href="/waste-points/list" className={styles.backLink}>
          <ArrowLeft size={15} aria-hidden /> Жагсаалт руу буцах
        </Link>

        {notice ? (
          <div className={`${styles.toast} ${styles.toastOk}`}>
            <CheckCircle2 size={17} aria-hidden /> {notice}
          </div>
        ) : null}
        {errorMessage ? (
          <div className={`${styles.toast} ${styles.toastError}`}>
            <AlertCircle size={17} aria-hidden /> {errorMessage}
          </div>
        ) : null}

        <div className={styles.detailGrid}>
          <div className={styles.page}>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2>Ерөнхий мэдээлэл</h2>
                <span
                  className={`${styles.pill} ${styles[TONE_CLASS[WASTE_STATUS_TONE[point.currentStatus]]]}`}
                >
                  {WASTE_STATUS_LABELS[point.currentStatus]}
                </span>
              </div>
              <div className={styles.defList}>
                <div className={styles.defItem}>
                  <span>Нэр</span>
                  <strong>{point.name}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Код</span>
                  <strong className={styles.mono}>{point.code}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Төрөл</span>
                  <strong>{WASTE_TYPE_LABELS[point.type]}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>GPS</span>
                  <strong className={styles.mono}>{formatGps(point.latitude, point.longitude)}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Дүүрэг</span>
                  <strong>{point.districtName}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Хороо</span>
                  <strong>{point.khorooName}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Хаяг</span>
                  <strong>{point.address}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Савны төрөл</span>
                  <strong>{point.containerType}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Савны тоо</span>
                  <strong>{point.containerCount ? `${point.containerCount} ш` : "—"}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Багтаамж</span>
                  <strong>{point.capacity ? `${point.capacity.toLocaleString("mn-MN")} л` : "—"}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Дүүргэлт</span>
                  <strong>{point.currentFillLevel}%</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Хариуцагч</span>
                  <strong>{point.assignedCompany}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Үүсгэсэн</span>
                  <strong>{formatDate(point.createdAt)}</strong>
                </div>
                <div className={styles.defItem}>
                  <span>Шинэчилсэн</span>
                  <strong>{formatDate(point.updatedAt)}</strong>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2>Ажил үүсгэх</h2>
                <small>ERP-ийн даалгавар автоматаар үүснэ</small>
              </div>
              <form action={createWastePointTaskAction} className={styles.taskForm}>
                <input type="hidden" name="point_id" value={point.id} />
                <div className={styles.filters}>
                  <label className={styles.field}>
                    <span>Ажлын төрөл</span>
                    <select name="task_type" defaultValue="collection">
                      {WASTE_TASK_TYPES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field} style={{ flex: 1, minWidth: 220 }}>
                    <span>Тайлбар (заавал биш)</span>
                    <input type="text" name="note" placeholder="Нэмэлт тайлбар..." />
                  </label>
                  <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
                    <Plus size={15} aria-hidden /> Ажил үүсгэх
                  </button>
                </div>
              </form>
            </section>
          </div>

          <section className={styles.card} id="qr">
            <div className={styles.cardHead}>
              <h2>QR код</h2>
            </div>
            <QrViewer code={point.code} qrCode={point.qrCode} name={point.name} />
          </section>
        </div>
      </div>
    </WasteShell>
  );
}
