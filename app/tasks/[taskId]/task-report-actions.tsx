"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { MediaUploadField } from "./media-upload-field";
import styles from "./task-detail.module.css";

type ReportAttachment = {
  id: number;
  name: string;
  url: string;
};

type Props = {
  taskId: number;
  reportId: number;
  reportText: string;
  reportedQuantity: number;
  images: ReportAttachment[];
  audios: ReportAttachment[];
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
};

type ParsedQuantityLine = {
  unit: string;
  quantity: string;
};

function parseReportDraft(reportText: string, reportedQuantity: number) {
  const lines = reportText.split(/\r?\n/);
  const quantityLines: ParsedQuantityLine[] = [];
  const bodyLines: string[] = [];
  let readingQuantities = false;
  let consumedQuantityHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!consumedQuantityHeader && /^Гүйцэтгэсэн хэмжээ:?$/i.test(trimmed)) {
      readingQuantities = true;
      consumedQuantityHeader = true;
      continue;
    }

    if (readingQuantities) {
      if (!trimmed) {
        readingQuantities = false;
        continue;
      }

      const quantityFirst = trimmed.match(/^\d+\.\s*(\d+(?:[.,]\d+)?)\s+(.+)$/);
      const unitFirst = trimmed.match(/^\d+\.\s*(.+?)\s+(\d+(?:[.,]\d+)?)$/);
      const match = quantityFirst ?? unitFirst;

      if (match) {
        quantityLines.push({
          quantity: (quantityFirst ? match[1] : match[2]).replace(",", "."),
          unit: (quantityFirst ? match[2] : match[1]).trim(),
        });
        continue;
      }

      readingQuantities = false;
    }

    bodyLines.push(line);
  }

  return {
    body: bodyLines.join("\n").trim(),
    quantityLines:
      quantityLines.length || !reportedQuantity
        ? quantityLines
        : [{ unit: "нэгж", quantity: String(reportedQuantity) }],
  };
}

