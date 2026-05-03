"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Paperclip, PlusCircle } from "lucide-react";

import { SearchableSelect, type SearchableSelectOption } from "@/app/_components/searchable-select";
import styles from "@/app/workspace.module.css";
import type { SelectOption, WorkUnitOption } from "@/lib/workspace";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  className: string;
  footerClassName: string;
  projectId: number;
  departmentName: string;
  departmentHeadName: string;
  departmentHeadId: number | null;
  deadline: string;
  departmentUserOptions: SelectOption[];
  crewTeamOptions: Array<{
    id: number;
    label: string;
  }>;
  allUnitOptions: WorkUnitOption[];
  defaultUnitId: number | null;
  allowedUnitSummary?: string;
};

type FilePreview = {
  name: string;
  type: string;
  url: string;
};

type QuantityRow = {
  id: string;
  unitId: number | null;
  newUnitName: string;
  isUnitConfirmed: boolean;
};

const KHOROO_OPTIONS = Array.from({ length: 25 }, (_, index) => `${index + 1}-р хороо`);
const LOCATION_OPTIONS = [
  "Нийтийн эзэмшлийн гудамж",
  "Орон сууцны хороолол",
  "Сургууль, цэцэрлэгийн орчим",
  "Автобусны буудал",
  "Цэцэрлэгт хүрээлэн",
  "Тоглоомын талбай",
  "Явган хүний зам",
  "Ногоон байгууламж",
  "Хогийн цэг",
  "Бусад байршил",
];

function buildUnitOptions(units: WorkUnitOption[]): SearchableSelectOption[] {
  return units.map((unit) => ({
    id: unit.id,
    label: unit.name,
    meta: `${unit.code} · ${unit.categoryLabel}`,
    keywords: [unit.name, unit.code, unit.categoryLabel],
  }));
}

function buildUserOptions(users: SelectOption[]): SearchableSelectOption[] {
  return users.map((user) => ({
    id: user.id,
    label: user.name,
    meta:
      [user.jobTitle, user.departmentName, user.phone || user.login]
        .filter(Boolean)
        .join(" · ") || "Албан тушаал бүртгэлгүй",
    keywords: [
      user.name,
      user.jobTitle ?? "",
      user.phone ?? "",
      user.login,
      user.departmentName ?? "",
    ],
  }));
}

function preferCommonUnits(units: WorkUnitOption[]) {
  const preferred = ["км", "м³", "м3", "цаг", "машин", "ширхэг"];
  const scored = units
    .map((unit) => {
      const haystack = `${unit.name} ${unit.code}`.toLowerCase();
      const index = preferred.findIndex((item) => haystack.includes(item));
      return { unit, index: index === -1 ? Number.MAX_SAFE_INTEGER : index };
    })
    .filter((item) => item.index !== Number.MAX_SAFE_INTEGER)
    .sort((left, right) => left.index - right.index);

  return scored.length ? scored.map((item) => item.unit) : units;
}

