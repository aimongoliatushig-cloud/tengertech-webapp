"use client";

import { useMemo, useState, useTransition } from "react";

import styles from "./task-detail.module.css";

type ExportType = "word" | "pdf";

type WorkItemOption = {
  id: number;
  title: string;
  reporter: string;
  submittedAt: string;
  summary: string;
};

type Props = {
  taskId: number;
  items: WorkItemOption[];
};

function downloadBlob(blob: Blob, fallbackFileName: string, response: Response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileNameMatch = disposition.match(/filename="([^"]+)"/i);
  const fileName = fileNameMatch?.[1] || fallbackFileName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function OfficialReportExportModal({ taskId, items }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>(() => items.map((item) => item.id));
  const [activeExportType, setActiveExportType] = useState<ExportType>("word");
  const [loadingType, setLoadingType] = useState<ExportType | null>(null);
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();
  const selectedCount = selectedIds.length;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const openModal = (type: ExportType) => {
    setActiveExportType(type);
    setMessage("");
    setIsOpen(true);
  };

  const toggleItem = (id: number) => {
    setMessage("");
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  };

  const exportReport = (type: ExportType) => {
    if (!selectedIds.length) {
      setMessage("Тайланд оруулах ажилбар сонгоно уу.");
      return;
    }

    setMessage("");
    setLoadingType(type);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/export-${type}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedWorkItemIds: selectedIds,
            exportType: type,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Тайлан үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.");
        }

        const blob = await response.blob();
        downloadBlob(blob, `iltgeh_huudas_task_${taskId}.${type === "word" ? "docx" : "pdf"}`, response);
        setIsOpen(false);
      } catch {
        setMessage("Тайлан үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.");
      } finally {
        setLoadingType(null);
      }
    });
  };

  return (
    <>
      <button type="button" className={styles.anchorLink} onClick={() => openModal("word")}>
        Word татах
      </button>
      <button type="button" className={styles.anchorLink} onClick={() => openModal("pdf")}>
        PDF хэвлэх
      </button>

      {isOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={`${styles.modalDialog} ${styles.officialReportModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="official-report-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.kicker}>ИЛТГЭХ ХУУДАС</span>
                <h2 id="official-report-title">Тайланд оруулах ажилбар сонгох</h2>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setIsOpen(false)}
              >
                Цуцлах
              </button>
            </div>

            <div className={styles.reportSelectToolbar}>
              <strong>Сонгосон ажилбар: {selectedCount}</strong>
              <div className={styles.reportSelectActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setMessage("");
                    setSelectedIds(items.map((item) => item.id));
                  }}
                >
                  Бүгдийг сонгох
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setMessage("");
                    setSelectedIds([]);
                  }}
                >
                  Сонголтыг арилгах
                </button>
              </div>
            </div>

            {message ? <p className={styles.modalError}>{message}</p> : null}

            <div className={styles.workItemSelectList}>
              {items.length ? (
                items.map((item) => (
                  <label key={item.id} className={styles.workItemSelectCard}>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.reporter} · {item.submittedAt}
                      </small>
                      {item.summary ? <em>{item.summary}</em> : null}
                    </span>
                  </label>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <h2>Ажилбар олдсонгүй</h2>
                  <p>Энэ ажил дээр тайланд оруулах ажилбар бүртгэгдээгүй байна.</p>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setIsOpen(false)}
              >
                Цуцлах
              </button>
              <button
                type="button"
                className={
                  activeExportType === "word" ? styles.actionButton : styles.secondaryButton
                }
                disabled={loadingType !== null}
                onClick={() => exportReport("word")}
              >
                {loadingType === "word" ? "Бэлтгэж байна..." : "Word татах"}
              </button>
              <button
                type="button"
                className={activeExportType === "pdf" ? styles.actionButton : styles.secondaryButton}
                disabled={loadingType !== null}
                onClick={() => exportReport("pdf")}
              >
                {loadingType === "pdf" ? "Бэлтгэж байна..." : "PDF хэвлэх"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
