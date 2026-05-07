"use client";

import { useEffect, useRef, useState } from "react";

import styles from "../hr.module.css";

type PdfViewerProps = {
  src: string;
};

export function PdfViewer({ src }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("PDF уншиж байна...");

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      const container = containerRef.current;
      if (!container) return;
      container.replaceChildren();
      setMessage("PDF уншиж байна...");

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const response = await fetch(src, { credentials: "include" });
        if (!response.ok) {
          throw new Error("PDF файл уншихад алдаа гарлаа.");
        }

        const data = await response.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const containerWidth = Math.max(320, container.clientWidth - 24);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(2, containerWidth / baseViewport.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("PDF canvas үүсгэхэд алдаа гарлаа.");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.className = styles.pdfCanvas;
          container.appendChild(canvas);

          await page.render({ canvas, canvasContext: context, viewport }).promise;
        }

        if (!cancelled) {
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "PDF харахад алдаа гарлаа.");
        }
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className={styles.pdfViewerShell}>
      {message ? <p className={styles.mutedText}>{message}</p> : null}
      <div ref={containerRef} className={styles.pdfCanvasStack} />
    </div>
  );
}