function createQuantityRow(unitId: number | null): QuantityRow {
  return {
    id: `quantity-row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    unitId,
    newUnitName: "",
    isUnitConfirmed: false,
  };
}

export function ProjectTaskCreateForm({
  action,
  className,
  footerClassName,
  projectId,
  departmentName,
  departmentHeadName,
  departmentHeadId,
  deadline,
  departmentUserOptions,
  crewTeamOptions,
  allUnitOptions,
  defaultUnitId,
  allowedUnitSummary,
}: Props) {
  const selectableUnits = useMemo(() => preferCommonUnits(allUnitOptions), [allUnitOptions]);
  const unitOptions = useMemo(() => buildUnitOptions(selectableUnits), [selectableUnits]);
  const filteredDepartmentUsers = useMemo(() => {
    if (
      !departmentHeadId ||
      !departmentHeadName ||
      departmentUserOptions.some((user) => user.id === departmentHeadId)
    ) {
      return departmentUserOptions;
    }

    return [
      {
        id: departmentHeadId,
        name: departmentHeadName,
        login: "",
        role: "department_head",
        departmentName,
        jobTitle: "Хэлтсийн дарга",
      },
      ...departmentUserOptions,
    ];
  }, [departmentHeadId, departmentHeadName, departmentName, departmentUserOptions]);
  const assigneeOptions = useMemo(
    () => buildUserOptions(filteredDepartmentUsers),
    [filteredDepartmentUsers],
  );
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | null>(null);
  const [newTaskLocation, setNewTaskLocation] = useState("");
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const [useTeam, setUseTeam] = useState(false);
  const [showNewTeamFields, setShowNewTeamFields] = useState(false);
  const [teamMemberQuery, setTeamMemberQuery] = useState("");
  const [useQuantity, setUseQuantity] = useState(false);
  const defaultQuantityUnitId = defaultUnitId ?? selectableUnits[0]?.id ?? null;
  const [quantityRows, setQuantityRows] = useState<QuantityRow[]>([
    createQuantityRow(defaultQuantityUnitId),
  ]);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const filteredTeamMembers = useMemo(() => {
    const normalizedQuery = teamMemberQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return filteredDepartmentUsers;
    }

    return filteredDepartmentUsers.filter((user) =>
      [
        user.name,
        user.jobTitle ?? "",
        user.phone ?? "",
        user.login,
        user.departmentName ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [filteredDepartmentUsers, teamMemberQuery]);

  useEffect(
    () => () => {
      filePreviews.forEach((file) => URL.revokeObjectURL(file.url));
    },
    [filePreviews],
  );

  const helperText = selectableUnits.length
    ? `Санал болгосон нэгжүүд: ${
        allowedUnitSummary || selectableUnits.map((unit) => unit.name).join(", ")
      }`
    : "Хэмжих нэгжийн сонголт одоогоор алга.";

  return (
    <form action={action} className={className}>
      <input type="hidden" name="project_id" value={projectId} />

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label>Хэлтэс</label>
          <div className={styles.lockedFieldValue}>{departmentName}</div>
        </div>

        <div className={styles.field}>
          <label>Хэлтсийн дарга</label>
          <div className={styles.lockedFieldValue}>{departmentHeadName || "Тодорхойгүй"}</div>
        </div>
      </div>

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

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="task-khoroo">Хороо</label>
          <select id="task-khoroo" name="task_khoroo" defaultValue="">
            <option value="">Хороо сонгох</option>
            {KHOROO_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="task-location">Байршил</label>
          <select id="task-location" name="task_location" defaultValue="">
            <option value="">Байршил сонгох</option>
            {LOCATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            name="new_task_location"
            placeholder="Шинэ байршил шууд нэмэх"
            className={styles.inlineUnitInput}
            value={newTaskLocation}
            onChange={(event) => {
              setNewTaskLocation(event.target.value);
              setIsLocationConfirmed(false);
            }}
          />
          {newTaskLocation.trim() ? (
            <button
              type="button"
              className={styles.inlineConfirmButton}
              onClick={() => setIsLocationConfirmed(true)}
            >
              Байршил нэмэх
            </button>
          ) : null}
          {isLocationConfirmed && newTaskLocation.trim() ? (
            <small className={styles.inlineConfirmNote}>
              “{newTaskLocation.trim()}” байршлыг энэ ажилбарт хадгална.
            </small>
          ) : null}
        </div>
      </div>

      <div className={styles.field}>
        <label>Хариуцсан ажилтан</label>
        <SearchableSelect
          name="team_leader_id"
          value={selectedAssigneeId}
          options={assigneeOptions}
          placeholder="Хариуцсан ажилтан сонгоно уу"
          disabled={!assigneeOptions.length}
          searchPlaceholder="Нэр эсвэл утсаар хайна уу"
          emptyStateLabel="Энэ хэлтэст бүртгэлтэй хэрэглэгч алга."
          onChange={setSelectedAssigneeId}
        />
      </div>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={useTeam}
          onChange={(event) => setUseTeam(event.target.checked)}
        />
        <span>Багаар хийх</span>
      </label>

      {useTeam ? (
        <div className={styles.field}>
          <label htmlFor="task-crew-team">Баг сонгох</label>
          <select
            id="task-crew-team"
            name="crew_team_id"
            defaultValue=""
            disabled={!crewTeamOptions.length}
          >
            <option value="">
              {crewTeamOptions.length ? "Баг сонгохгүй" : "Энэ хэлтэст бүртгэлтэй баг алга"}
            </option>
            {crewTeamOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {!crewTeamOptions.length ? (
            <small className={styles.fieldHint}>
              Сонгосон хэлтэст хамаарах баг Odoo дээр олдсонгүй.
            </small>
          ) : null}
          <button
            type="button"
            className={styles.inlineLink}
            onClick={() => setShowNewTeamFields((current) => !current)}
          >
            <PlusCircle aria-hidden />
            <span>Шинэ баг нэмэх</span>
          </button>
          {showNewTeamFields ? (
            <div className={styles.inlineTeamPanel}>
              <label>
                <span>Багийн нэр</span>
                <input
                  name="new_crew_team_name"
                  placeholder="Жишээ: Ногоон байгууламжийн баг 01"
                />
              </label>
              <fieldset>
                <legend>Багийн гишүүд</legend>
                <input
                  type="search"
                  value={teamMemberQuery}
                  onChange={(event) => setTeamMemberQuery(event.target.value)}
                  placeholder="Нэр, албан тушаал эсвэл утсаар хайх"
                  className={styles.inlineMemberSearch}
                />
                <div className={styles.inlineMemberList}>
                  {filteredTeamMembers.length ? (
                    filteredTeamMembers.map((user) => (
                      <label key={user.id}>
                        <input
                          type="checkbox"
                          name="new_crew_member_user_ids"
                          value={user.id}
                        />
                        <span>
                          <strong>{user.name}</strong>
                          <small>
                            {[user.jobTitle, user.phone || user.login]
                              .filter(Boolean)
                              .join(" · ") || "Албан тушаал бүртгэлгүй"}
                          </small>
                        </span>
                      </label>
                    ))
                  ) : (
                    <p>Тохирох ажилтан олдсонгүй.</p>
                  )}
                </div>
              </fieldset>
              <p className={styles.fieldHint}>
                Гишүүдээ сонгоод доорх “Ажилбар нэмэх” товчийг дарахад баг хамт үүсэж,
                ажилбарт оноогдоно.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="task-start-date">Эхлэх огноо</label>
          <input id="task-start-date" name="start_date" type="date" />
        </div>

        <div className={styles.field}>
          <label htmlFor="task-deadline">Дуусах огноо</label>
          <input id="task-deadline" name="deadline" type="date" defaultValue={deadline} />
        </div>
      </div>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={useQuantity}
          onChange={(event) => setUseQuantity(event.target.checked)}
        />
        <span>Хэмжээ ашиглах</span>
      </label>

      {useQuantity ? (
        <div className={styles.quantityRows}>
          {quantityRows.map((row, index) => (
            <div className={styles.quantityRow} key={row.id}>
              <div className={styles.field}>
                <label htmlFor={`task-planned-quantity-${row.id}`}>
                  Тоо хэмжээ {index + 1}
                </label>
                <input
                  id={`task-planned-quantity-${row.id}`}
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
                  value={row.unitId}
                  options={unitOptions}
                  placeholder="Хэмжих нэгж сонгоно уу"
                  disabled={!selectableUnits.length}
                  searchPlaceholder="Нэгж хайна уу"
                  emptyStateLabel="Тохирох хэмжих нэгж алга."
                  onChange={(nextUnitId) =>
                    setQuantityRows((currentRows) =>
                      currentRows.map((item) =>
                        item.id === row.id
                          ? { ...item, unitId: nextUnitId, isUnitConfirmed: false }
                          : item,
                      ),
                    )
                  }
                />
                <input
                  name="new_unit_name"
                  placeholder="Эсвэл шинэ нэгжийн нэр оруулах"
                  className={styles.inlineUnitInput}
                  value={row.newUnitName}
                  onChange={(event) =>
                    setQuantityRows((currentRows) =>
                      currentRows.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              newUnitName: event.target.value,
                              isUnitConfirmed: false,
                              unitId: null,
                            }
                          : item,
                      ),
                    )
                  }
                />
                {row.newUnitName.trim() ? (
                  <button
                    type="button"
                    className={styles.inlineConfirmButton}
                    onClick={() =>
                      setQuantityRows((currentRows) =>
                        currentRows.map((item) =>
                          item.id === row.id ? { ...item, isUnitConfirmed: true } : item,
                        ),
                      )
                    }
                  >
                    Нэгж нэмэх
                  </button>
                ) : null}
                {row.isUnitConfirmed && row.newUnitName.trim() ? (
                  <small className={styles.inlineConfirmNote}>
                    “{row.newUnitName.trim()}” нэгжийг энэ хэмжээний мөрөнд ашиглана.
                  </small>
                ) : null}
              </div>

              {quantityRows.length > 1 ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() =>
                    setQuantityRows((currentRows) =>
                      currentRows.filter((item) => item.id !== row.id),
                    )
                  }
                >
                  Мөр хасах
                </button>
              ) : null}
            </div>
          ))}

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() =>
                setQuantityRows((currentRows) => [
                  ...currentRows,
                  createQuantityRow(defaultQuantityUnitId),
                ])
              }
            >
              Хэмжээний мөр нэмэх
            </button>
          </div>
          <small className={styles.fieldHint}>{helperText}</small>
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="task-files">Файл хавсаргах</label>
        <label className={styles.fileDropZone} htmlFor="task-files">
          <Paperclip aria-hidden />
          <span>PDF, зураг, бичиг баримт олон файлаар хавсаргана</span>
        </label>
        <input
          id="task-files"
          name="task_files"
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className={styles.hiddenFileInput}
          onChange={(event) => {
            const nextPreviews = Array.from(event.target.files ?? []).map((file) => ({
              name: file.name,
              type: file.type,
              url: URL.createObjectURL(file),
            }));
            filePreviews.forEach((file) => URL.revokeObjectURL(file.url));
            setFilePreviews(nextPreviews);
          }}
        />
        {filePreviews.length ? (
          <div className={styles.attachmentPreviewGrid}>
            {filePreviews.map((file) => (
              <div className={styles.attachmentPreviewItem} key={`${file.name}-${file.url}`}>
                {file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.url} alt={file.name} />
                ) : file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? (
                  <FileText aria-hidden />
                ) : (
                  <FileText aria-hidden />
                )}
                <span>{file.name}</span>
              </div>
            ))}
          </div>
        ) : null}
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
          Ажилбар нэмэх
        </button>
      </div>
    </form>
  );
}
