"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { MediaUploadField } from "./media-upload-field";
import styles from "./task-detail.module.css";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  taskId: number;
  defaultOpen?: boolean;
  quantityOptional?: boolean;
  measurementUnit?: string;
};

export function TaskReportModal({
  action,
  taskId,
  defaultOpen = false,
  measurementUnit,
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
                    Гүйцэтгэлийн тайлан оруулах
                  </strong>
                  <p className={styles.actionLead}>
                    Тайлангийн тоо хэмжээг заавал 0-ээс их утгаар оруулж, текст тайлан, зураг,
                    аудиог нэг дор бүртгэнэ.
                  </p>
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
                      <strong>Текст тайлан</strong>
                      <p className={styles.composerHint}>
                        Хийсэн ажлаа товч, тодорхой бичнэ. Доорх тоо хэмжээ нь master-data
                        хэмжих нэгжтэй автоматаар холбогдоно.
                      </p>
                    </div>

                    <label htmlFor="reported_quantity" className={styles.modalField}>
                      <span>{quantityLabel}</span>
                      <input
                        id="reported_quantity"
                        name="reported_quantity"
                        type="number"
                        step="0.01"
                        min="0.01"
                        inputMode="decimal"
                        placeholder="Жишээ: 12"
                        required
                      />
                      <small className={styles.inputHint}>
                        Гүйцэтгэсэн хэмжээ 0-ээс их байх ёстой.
                      </small>
                    </label>

                    <label htmlFor="report_text" className={styles.modalField}>
                      <span>Текст тайлан</span>
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
                      <small className={styles.inputHint}>
                        Зураг, аудиог хүссэн тоогоороо нэмээд тайлангаа илүү ойлгомжтой болгож
                        болно.
                      </small>
                    </div>

                    <MediaUploadField
                      id="report_images"
                      name="report_images"
                      label="Зураг"
                      accept="image/*"
                      multiple
                      emptyStateLabel="Зураг сонгоогүй байна"
                      helperText="Ажлын явц, өмнөх болон дараах байдлыг зургаар хавсаргаж болно."
                    />

                    <MediaUploadField
                      id="report_audios"
                      name="report_audios"
                      label="Аудио"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
                      multiple
                      emptyStateLabel="Аудио файл сонгоогүй байна"
                      helperText="Товч дуут тайлбар, орчны нөхцөл болон саадыг аудиогоор хавсаргаж болно."
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
                    Гүйцэтгэлийн тайлан оруулах
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
      <button type="button" className={styles.actionButton} onClick={() => setIsOpen(true)}>
        Гүйцэтгэлийн тайлан оруулах
      </button>
      {modalContent}
    </>
  );
}
