"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import styles from "@/app/workspace.module.css";
import type { SelectOption, WorkUnitOption } from "@/lib/workspace";

import { ProjectTaskCreateForm } from "./project-task-create-form";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  projectId: number;
  departmentName: string;
  departmentHeadName: string;
  departmentHeadId: number | null;
  deadline: string;
  masterMode: boolean;
  departmentUserOptions: SelectOption[];
  crewTeamOptions: Array<{
    id: number;
    label: string;
  }>;
  allUnitOptions: WorkUnitOption[];
  defaultUnitId: number | null;
  allowedUnitSummary?: string;
  defaultOpen?: boolean;
};

export function ProjectTaskCreateModal({
  action,
  projectId,
  departmentName,
  departmentHeadName,
  departmentHeadId,
  deadline,
  masterMode,
  departmentUserOptions,
  crewTeamOptions,
  allUnitOptions,
  defaultUnitId,
  allowedUnitSummary,
  defaultOpen = false,
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsMounted(true);
      if (defaultOpen || window.location.hash === "#task-create-form") {
        setIsOpen(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [defaultOpen]);

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
              className={styles.modalDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-task-create-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalTitleGroup}>
                  <span className={styles.eyebrow}>Шинэ даалгавар</span>
                  <strong className={styles.modalTitle} id="project-task-create-title">
                    {masterMode ? "Өнөөдрийн даалгавар нэмэх" : "Даалгавар үүсгэх"}
                  </strong>
                  <p className={styles.modalLead}>
                    Ажлын төрлөөс зөвшөөрөгдсөн хэмжих нэгжүүдээр шүүгдсэн хэлбэрээр шинэ
                    даалгавар бүртгэнэ.
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

              <ProjectTaskCreateForm
                action={action}
                className={styles.modalForm}
                footerClassName={styles.modalActions}
                projectId={projectId}
                departmentName={departmentName}
                departmentHeadName={departmentHeadName}
                departmentHeadId={departmentHeadId}
                deadline={deadline}
                departmentUserOptions={departmentUserOptions}
                crewTeamOptions={crewTeamOptions}
                allUnitOptions={allUnitOptions}
                defaultUnitId={defaultUnitId}
                allowedUnitSummary={allowedUnitSummary}
              />
            </div>
          </div>,
          portalTarget,
        )
      : null;

  return (
    <>
      <div id="task-create-form" className={styles.createTaskTriggerWrap}>
        <button
          type="button"
          className={`${styles.primaryButton} ${styles.createTaskTrigger}`}
          onClick={() => setIsOpen(true)}
        >
          Даалгавар нэмэх
        </button>
      </div>
      {modalContent}
    </>
  );
}
