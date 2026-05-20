"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import styles from "@/app/workspace.module.css";
import type { SelectOption, WorkUnitOption } from "@/lib/workspace";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  projectId: number;
  taskId: number;
  taskName: string;
  teamLeaderId: number | null;
  crewTeamId: number | null;
  startDateValue: string;
  deadlineValue: string;
  plannedQuantity: number;
  measurementUnitId: number | null;
  description: string;
  departmentUserOptions: SelectOption[];
  crewTeamOptions: Array<{
    id: number;
    label: string;
  }>;
  unitOptions: WorkUnitOption[];
};

export function ProjectTaskEditModal({
  action,
  projectId,
  taskId,
  taskName,
  teamLeaderId,
  crewTeamId,
  startDateValue,
  deadlineValue,
  plannedQuantity,
  measurementUnitId,
  description,
  departmentUserOptions,
  crewTeamOptions,
  unitOptions,
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
                  <span className={styles.eyebrow}>Даалгавар засах</span>
                  <strong className={styles.modalTitle} id={titleId}>
                    Даалгавар засах
                  </strong>
                  <p className={styles.modalLead}>
                    Тухайн даалгаврын мэдээллийг шинэчилнэ.
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
                    <label>Одоогийн даалгавар</label>
                    <div className={styles.lockedFieldValue}>{taskName}</div>
                  </div>

                  <div className={styles.field}>
                    <label>Даалгаврын дугаар</label>
                    <div className={styles.lockedFieldValue}>#{taskId}</div>
                  </div>
                </div>

                <label className={styles.field}>
                  <span>Даалгаврын нэр</span>
                  <input name="name" defaultValue={taskName} required />
                </label>

                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span>Хариуцсан ажилтан</span>
                    <select name="team_leader_id" defaultValue={teamLeaderId ?? ""}>
                      <option value="">Сонгоогүй</option>
                      {departmentUserOptions.map((user) => (
                        <option key={user.id} value={user.id}>
                          {[user.name, user.jobTitle].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Баг</span>
                    <select name="crew_team_id" defaultValue={crewTeamId ?? ""}>
                      <option value="">Баг сонгохгүй</option>
                      {crewTeamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span>Эхлэх огноо</span>
                    <input name="start_date" type="date" defaultValue={startDateValue} />
                  </label>

                  <label className={styles.field}>
                    <span>Дуусах огноо</span>
                    <input name="deadline" type="date" defaultValue={deadlineValue} />
                  </label>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span>Төлөвлөсөн хэмжээ</span>
                    <input
                      name="planned_quantity"
                      type="number"
                      min="0.01"
                      step="0.01"
                      defaultValue={plannedQuantity > 0 ? plannedQuantity : ""}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Хэмжих нэгж</span>
                    <select name="unit_id" defaultValue={measurementUnitId ?? ""}>
                      <option value="">Нэгж сонгохгүй</option>
                      {unitOptions.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {[unit.name, unit.code].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Товч тайлбар</span>
                  <textarea name="description" defaultValue={description} />
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
