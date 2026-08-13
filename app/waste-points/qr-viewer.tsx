"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink, Printer } from "lucide-react";

import styles from "./waste-points.module.css";

// API-аас ирэх qrCode нь Base64 PNG (data URI-гүй) байж болно — img-д тавихын
// өмнө data URI болгож хэвийн болгоно.
export function toQrSrc(qrCode: string): string {
  const value = (qrCode || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return "";
  if (value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}

export function QrViewer({ code, qrCode, name }: { code: string; qrCode: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const src = toQrSrc(qrCode);
  const smartCleanUrl = /^https?:\/\//i.test(qrCode) ? qrCode : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = src;
    link.download = `${code}-qr.${src.includes("image/svg") ? "svg" : "png"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(
      `<html><head><title>${code}</title><style>` +
        `body{font-family:Arial,sans-serif;text-align:center;padding:24px}` +
        `img{width:280px;height:280px}` +
        `h1{font-size:16px;margin:12px 0 4px}p{font-size:13px;color:#555;margin:0}` +
        `</style></head><body>` +
        `<img src="${src}" alt="QR"/><h1>${code}</h1><p>${name}</p>` +
        `</body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  if (smartCleanUrl) {
    return (
      <div className={styles.qrCard}>
        <span className={styles.qrCode}>{code}</span>
        <p className={styles.empty}>Smart Clean UB системийн QR холбоос бүртгэгдсэн.</p>
        <div className={styles.qrActions}>
          <a className={`${styles.button} ${styles.buttonPrimary}`} href={smartCleanUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden /> Smart Clean QR нээх
          </a>
          <button type="button" className={styles.button} onClick={async () => {
            try {
              await navigator.clipboard.writeText(smartCleanUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            } catch { setCopied(false); }
          }}>
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "Хуулсан" : "Холбоос хуулах"}
          </button>
        </div>
      </div>
    );
  }

  if (!src) {
    return <p className={styles.empty}>QR код бүртгэгдээгүй байна.</p>;
  }

  return (
    <div className={styles.qrCard}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.qrImage} src={src} alt={`${code} QR код`} />
      <span className={styles.qrCode}>{code}</span>
      <div className={styles.qrActions}>
        <button type="button" className={styles.button} onClick={handleDownload}>
          <Download size={15} aria-hidden /> Татах
        </button>
        <button type="button" className={styles.button} onClick={handlePrint}>
          <Printer size={15} aria-hidden /> Хэвлэх
        </button>
        <button type="button" className={styles.button} onClick={handleCopy}>
          {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          {copied ? "Хуулсан" : "Код хуулах"}
        </button>
      </div>
    </div>
  );
}
