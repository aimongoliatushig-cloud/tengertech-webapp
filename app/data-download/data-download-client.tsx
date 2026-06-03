"use client";

import { useState, useTransition } from "react";

import styles from "@/app/workspace.module.css";

type WrsReportResponse = {
  requestedDate: string;
  branchName: string;
  title: string;
  pageLabel: string | null;
  totalPages: number | null;
  renderHeight: number;
  pages: string[];
};

type WrsImportResponse = {
  requestedDate: string;
  branchName: string;
  totalRows: number;
  imported: number;
  created: number;
  updated: number;
  unmatched: Array<{ vehicleCode: string; vehicleLabel: string; weightKg: number }>;
};

const DATA_DOWNLOAD_TIME_ZONE = "Asia/Ulaanbaatar";
const IMPORT_READY_HOUR = 23;
const IMPORT_READY_TIME_LABEL = "23:00";

function getCurrentDateValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DATA_DOWNLOAD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDateValue(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isImportReadyNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DATA_DOWNLOAD_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return hour * 60 + minute >= IMPORT_READY_HOUR * 60;
}

function getLatestImportDateValue() {
  return shiftDateValue(getCurrentDateValue(), isImportReadyNow() ? 0 : -1);
}

export function DataDownloadClient() {
  const latestImportDate = getLatestImportDateValue();
  const [date, setDate] = useState(getLatestImportDateValue);
  const [report, setReport] = useState<WrsReportResponse | null>(null);
  const [importSummary, setImportSummary] = useState<WrsImportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const previewMinHeight = report ? Math.max(980, report.renderHeight) : 980;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!date) {
      setErrorMessage("Тайлан татахын өмнө огноогоо сонгоно уу.");
      return;
    }

    if (date > latestImportDate) {
      setErrorMessage(`Өнөөдрийн тайлан тухайн өдөр ${IMPORT_READY_TIME_LABEL}-с хойш татагдана. Ирээдүйн огноо сонгох боломжгүй.`);
      return;
    }

    setErrorMessage("");
    setImportSummary(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/wrs-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date }),
      });

      const payload = (await response.json()) as WrsReportResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "WRS тайлан татаж чадсангүй.");
      }

      const importResponse = await fetch("/api/wrs-report/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date }),
      });
      const importPayload = (await importResponse.json()) as WrsImportResponse & {
        error?: string;
      };
      const hasPartialImportSummary =
        (importPayload.imported ?? 0) > 0 ||
        ((importPayload.totalRows ?? 0) > 0 && Array.isArray(importPayload.unmatched));

      if (!importResponse.ok) {
        if (hasPartialImportSummary) {
          startTransition(() => {
            setReport(payload);
            setImportSummary({
              ...importPayload,
              unmatched: importPayload.unmatched ?? [],
            });
          });
          setErrorMessage(
            importPayload.error ??
              "Зарим мөр хадгалагдсан боловч зарим улсын дугаар авто баазтай таарсангүй.",
          );
          return;
        }

        throw new Error(importPayload.error ?? "WRS тайланг авто баазын бүртгэлд оруулж чадсангүй.");
      }

      startTransition(() => {
        setReport(payload);
        setImportSummary(importPayload);
      });
    } catch (error) {
      setReport(null);
      setImportSummary(null);
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "WRS тайлан татаж чадсангүй.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {errorMessage ? (
        <div className={`${styles.message} ${styles.errorMessage}`}>{errorMessage}</div>
      ) : null}
      {importSummary ? (
        <div className={`${styles.message} ${styles.noticeMessage}`}>
          {`${importSummary.requestedDate} өдрийн WRS дата авто баазад орлоо: ${importSummary.imported} машин, ${importSummary.created} шинэ, ${importSummary.updated} шинэчилсэн.`}
          {importSummary.unmatched.length
            ? ` ${importSummary.unmatched.length} улсын дугаар авто баазтай таарсангүй.`
            : ""}
        </div>
      ) : null}

      <section className={styles.panelGrid}>
        <section className={styles.formCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>WRS татах</span>
              <h2>Нэг өдрийн тайлан татах</h2>
            </div>
            <p>Сонгосон өдрөөр WRS-ээс тайлангийн HTML дүрслэлийг шууд татна.</p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="wrs-report-date">Огноо</label>
              <input
                id="wrs-report-date"
                type="date"
                value={date}
                max={latestImportDate}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>

            <div className={styles.buttonRow}>
              <button type="submit" className={styles.primaryButton} disabled={isPending || isLoading}>
                {isPending || isLoading ? "Татаж байна..." : "Тайлан татах"}
              </button>
            </div>
          </form>
        </section>

        <aside className={`${styles.panel} ${styles.stickyAside}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Урсгал</span>
              <h2>Автомат алхам</h2>
            </div>
          </div>

          <div className={styles.metaList}>
            <div>
              <span>WRS URL</span>
              <strong>1.2 Өдрийн тайлан</strong>
            </div>
            <div>
              <span>Огноо</span>
              <strong>{date || "Сонгоогүй"}</strong>
            </div>
            <div>
              <span>Салбар</span>
              <strong>{report?.branchName ?? "Нарангийн энгэрийн төвлөрсөн хогийн цэг"}</strong>
            </div>
            <div>
              <span>Урьдчилан харах</span>
              <strong>Зургийн хуудсууд</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Урьдчилан харах</span>
            <h2>Татсан тайлан</h2>
          </div>
          <p>
            {report
              ? `${report.requestedDate} огнооны тайлан HTML байдлаар доор харагдана.`
              : "Огноо сонгоод тайлан татах товч дармагц тайлан энд гарна."}
          </p>
        </div>

        {report ? (
          <div
            className={styles.reportPreviewShell}
            style={{ minHeight: `${previewMinHeight}px` }}
          >
            <div className={styles.chipRow}>
              <span className={styles.chip}>{report.requestedDate}</span>
              <span className={styles.chip}>{report.branchName}</span>
              {report.pageLabel ? <span className={styles.chip}>{report.pageLabel}</span> : null}
            </div>

            <div className={styles.reportPageList}>
              {report.pages.map((pageSource, index) => (
                <figure key={`${report.requestedDate}-${index + 1}`} className={styles.reportPage}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pageSource}
                    alt={`${report.title} хуудас ${index + 1}`}
                    className={styles.reportPageImage}
                    loading="lazy"
                  />
                </figure>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h2>Тайлан хараахан татаагүй байна</h2>
            <p>Огноогоо сонгоод тайлан татах товч дармагц WRS дүрслэл энд ачааллана.</p>
          </div>
        )}
      </section>
    </>
  );
}
