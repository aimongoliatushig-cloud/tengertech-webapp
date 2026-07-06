"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ImageIcon, X } from "lucide-react";

import styles from "./report-download-modal.module.css";

type ReportImage = { id: number; url: string; name: string };
type ReportGroup = { name: string; images: ReportImage[] };

export function ReportDownloadModal({
  reports,
  hrefs,
}: {
  reports: ReportGroup[];
  hrefs: { word: string; pdf: string; excel: string };
}) {
  const allIds = useMemo(() => reports.flatMap((report) => report.images.map((image) => image.id)), [reports]);
  const groupsWithImages = useMemo(() => reports.filter((report) => report.images.length > 0), [reports]);
  const totalImages = allIds.length;

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(allIds));
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Нээх бүрт бүх зургийг сонгосон байдлаар эхэлнэ
  const openModal = () => {
    setSelected(new Set(allIds));
    setOpen(true);
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const imageSuffix = totalImages > 0 && selected.size > 0 ? `&imageIds=${[...selected].join(",")}` : "";
  const noteSuffix = note.trim() ? `&note=${encodeURIComponent(note.trim())}` : "";
  const suffix = `${imageSuffix}${noteSuffix}`;

  const modal =
    open
      ? createPortal(
          <div className={styles.overlay} role="presentation" onClick={() => setOpen(false)}>
            <div className={styles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <header className={styles.head}>
                <strong>Тайлан татах</strong>
                <button type="button" aria-label="Хаах" onClick={() => setOpen(false)}>
                  <X size={20} strokeWidth={2.4} aria-hidden />
                </button>
              </header>

              {totalImages > 0 ? (
                <>
                  <div className={styles.toolbar}>
                    <span>
                      Тайланд оруулах зургийг сонгоно уу — <strong>{selected.size}</strong> / {totalImages} сонгосон
                    </span>
                    <div className={styles.toolbarActions}>
                      <button type="button" onClick={() => setSelected(new Set(allIds))}>
                        Бүгдийг сонгох
                      </button>
                      <button type="button" onClick={() => setSelected(new Set())}>
                        Цэвэрлэх
                      </button>
                    </div>
                  </div>

                  <div className={styles.body}>
                    {groupsWithImages.map((report, index) => (
                      <section key={`${report.name}-${index}`} className={styles.group}>
                        <h4>{report.name}</h4>
                        <div className={styles.grid}>
                          {report.images.map((image) => {
                            const isSelected = selected.has(image.id);
                            return (
                              <figure
                                key={image.id}
                                className={`${styles.tile} ${isSelected ? styles.tileSelected : ""}`}
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelected}
                                onClick={() => toggle(image.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggle(image.id);
                                  }
                                }}
                              >
                                <span className={styles.check}>
                                  <input type="checkbox" checked={isSelected} readOnly tabIndex={-1} aria-hidden />
                                </span>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={image.url} alt={image.name} />
                                {isSelected ? <span className={styles.badge}>✓</span> : null}
                              </figure>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.empty}>
                  Энэ шүүлтэд хамаарах тайлангуудад хавсаргасан зураг алга. Зураггүй тайланг доороос татаж болно.
                </div>
              )}

              <div style={{ padding: "0 20px 4px" }}>
                <label
                  htmlFor="report-note"
                  style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink-900)", marginBottom: 6 }}
                >
                  Тайлангийн дүгнэлт / тайлбар (заавал биш)
                </label>
                <textarea
                  id="report-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Тайлангийн товч дүгнэлт, тайлбар бичвэл гаргасан баримтад орно."
                  style={{
                    width: "100%",
                    resize: "vertical",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--ds-border)",
                    background: "var(--surface-panel)",
                    color: "var(--ink-900)",
                    font: "inherit",
                  }}
                />
              </div>

              <footer className={styles.foot}>
                <a className={styles.primary} href={`${hrefs.word}${suffix}`}>
                  <Download size={16} strokeWidth={2.4} aria-hidden /> Word татах
                </a>
                <a href={`${hrefs.pdf}${suffix}`}>
                  <Download size={16} strokeWidth={2.4} aria-hidden /> PDF татах
                </a>
                <a href={`${hrefs.excel}${noteSuffix}`}>
                  <Download size={16} strokeWidth={2.4} aria-hidden /> Excel татах
                </a>
                <button type="button" className={styles.cancel} onClick={() => setOpen(false)}>
                  Болих
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button type="button" className={styles.trigger} onClick={openModal}>
        <ImageIcon size={16} strokeWidth={2.4} aria-hidden />
        Тайлан татах
      </button>
      {modal}
    </>
  );
}
