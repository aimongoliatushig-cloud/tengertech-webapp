"use client";

import { useMemo, useState } from "react";

import { SearchableSelect, type SearchableSelectOption } from "@/app/_components/searchable-select";
import styles from "@/app/workspace.module.css";
import type { SelectOption, WorkUnitOption } from "@/lib/workspace";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  className: string;
  footerClassName: string;
  projectId: number;
  deadline: string;
  masterMode: boolean;
  teamLeaderOptions: SelectOption[];
  crewTeamOptions: Array<{
    id: number;
    label: string;
  }>;
  allowedUnits: WorkUnitOption[];
  defaultUnitId: number | null;
  allowedUnitSummary?: string;
};

function buildUnitOptions(units: WorkUnitOption[]): SearchableSelectOption[] {
  return units.map((unit) => ({
    id: unit.id,
    label: unit.name,
    meta: `${unit.code} · ${unit.categoryLabel}`,
    keywords: [unit.name, unit.code, unit.categoryLabel],
  }));
}

export function ProjectTaskCreateForm({
  action,
  className,
  footerClassName,
  projectId,
  deadline,
  masterMode,
  teamLeaderOptions,
  crewTeamOptions,
  allowedUnits,
  defaultUnitId,
  allowedUnitSummary,
}: Props) {
  const unitOptions = useMemo(() => buildUnitOptions(allowedUnits), [allowedUnits]);
  const [selectedUnitOverrideId, setSelectedUnitOverrideId] = useState<number | null>(
    defaultUnitId ?? allowedUnits[0]?.id ?? null,
  );
  const selectedUnitId = useMemo(() => {
    if (
      selectedUnitOverrideId &&
      allowedUnits.some((unit) => unit.id === selectedUnitOverrideId)
    ) {
      return selectedUnitOverrideId;
    }

    return defaultUnitId ?? allowedUnits[0]?.id ?? null;
  }, [allowedUnits, defaultUnitId, selectedUnitOverrideId]);

  const helperText = allowedUnits.length
    ? `Энэ ажилд ашиглах боломжтой нэгжүүд: ${
        allowedUnitSummary || allowedUnits.map((unit) => unit.name).join(", ")
      }`
    : "Энэ ажил дээр хэмжих нэгжийн профайл тохируулаагүй байна.";

  return (
    <form action={action} className={className}>
      <input type="hidden" name="project_id" value={projectId} />

      <div className={styles.field}>
        <label htmlFor="task-name">Ажилбарын нэр</label>
        <input
          id="task-name"
          name="name"
          type="text"
          placeholder="Жишээ: Хогийн савны тойргийн цэвэрлэгээ"
          required
        />
      </div>

      {!masterMode ? (
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="task-team-leader">Хариуцсан мастер</label>
            <select id="task-team-leader" name="team_leader_id" defaultValue="">
              <option value="">Сонгоогүй</option>
              {teamLeaderOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="task-crew-team">Баг</label>
            <select id="task-crew-team" name="crew_team_id" defaultValue="">
              <option value="">Баг сонгохгүй</option>
              {crewTeamOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="task-deadline">Хугацаа</label>
        <input id="task-deadline" name="deadline" type="date" defaultValue={deadline} />
      </div>

      <div className={styles.field}>
        <label htmlFor="task-planned-quantity">Төлөвлөсөн хэмжээ</label>
        <input
          id="task-planned-quantity"
          name="planned_quantity"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="12"
        />
      </div>

      <div className={styles.field}>
        <label>Хэмжих нэгж</label>
        <SearchableSelect
          name="unit_id"
          value={selectedUnitId}
          options={unitOptions}
          placeholder="Хэмжих нэгж сонгоно уу"
          disabled={!allowedUnits.length}
          searchPlaceholder="Нэгж хайна уу"
          emptyStateLabel="Тохирох хэмжих нэгж алга."
          onChange={setSelectedUnitOverrideId}
        />
        <small className={styles.fieldHint}>{helperText}</small>
      </div>

      <div className={styles.field}>
        <label htmlFor="task-description">Товч тайлбар</label>
        <textarea
          id="task-description"
          name="description"
          placeholder="Өнөөдөр хийх ажлын хүрээ, байршил, онцгой зааврыг товч бичнэ."
        />
      </div>

      <div className={footerClassName}>
        <button type="submit" className={styles.primaryButton}>
          {masterMode ? "Ажил нэмэх" : "Ажилбар үүсгэх"}
        </button>
      </div>
    </form>
  );
}