export function TaskReportActions({
  taskId,
  reportId,
  reportText,
  reportedQuantity,
  images,
  audios,
  updateAction,
  deleteAction,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [removedImageIds, setRemovedImageIds] = useState<number[]>([]);
  const [removedAudioIds, setRemovedAudioIds] = useState<number[]>([]);
  const idPrefix = useId();
  const draft = useMemo(
    () => parseReportDraft(reportText, reportedQuantity),
    [reportText, reportedQuantity],
  );
  const visibleImages = images.filter((image) => !removedImageIds.includes(image.id));
  const visibleAudios = audios.filter((audio) => !removedAudioIds.includes(audio.id));

  const openEditModal = () => {
    setRemovedImageIds([]);
    setRemovedAudioIds([]);
    setIsEditing(true);
  };

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEditing(false);
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
  }, [isEditing]);

  const editModal =
    isEditing && typeof document !== "undefined"
      ? createPortal(
          <div className={styles.modalOverlay} role="presentation" onClick={() => setIsEditing(false)}>
            <div
              className={styles.modalDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${idPrefix}-title`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalTitleGroup}>
                  <span className={styles.kicker}>Гүйцэтгэлийн тайлан</span>
                  <strong className={styles.actionTitle} id={`${idPrefix}-title`}>
                    Тайлан засах
                  </strong>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseButton}
                  aria-label="Цонх хаах"
                  onClick={() => setIsEditing(false)}
                >
                  Хаах
                </button>
              </div>

              <form action={updateAction} className={styles.modalForm}>
                <input type="hidden" name="task_id" value={taskId} />
                <input type="hidden" name="report_id" value={reportId} />
                {removedImageIds.map((id) => (
                  <input key={`remove-image-${id}`} type="hidden" name="remove_image_attachment_ids" value={id} />
                ))}
                {removedAudioIds.map((id) => (
                  <input key={`remove-audio-${id}`} type="hidden" name="remove_audio_attachment_ids" value={id} />
                ))}

                <div className={styles.modalBodyGrid}>
                  <section className={styles.modalSectionCard}>
                    <div className={styles.composerHighlight}>
                      <strong>Өмнөх мэдээлэл</strong>
                    </div>

                    {draft.quantityLines.length ? (
                      <div className={styles.reportQuantityLines}>
                        <span className={styles.reportBodyLabel}>Гүйцэтгэсэн хэмжээ</span>
                        {draft.quantityLines.map((line, index) => (
                          <label key={`${line.unit}-${index}`} className={styles.modalField}>
                            <span>{line.unit}</span>
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
                    ) : (
                      <label className={styles.modalField}>
                        <span>Гүйцэтгэсэн хэмжээ</span>
                        <input
                          name="reported_quantity"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={reportedQuantity || ""}
                        />
                      </label>
                    )}

                    <label className={styles.modalField}>
                      <span>Тайлбар</span>
                      <textarea name="report_text" defaultValue={draft.body || reportText} required />
                    </label>
                  </section>

                  <section className={styles.modalSectionCard}>
                    <div className={styles.modalSectionHeading}>
                      <strong>Хавсралт засах</strong>
                    </div>

                    <div className={styles.existingAttachmentGroup}>
                      <strong>Одоо байгаа зураг</strong>
                      {visibleImages.length ? (
                        <div className={styles.editAttachmentList}>
                          {visibleImages.map((image) => (
                            <div key={image.id} className={styles.editAttachmentItem}>
                              <Image src={image.url} alt={image.name} width={96} height={70} />
                              <span>{image.name}</span>
                              <button
                                type="button"
                                className={styles.attachmentRemoveButton}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setRemovedImageIds((current) => Array.from(new Set([...current, image.id])));
                                }}
                              >
                                Устгах
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.fileEmptyState}>Зураг хавсаргаагүй байна.</p>
                      )}
                    </div>

                    <MediaUploadField
                      id={`${idPrefix}-report-before-images`}
                      name="report_before_images"
                      label="Өмнөх зураг нэмэх"
                      accept="image/*"
                      multiple
                      maxFiles={5}
                      emptyStateLabel="Шинэ өмнөх зураг сонгоогүй байна"
                    />

                    <MediaUploadField
                      id={`${idPrefix}-report-after-images`}
                      name="report_after_images"
                      label="Дараах зураг нэмэх"
                      accept="image/*"
                      multiple
                      maxFiles={5}
                      emptyStateLabel="Шинэ дараах зураг сонгоогүй байна"
                    />

                    <div className={styles.existingAttachmentGroup}>
                      <strong>Одоо байгаа аудио</strong>
                      {visibleAudios.length ? (
                        <div className={styles.editAttachmentList}>
                          {visibleAudios.map((audio) => (
                            <div key={audio.id} className={styles.editAttachmentItem}>
                              <span>{audio.name}</span>
                              <audio controls preload="none" src={audio.url} />
                              <button
                                type="button"
                                className={styles.attachmentRemoveButton}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setRemovedAudioIds((current) => Array.from(new Set([...current, audio.id])));
                                }}
                              >
                                Устгах
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.fileEmptyState}>Аудио хавсаргаагүй байна.</p>
                      )}
                    </div>

                    <MediaUploadField
                      id={`${idPrefix}-report-audios`}
                      name="report_audios"
                      label="Аудио нэмэх"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
                      multiple
                      emptyStateLabel="Шинэ аудио сонгоогүй байна"
                    />
                  </section>
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setIsEditing(false)}
                  >
                    Болих
                  </button>
                  <button type="submit" className={styles.actionButton}>
                    Хадгалах
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={styles.reportActions}>
      <button type="button" className={styles.secondaryButton} onClick={openEditModal}>
        Засах
      </button>
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!window.confirm("Энэ тайланг устгах уу?")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="task_id" value={taskId} />
        <input type="hidden" name="report_id" value={reportId} />
        <button type="submit" className={styles.warningButton}>
          Устгах
        </button>
      </form>
      {editModal}
    </div>
  );
}
