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

function getTodayDateValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function DataDownloadClient() {
  const [date, setDate] = useState(getTodayDateValue);
  const [report, setReport] = useState<WrsReportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const previewMinHeight = report ? Math.max(980, report.renderHeight) : 980;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!date) {
      setErrorMessage("Тайлан татахын өмнө огноогоо сонгоно уу.");
      return;
    }

    setErrorMessage("");

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

      startTransition(() => {
        setReport(payload);
      });
    } catch (error) {
      setReport(null);
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "WRS тайлан татаж чадсангүй.",
      );
    }
  }

  return (
    <>
      {errorMessage ? (
        <div className={`${styles.message} ${styles.errorMessage}`}>{errorMessage}</div>
      ) : null}

      <section className={styles.panelGrid}>
        <section className={styles.formCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>WRS татах</span>
              <h2>Нэг өдрийн өгөгдөл татах</h2>
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
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>

            <div className={styles.buttonRow}>
              <button type="submit" className={styles.primaryButton} disabled={isPending}>
                {isPending ? "Татаж байна..." : "Өгөгдөл татах"}
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
              <strong>{report?.branchName ?? "Морингийн энгэрийн төвлөрсөн хогийн цэг"}</strong>
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
              : "Огноо сонгоод Өгөгдөл татах товч дармагц тайлан энд гарна."}
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
            <p>Огноогоо сонгоод Өгөгдөл татах товч дармагц WRS дүрслэл энд ачааллана.</p>
          </div>
        )}
      </section>
    </>
  );
}
