"use client";

import { useMemo, useState } from "react";

import styles from "@/app/workspace.module.css";

type AreaOption = {
  id: number;
  name: string;
  khorooName: string;
  streetName: string;
  areaM2: number;
  employeeId: number | null;
  workingDayKeys: string[];
};

type SubdistrictOption = {
  id: number;
  label: string;
  name: string;
};

type CleanerOption = {
  id: number;
  name: string;
  jobTitle: string;
  departmentName: string;
};

type WorkingDayOption = {
  key: string;
  label: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  workDate: string;
  areas: AreaOption[];
  subdistricts: SubdistrictOption[];
  cleaners: CleanerOption[];
  workingDays: WorkingDayOption[];
};

function emptyForm(workingDays: WorkingDayOption[]) {
  return {
    name: "",
    khorooName: "",
    areaM2: "",
    employeeId: "",
    workingDayKeys: workingDays.map((day) => day.key),
  };
}

function formFromArea(area: AreaOption, workingDays: WorkingDayOption[]) {
  return {
    name: area.name,
    khorooName: area.khorooName || area.streetName,
    areaM2: area.areaM2 ? String(area.areaM2) : "",
    employeeId: area.employeeId ? String(area.employeeId) : "",
    workingDayKeys: area.workingDayKeys.length
      ? area.workingDayKeys
      : workingDays.map((day) => day.key),
  };
}

export function CleaningAreaForm({
  action,
  workDate,
  areas,
  subdistricts,
  cleaners,
  workingDays,
}: Props) {
  const initialArea = areas[0] ?? null;
  const [selectedAreaId, setSelectedAreaId] = useState(initialArea ? String(initialArea.id) : "");
  const [formState, setFormState] = useState(
    initialArea ? formFromArea(initialArea, workingDays) : emptyForm(workingDays),
  );
  const selectedDayKeys = useMemo(
    () => new Set(formState.workingDayKeys),
    [formState.workingDayKeys],
  );

  function selectArea(areaId: string) {
    setSelectedAreaId(areaId);
    const area = areas.find((item) => String(item.id) === areaId) ?? null;
    setFormState(area ? formFromArea(area, workingDays) : emptyForm(workingDays));
  }

  function toggleWorkingDay(dayKey: string) {
    setFormState((current) => {
      const days = new Set(current.workingDayKeys);
      if (days.has(dayKey)) {
        days.delete(dayKey);
      } else {
        days.add(dayKey);
      }
      return { ...current, workingDayKeys: Array.from(days) };
    });
  }

  return (
    <form action={action} className={styles.createWorkForm}>
      <input type="hidden" name="work_date" value={workDate} />
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="existing_area_id">Өмнөх бүртгэл</label>
          <select
            id="existing_area_id"
            value={selectedAreaId}
            onChange={(event) => selectArea(event.target.value)}
          >
            <option value="">Шинэ талбай нэмэх</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="name">Талбайн нэршил</label>
          <input
            id="name"
            name="name"
            type="text"
            value={formState.name}
            onChange={(event) =>
              setFormState((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Жишээ: Наадамчдын замын зүүн хэсэг"
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="khoroo_name">Хороо</label>
          <select
            id="khoroo_name"
            name="khoroo_name"
            value={formState.khorooName}
            onChange={(event) =>
              setFormState((current) => ({ ...current, khorooName: event.target.value }))
            }
            required
          >
            <option value="">Хороо сонгоно уу</option>
            {subdistricts.map((subdistrict) => (
              <option key={subdistrict.id} value={subdistrict.name}>
                {subdistrict.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="area_m2">Талбай /мкв/</label>
          <input
            id="area_m2"
            name="area_m2"
            type="number"
            min="1"
            step="1"
            value={formState.areaM2}
            onChange={(event) =>
              setFormState((current) => ({ ...current, areaM2: event.target.value }))
            }
            required
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="employee_id">Цэвэрлэгээний ажилтан</label>
          <select
            id="employee_id"
            name="employee_id"
            value={formState.employeeId}
            onChange={(event) =>
              setFormState((current) => ({ ...current, employeeId: event.target.value }))
            }
            required
          >
            <option value="">Ажилтан сонгоно уу</option>
            {cleaners.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {[employee.name, employee.jobTitle, employee.departmentName]
                  .filter(Boolean)
                  .join(" · ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label>Ажиллах өдрүүд</label>
        <div className={styles.weekdayToggleGrid}>
          {workingDays.map((day) => (
            <label key={day.key} className={styles.weekdayToggle}>
              <input
                type="checkbox"
                name="working_days"
                value={day.key}
                checked={selectedDayKeys.has(day.key)}
                onChange={() => toggleWorkingDay(day.key)}
              />
              <span>{day.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.buttonRow}>
        <button type="submit" className={styles.primaryButton}>
          Талбай хадгалах
        </button>
      </div>
    </form>
  );
}
