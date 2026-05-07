"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";

import styles from "../../../hr.module.css";

type PdfJsModule = typeof import("pdfjs-dist");

type RenderTask = {
  promise: Promise<void>;
  cancel: () => void;
};

function attachmentUrl(url: string) {
  const nextUrl = new URL(url, window.location.origin);
  nextUrl.searchParams.set("disposition", "attachment");
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}

function fileNameFromDisposition(value: string | null) {
  const fallback = "hr-report.pdf";
  if (!value) return fallback;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const quotedMatch = value.match(/filename="?([^";]+)"?/i);
  return quotedMatch?.[1] || fallback;
}

async function loadPdfJs(): Promise<PdfJsModule> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

export function HrReportPdfViewer({ downloadUrl, reportsUrl }: { downloadUrl: string; reportsUrl: string }) {
  const canvasStackRef = useRef<HTMLDivElement | null>(null);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const fileNameRef = useRef("hr-report.pdf");
  const [status, setStatus] = useState("PDF тайлан уншиж байна...");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const renderTasks: RenderTask[] = [];

    async function loadAndRender() {
      setStatus("PDF тайлан уншиж байна...");
      setError("");
      setReady(false);
      try {
        const response = await fetch(attachmentUrl(downloadUrl), { cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || `PDF уншихад HTTP ${response.status} алдаа гарлаа.`);
        }
        fileNameRef.current = fileNameFromDisposition(response.headers.get("Content-Disposition"));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) {
          throw new Error("PDF файл хоосон байна.");
        }
        pdfBytesRef.current = bytes;
        const pdfjs = await loadPdfJs();
        const documentTask = pdfjs.getDocument({ data: bytes.slice() });
        const pdf = await documentTask.promise;
        if (cancelled || !canvasStackRef.current) return;
        canvasStackRef.current.innerHTML = "";

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled || !canvasStackRef.current) return;
          const viewport = page.getViewport({ scale: Math.min(1.35, window.innerWidth / 920) });
          const canvas = document.createElement("canvas");
          canvas.className = styles.pdfCanvas;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvasStackRef.current.appendChild(canvas);
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("PDF canvas үүсгэж чадсангүй.");
          }
          const renderTask = page.render({ canvas, canvasContext: context, viewport }) as RenderTask;
          renderTasks.push(renderTask);
          await renderTask.promise;
        }

        if (!cancelled) {
          setReady(true);
          setStatus(`${pdf.numPages} хуудастай PDF тайлан нээгдлээ.`);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "PDF тайлан нээхэд алдаа гарлаа.");
          setStatus("");
        }
      }
    }

    loadAndRender();
    return () => {
      cancelled = true;
      for (const task of renderTasks) {
        task.cancel();
      }
    };
  }, [downloadUrl]);

  async function downloadPdf() {
    try {
      let bytes = pdfBytesRef.current;
      if (!bytes) {
        const response = await fetch(attachmentUrl(downloadUrl), { cache: "no-store" });
        if (!response.ok) throw new Error(`PDF татахад HTTP ${response.status} алдаа гарлаа.`);
        fileNameRef.current = fileNameFromDisposition(response.headers.get("Content-Disposition"));
        bytes = new Uint8Array(await response.arrayBuffer());
        pdfBytesRef.current = bytes;
      }
      const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameRef.current;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "PDF татахад алдаа гарлаа.");
    }
  }

  return (
    <div className={styles.reportViewer}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>PDF тайлан</h2>
          <p>{status || "PDF тайлан"}</p>
        </div>
        <div className={styles.recordActions}>
          <a className={styles.secondaryButton} href={reportsUrl}>
            <ArrowLeft aria-hidden />
            Буцах
          </a>
          <button className={styles.primaryButton} type="button" onClick={downloadPdf} disabled={!ready && !pdfBytesRef.current}>
            <Download aria-hidden />
            PDF татах
          </button>
        </div>
      </div>
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {!ready && !error ? (
        <div className={styles.inlineLoading} role="status" aria-live="polite">
          <span className={styles.loadingSpinner} aria-hidden />
          <strong>PDF тайлан нээж байна</strong>
          <p>Файлыг уншаад хуудас бүрийг app дотор зурж байна.</p>
        </div>
      ) : null}
      <div ref={canvasStackRef} className={styles.pdfCanvasStack} />
    </div>
  );
}
