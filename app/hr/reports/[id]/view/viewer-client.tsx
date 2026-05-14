"use client";

import { ArrowLeft, Download } from "lucide-react";

import styles from "../../../hr.module.css";

function reportUrl(url: string, disposition: "inline" | "attachment") {
  const nextUrl = new URL(url, "http://localhost");
  nextUrl.searchParams.set("disposition", disposition);
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}

export function HrReportPdfViewer({ downloadUrl, reportsUrl }: { downloadUrl: string; reportsUrl: string }) {
  const inlineUrl = reportUrl(downloadUrl, "inline");
  const attachmentUrl = reportUrl(downloadUrl, "attachment");

  return (
    <div className={styles.reportViewer}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>PDF тайлан</h2>
          <p>HR тайлан app дотор нээгдэж байна.</p>
        </div>
        <div className={styles.recordActions}>
          <a className={styles.secondaryButton} href={reportsUrl}>
            <ArrowLeft aria-hidden />
            Буцах
          </a>
          <a className={styles.primaryButton} href={attachmentUrl}>
            <Download aria-hidden />
            PDF татах
          </a>
        </div>
      </div>
      <div className={styles.pdfViewerShell}>
        <iframe className={styles.pdfFrame} src={inlineUrl} title="HR PDF тайлан" />
      </div>
    </div>
  );
}
