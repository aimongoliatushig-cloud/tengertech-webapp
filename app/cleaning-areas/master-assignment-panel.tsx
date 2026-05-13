"use client";

import { useMemo, useState } from "react";

import styles from "@/app/workspace.module.css";

type MasterOption = {
  id: number;
  name: string;
  jobTitle: string;
  departmentName: string;
  assignedEmployeeIds: number[];
};

type CleanerOption = {
  id: number;
  name: string;
  jobTitle: string;
  areaCount: number;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  workDate: string;
  masters: MasterOption[];
  cleaners: CleanerOption[];
};

export function MasterAssignmentPanel({ action, workDate, masters, cleaners }: Props) {
  const [activeMasterId, setActiveMasterId] = useState(masters[0]?.id ?? 0);
  const activeMaster = masters.find((master) => master.id === activeMasterId) ?? masters[0] ?? null;
  const assignedIds = useMemo(
    () => new Set(activeMaster?.assignedEmployeeIds ?? []),
    [activeMaster],
  );
  const visibleCleaners = useMemo(
    () =>
      cleaners
        .slice()
        .sort((left, right) => {
          const selectedDiff = Number(assignedIds.has(right.id)) - Number(assignedIds.has(left.id));
          if (selectedDiff !== 0) {
            return selectedDiff;
          }
          return left.name.localeCompare(right.name, "mn");
        }),
    [assignedIds, cleaners],
  );

  if (!masters.length) {
    return (
      <div className={styles.emptyState}>
        <h2>Мастер бүртгэл олдсонгүй</h2>
        <p>Зам талбайн мастерын албан тушаалтай ажилтан HR дээр бүртгэгдсэн эсэхийг шалгана уу.</p>
      </div>
    );
  }

  return (
    <div className={styles.masterAssignmentShell}>
      <div className={styles.masterButtonGrid} aria-label="Мастер сонгох">
        {masters.map((master) => {
          const isActive = master.id === activeMaster?.id;
          return (
            <button
              key={master.id}
              type="button"
              className={`${styles.masterButton} ${isActive ? styles.masterButtonActive : ""}`}
              onClick={() => setActiveMasterId(master.id)}
              aria-pressed={isActive}
            >
              <strong>{master.name}</strong>
              <span>{master.assignedEmployeeIds.length} ажилтан</span>
            </button>
          );
        })}
      </div>

      {activeMaster ? (
        <form action={action} className={styles.masterWorkerPanel}>
          <input type="hidden" name="work_date" value={workDate} />
          <input type="hidden" name="master_id" value={activeMaster.id} />
          {visibleCleaners.map((employee) => (
            <input
              key={`all-${activeMaster.id}-${employee.id}`}
              type="hidden"
              name="all_employee_ids"
              value={employee.id}
            />
          ))}

          <div className={styles.masterWorkerHeader}>
            <div>
              <span className={styles.formBadge}>Сонгосон мастер</span>
              <h3>{activeMaster.name}</h3>
            </div>
            <strong>{assignedIds.size} ажилтан</strong>
          </div>

          <div className={styles.masterWorkerGrid}>
            {visibleCleaners.map((employee) => (
              <label
                key={`${activeMaster.id}-${employee.id}`}
                className={styles.masterWorkerItem}
              >
                <input
                  type="checkbox"
                  name="employee_ids"
                  value={employee.id}
                  defaultChecked={assignedIds.has(employee.id)}
                />
                <span>
                  <strong>{employee.name}</strong>
                  <small>
                    {employee.areaCount} талбай · {employee.jobTitle || "Зам талбайн ажилтан"}
                  </small>
                </span>
              </label>
            ))}
          </div>

          <div className={styles.buttonRow}>
            <button type="submit" className={styles.primaryButton}>
              Оноолт хадгалах
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
