"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { MediaUploadField } from "./media-upload-field";
import styles from "./task-detail.module.css";
import type { TaskQuantityLine } from "@/lib/workspace";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  taskId: number;
  defaultOpen?: boolean;
  quantityOptional?: boolean;
  measurementUnit?: string;
  quantityLines?: TaskQuantityLine[];
  variant?: "default" | "hero";
  requireQuantity?: boolean;
};

export function TaskReportModal({
  action,
  taskId,
  defaultOpen = false,
  quantityOptional = false,
  measurementUnit,
  quantityLines = [],
  variant = "default",
  requireQuantity,
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const hasMultipleQuantityLines = quantityLines.length > 1;
  const shouldShowQuantity =
    !hasMultipleQuantityLines &&
    (requireQuantity ?? (!quantityOptional && Boolean(measurementUnit?.trim())));
  const quantityLabel = `Хийсэн хэмжээ${measurementUnit ? ` (${measurementUnit})` : ""}`;

  const modalContent =
    mounted && isOpen
      ? createPortal(
          <div className={styles.modalOverlay} role="presentation" onClick={() => setIsOpen(false)}>
            <div
              className={styles.modalDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-report-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalTitleGroup}>
                  <span className={styles.kicker}>Гүйцэтгэлийн тайлан</span>
                  <strong className={styles.actionTitle} id="task-report-modal-title">
                    Тайлан оруулах
                  </strong>
                </div>

                <button
                  type="button"
                  className={styles.modalCloseButton}
                  aria-label="Цонх хаах"
                  onClick={() => setIsOpen(false)}
                >
                  Хаах
                </button>
              </div>

              <form action={action} className={styles.modalForm}>
                <input type="hidden" name="task_id" value={taskId} />

                <div className={styles.modalBodyGrid}>
                  <section className={styles.modalSectionCard}>
                    <div className={styles.composerHighlight}>
                      <strong>Тайлан</strong>
                    </div>

                    {hasMultipleQuantityLines ? (
                      <div className={styles.reportQuantityLines}>
                        <span className={styles.reportBodyLabel}>Хийсэн хэмжээ</span>
                        {quantityLines.map((line, index) => (
                          <label key={`${line.unit}-${index}`} className={styles.modalField}>
                            <span>
                              {line.unit} · төлөвлөсөн {line.quantity}
                            </span>
                            <input
                              name="reported_quantity_line"
                              type="number"
                              step="0.01"
                              min="0"
                              inputMode="decimal"
                              defaultValue={line.quantity}
                            />
                            <input type="hidden" name="reported_quantity_unit" value={line.unit} />
                          </label>
                        ))}
                      </div>
                    ) : shouldShowQuantity ? (
                      <label htmlFor="reported_quantity" className={styles.modalField}>
                        <span>{quantityLabel}</span>
                        <input
                          id="reported_quantity"
                          name="reported_quantity"
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          placeholder="Заавал биш"
                        />
                      </label>
                    ) : null}

                    <label htmlFor="report_text" className={styles.modalField}>
                      <span>Тайлбар</span>
                      <textarea
                        id="report_text"
                        name="report_text"
                        placeholder="Юу хийсэн, ямар саад гарсан, дараагийн алхам юу болохыг товч бичнэ үү"
                        required
                      />
                    </label>
                  </section>

                  <section className={styles.modalSectionCard}>
                    <div className={styles.modalSectionHeading}>
                      <strong>Хавсралт</strong>
                    </div>

                    <MediaUploadField
                      id="report_images"
                      name="report_images"
                      label="Зураг"
                      accept="image/*"
                      multiple
                      maxFiles={10}
                      emptyStateLabel="Зураг сонгоогүй байна"
                    />

                    <MediaUploadField
                      id="report_audios"
                      name="report_audios"
                      label="Аудио"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
                      multiple
                      emptyStateLabel="Аудио файл сонгоогүй байна"
                    />
                  </section>
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setIsOpen(false)}
                  >
                    Болих
                  </button>
                  <button type="submit" className={styles.actionButton}>
                    Тайлан илгээх
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={variant === "hero" ? styles.heroReportButton : styles.actionButton}
        onClick={() => setIsOpen(true)}
      >
        Тайлан оруулах
      </button>
      {modalContent}
    </>
  );
}
