"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, FolderPen, UserCheck } from "lucide-react";

import { SearchableSelect, type SearchableSelectOption } from "@/app/_components/searchable-select";
import styles from "@/app/workspace.module.css";
import type { DepartmentOption, SelectOption } from "@/lib/workspace";
import { formatEmployeeMeta } from "@/lib/employee-label";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  projectId: number;
  name: string;
  managerId: number | null;
  departmentId: number | null;
  startDate: string;
  deadline: string;
  description: string;
  managerOptions: SelectOption[];
  departmentOptions: DepartmentOption[];
  canEditDepartment?: boolean;
};

function buildManagerOptions(users: SelectOption[]): SearchableSelectOption[] {
  return users.map((user) => ({
    id: user.id,
    label: user.name,
    meta: formatEmployeeMeta(user.jobTitle, user.departmentName),
    keywords: [user.name, user.jobTitle ?? "", user.departmentName ?? "", user.login, user.phone ?? ""],
  }));
}

function buildDepartmentOptions(departments: DepartmentOption[]): SearchableSelectOption[] {
  return departments.map((department) => ({
    id: department.id,
    label: department.name,
    meta: department.label,
    keywords: [department.name, department.label],
  }));
}

export function ProjectEditModal({
  action,
  projectId,
  name,
  managerId,
  departmentId,
  startDate,
  deadline,
  description,
  managerOptions,
  departmentOptions,
  canEditDepartment = true,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(managerId);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(departmentId);
  const [editedStartDate, setEditedStartDate] = useState(startDate);
  const [editedDeadline, setEditedDeadline] = useState(deadline);
  const [editedDescription, setEditedDescription] = useState(description);

  const managerSelectOptions = useMemo(() => buildManagerOptions(managerOptions), [managerOptions]);
  const departmentSelectOptions = useMemo(() => buildDepartmentOptions(departmentOptions), [departmentOptions]);

  const openModal = () => {
    setEditedName(name);
    setSelectedManagerId(managerId);
    setSelectedDepartmentId(departmentId);
    setEditedStartDate(startDate);
    setEditedDeadline(deadline);
    setEditedDescription(description);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const modalContent =
    isOpen
      ? (
          <div className={styles.modalOverlay} role="presentation">
            <div className={styles.modalDialog} role="dialog" aria-modal="true" aria-label="Ажил засах">
              <div className={styles.modalHeader}>
                <div className={styles.modalTitleGroup}>
                  <span className={styles.eyebrow}>Ажил засах</span>
                  <strong className={styles.modalTitle}>Ажлын үндсэн мэдээлэл</strong>
                  <p className={styles.modalLead}>Нэр, хариуцсан хүн, хугацаа болон тайлбарыг шинэчилнэ.</p>
                </div>
                <button type="button" className={styles.modalCloseButton} onClick={() => setIsOpen(false)}>
                  Хаах
                </button>
              </div>

              <form action={action} className={styles.modalForm}>
                <input type="hidden" name="project_id" value={projectId} />
                <section className={`${styles.taskCreateStepPanel} ${styles.taskCreateStepActive}`}>
                  <div className={styles.taskCreateSectionHeader}>
                    <FolderPen aria-hidden />
                    <div>
                      <strong>Ажлын мэдээлэл</strong>
                      <p>Жагсаалт, dashboard болон тайлан дээр харагдах үндсэн мэдээлэл.</p>
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="edit-project-name">Ажлын нэр</label>
                    <input
                      id="edit-project-name"
                      name="name"
                      value={editedName}
                      onChange={(event) => setEditedName(event.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label>Хариуцсан хүн</label>
                      <SearchableSelect
                        name="manager_id"
                        value={selectedManagerId}
                        options={managerSelectOptions}
                        placeholder="Хариуцсан хүн сонгоно уу"
                        searchPlaceholder="Ажилтан хайна уу"
                        emptyStateLabel="Тохирох ажилтан олдсонгүй."
                        onChange={setSelectedManagerId}
                      />
                    </div>

                    <div className={styles.field}>
                      <label>Хэлтэс</label>
                      {canEditDepartment ? (
                        <SearchableSelect
                          name="department_id"
                          value={selectedDepartmentId}
                          options={departmentSelectOptions}
                          placeholder="Хэлтэс сонгоно уу"
                          searchPlaceholder="Хэлтэс хайна уу"
                          emptyStateLabel="Тохирох хэлтэс олдсонгүй."
                          onChange={setSelectedDepartmentId}
                        />
                      ) : (
                        <>
                          <input type="hidden" name="department_id" value={selectedDepartmentId ?? ""} />
                          <div className={styles.lockedFieldValue}>
                            {departmentOptions.find((item) => item.id === selectedDepartmentId)?.name ||
                              "Хэлтэс өөрчлөх боломжгүй"}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </section>

                <section className={`${styles.taskCreateStepPanel} ${styles.taskCreateStepActive}`}>
                  <div className={styles.taskCreateSectionHeader}>
                    <CalendarDays aria-hidden />
                    <div>
                      <strong>Хугацаа</strong>
                      <p>Ажлын эхлэх болон дуусах огноог засна.</p>
                    </div>
                  </div>

                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="edit-project-start-date">Эхлэх огноо</label>
                      <input
                        id="edit-project-start-date"
                        name="start_date"
                        type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10}
                        value={editedStartDate}
                        onChange={(event) => setEditedStartDate(event.target.value)}
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="edit-project-deadline">Дуусах огноо</label>
                      <input
                        id="edit-project-deadline"
                        name="deadline"
                        type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10}
                        value={editedDeadline}
                        onChange={(event) => setEditedDeadline(event.target.value)}
                      />
                    </div>
                  </div>
                </section>

                <section className={`${styles.taskCreateStepPanel} ${styles.taskCreateStepActive}`}>
                  <div className={styles.taskCreateSectionHeader}>
                    <FileText aria-hidden />
                    <div>
                      <strong>Тайлбар</strong>
                      <p>Ажлын хүрээ, байршил, онцгой зааврыг шинэчилнэ.</p>
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="edit-project-description">Товч тайлбар</label>
                    <textarea
                      id="edit-project-description"
                      name="description"
                      value={editedDescription}
                      onChange={(event) => setEditedDescription(event.target.value)}
                    />
                  </div>
                </section>

                <div className={styles.modalActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setIsOpen(false)}>
                    Засвар цуцлах
                  </button>
                  <button type="submit" className={styles.primaryButton}>
                    Ажлын өөрчлөлт хадгалах
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      : null;

  return (
    <>
      <button type="button" className={styles.secondaryButton} onClick={openModal}>
        <UserCheck size={17} strokeWidth={2.4} aria-hidden />
        Ажил засах
      </button>
      {modalContent}
    </>
  );
}
