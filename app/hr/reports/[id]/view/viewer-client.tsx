"use client";

import { useEffect, useState } from "react";
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
  const [pdfUrl, setPdfUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";

    async function loadPdf() {
      setErrorMessage("");
      setPdfUrl("");
      try {
        const response = await fetch(inlineUrl, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`PDF тайлан нээхэд HTTP ${response.status} алдаа гарлаа.`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(error instanceof Error ? error.message : "PDF тайлан нээхэд алдаа гарлаа.");
        }
      }
    }

    loadPdf();

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [inlineUrl]);

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
        {pdfUrl ? (
          <iframe className={styles.pdfFrame} src={pdfUrl} title="HR PDF тайлан" />
        ) : (
          <div className={styles.pdfFrameStatus} role={errorMessage ? "alert" : "status"}>
            <p>{errorMessage || "PDF тайлан ачаалж байна..."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
