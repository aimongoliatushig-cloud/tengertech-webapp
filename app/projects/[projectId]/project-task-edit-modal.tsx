"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import styles from "@/app/workspace.module.css";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  projectId: number;
  taskId: number;
  taskName: string;
  deadlineValue: string;
};

export function ProjectTaskEditModal({
  action,
  projectId,
  taskId,
  taskName,
  deadlineValue,
}: Props) {
  const titleId = useId();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
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
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const portalTarget = isMounted ? document.body : null;
  const modalContent =
    portalTarget && isOpen
      ? createPortal(
          <div
            className={styles.modalOverlay}
            role="presentation"
            onClick={() => setIsOpen(false)}
          >
            <div
              className={`${styles.modalDialog} ${styles.taskEditModalDialog}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalTitleGroup}>
                  <span className={styles.eyebrow}>Ажилбар засах</span>
                  <strong className={styles.modalTitle} id={titleId}>
                    Ажилбар засах
                  </strong>
                  <p className={styles.modalLead}>
                    Тухайн ажилбарын мэдээллийг шинэчилнэ.
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
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="task_id" value={taskId} />

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label>Одоогийн ажилбар</label>
                    <div className={styles.lockedFieldValue}>{taskName}</div>
                  </div>

                  <div className={styles.field}>
                    <label>Засах төрөл</label>
                    <div className={styles.lockedFieldValue}>Нэр, дуусах огноо</div>
                  </div>
                </div>

                <label className={styles.field}>
                  <span>Ажилбарын нэр</span>
                  <input name="name" defaultValue={taskName} required />
                </label>

                <label className={styles.field}>
                  <span>Дуусах огноо</span>
                  <input name="deadline" type="date" defaultValue={deadlineValue} />
                </label>

                <div className={styles.modalActions}>
                  <button type="submit" className={styles.primaryButton}>
                    Хадгалах
                  </button>
                </div>
              </form>
            </div>
          </div>,
          portalTarget,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={() => setIsOpen(true)}
      >
        Засах
      </button>
      {modalContent}
    </>
  );
}
