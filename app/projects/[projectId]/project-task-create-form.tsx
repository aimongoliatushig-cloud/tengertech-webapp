"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Paperclip, PlusCircle } from "lucide-react";

import { SearchableSelect, type SearchableSelectOption } from "@/app/_components/searchable-select";
import styles from "@/app/workspace.module.css";
import type { FleetVehicleDriverOption } from "@/lib/odoo";
import type { GarbagePointOption, GarbageSubdistrictOption, SelectOption, WorkUnitOption } from "@/lib/workspace";

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
  operationType?: string;
  garbagePointOptions?: GarbagePointOption[];
  subdistrictOptions?: GarbageSubdistrictOption[];
  garbageLoaderOptions?: FleetVehicleDriverOption[];
  garbageVehicleContext?: {
    vehicleId: number | null;
    vehicleName: string;
    driverEmployeeId: number | null;
    driverName: string;
    collectorEmployeeIds: number[];
    collectorNames: string[];
  } | null;
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
  operationType = "",
  garbagePointOptions = [],
  subdistrictOptions = [],
  garbageLoaderOptions = [],
  garbageVehicleContext = null,
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
  const [localCrewTeamOptions, setLocalCrewTeamOptions] = useState(crewTeamOptions);
  const [selectedCrewTeamId, setSelectedCrewTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [selectedNewTeamMemberIds, setSelectedNewTeamMemberIds] = useState<string[]>([]);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [teamSaveMessage, setTeamSaveMessage] = useState("");
  const [newTaskKhoroo, setNewTaskKhoroo] = useState("");
  const [isKhorooConfirmed, setIsKhorooConfirmed] = useState(false);
  const [newTaskLocation, setNewTaskLocation] = useState("");
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const [useTeam, setUseTeam] = useState(false);
  const [showNewTeamFields, setShowNewTeamFields] = useState(false);
  const [teamMemberQuery, setTeamMemberQuery] = useState("");
  const [useQuantity, setUseQuantity] = useState(false);
  const isGarbageRouteTask = operationType === "garbage";
  const [selectedGarbageKhoroo, setSelectedGarbageKhoroo] = useState("");
  const [selectedGarbagePointIds, setSelectedGarbagePointIds] = useState<string[]>([]);
  const [selectedGarbageCollectorIds, setSelectedGarbageCollectorIds] = useState<string[]>(
    () => garbageVehicleContext?.collectorEmployeeIds.map(String) ?? [],
  );
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
  const garbageKhorooOptions = useMemo(
    () =>
      Array.from(new Set(garbagePointOptions.map((point) => point.subdistrictName).filter(Boolean))),
    [garbagePointOptions],
  );
  const filteredGarbagePoints = useMemo(() => {
    if (!selectedGarbageKhoroo) {
      return [];
    }
    return garbagePointOptions.filter((point) => point.subdistrictName === selectedGarbageKhoroo);
  }, [garbagePointOptions, selectedGarbageKhoroo]);
  const garbageLoaderById = useMemo(
    () => new Map(garbageLoaderOptions.map((loader) => [String(loader.id), loader])),
    [garbageLoaderOptions],
  );
  const availableGarbageLoaders = useMemo(
    () =>
      garbageLoaderOptions.filter(
        (loader) => !selectedGarbageCollectorIds.includes(String(loader.id)),
      ),
    [garbageLoaderOptions, selectedGarbageCollectorIds],
  );
  const selectedGarbageCollectorLabels = selectedGarbageCollectorIds.map((collectorId, index) => {
    const employee = garbageLoaderById.get(collectorId);
    return employee?.name ?? garbageVehicleContext?.collectorNames[index] ?? `Ачигч #${collectorId}`;
  });
  const canSaveNewTeam = Boolean(newTeamName.trim() && selectedNewTeamMemberIds.length);

  const toggleNewTeamMember = (memberId: string, checked: boolean) => {
    setSelectedNewTeamMemberIds((current) => {
      if (checked) {
        return current.includes(memberId) ? current : [...current, memberId];
      }

      return current.filter((item) => item !== memberId);
    });
    setTeamSaveMessage("");
  };

  const saveNewTeam = async () => {
    if (!canSaveNewTeam || isSavingTeam) {
      return;
    }

    setIsSavingTeam(true);
    setTeamSaveMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/crew-teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newTeamName.trim(),
          memberUserIds: selectedNewTeamMemberIds.map(Number),
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            team?: { id: number; label: string };
          }
        | null;

      if (!response.ok || !result?.ok || !result.team) {
        throw new Error(result?.error || "Баг хадгалахад алдаа гарлаа.");
      }

      setLocalCrewTeamOptions((current) =>
        current.some((option) => option.id === result.team!.id)
          ? current
          : [...current, result.team!],
      );
      setSelectedCrewTeamId(String(result.team.id));
      setNewTeamName("");
      setSelectedNewTeamMemberIds([]);
      setTeamMemberQuery("");
      setShowNewTeamFields(false);
      setTeamSaveMessage("Баг хадгалагдаж, энэ даалгаварт сонгогдлоо.");
    } catch (error) {
      setTeamSaveMessage(error instanceof Error ? error.message : "Баг хадгалахад алдаа гарлаа.");
    } finally {
      setIsSavingTeam(false);
    }
  };

  const addGarbageCollector = (collectorId: string) => {
    if (!collectorId) {
      return;
    }
    setSelectedGarbageCollectorIds((current) =>
      current.includes(collectorId) ? current : [...current, collectorId],
    );
  };

  const removeGarbageCollector = (collectorId: string) => {
    setSelectedGarbageCollectorIds((current) => current.filter((item) => item !== collectorId));
  };

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

  if (isGarbageRouteTask) {
    return (
      <form action={action} className={className}>
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="garbage_task_mode" value="1" />
        <input type="hidden" name="name" value="Нэмэлт хогийн цэг" />
        <input type="hidden" name="deadline" value={deadline} />
        {garbageVehicleContext?.vehicleId ? (
          <input type="hidden" name="garbage_vehicle_id" value={garbageVehicleContext.vehicleId} />
        ) : null}
        {garbageVehicleContext?.driverEmployeeId ? (
          <input
            type="hidden"
            name="garbage_driver_employee_id"
            value={garbageVehicleContext.driverEmployeeId}
          />
        ) : null}
        {selectedGarbageCollectorIds.map((collectorId) => (
          <input key={collectorId} type="hidden" name="garbage_collector_employee_ids" value={collectorId} />
        ))}

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Хэлтэс</label>
            <div className={styles.lockedFieldValue}>{departmentName}</div>
          </div>

          <div className={styles.field}>
            <label>Ажил дээрх машин</label>
            <div className={styles.lockedFieldValue}>
              {garbageVehicleContext?.vehicleName || "Машин оноогдоогүй"}
            </div>
          </div>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Жолооч</label>
            <div className={styles.lockedFieldValue}>
              {garbageVehicleContext?.driverName || "Жолооч оноогоогүй"}
            </div>
          </div>

          <div className={styles.field}>
            <label>Ачигч</label>
            <div className={styles.editableChipRow}>
              {selectedGarbageCollectorIds.length ? (
                selectedGarbageCollectorIds.map((collectorId, index) => (
                  <span key={collectorId} className={styles.editableChip}>
                    {selectedGarbageCollectorLabels[index]}
                    <button
                      type="button"
                      aria-label={`${selectedGarbageCollectorLabels[index]} хасах`}
                      onClick={() => removeGarbageCollector(collectorId)}
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span className={styles.mutedInline}>Ачигч сонгоогүй</span>
              )}
            </div>
            <select
              value=""
              className={styles.inlineUnitInput}
              aria-label="Ачигч нэмэх"
              onChange={(event) => addGarbageCollector(event.target.value)}
              disabled={!availableGarbageLoaders.length}
            >
              <option value="">
                {availableGarbageLoaders.length ? "Ачигч нэмэх" : "Нэмэх ачигч алга"}
              </option>
              {availableGarbageLoaders.map((loader) => (
                <option key={loader.id} value={loader.id}>
                  {[loader.name, loader.jobTitle].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="task-khoroo">Хороо</label>
          <select
            id="task-khoroo"
            name="task_khoroo"
            value={selectedGarbageKhoroo}
            onChange={(event) => {
              setSelectedGarbageKhoroo(event.target.value);
              setSelectedGarbagePointIds([]);
            }}
            required
          >
            <option value="">Хороо сонгох</option>
            {garbageKhorooOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <fieldset className={styles.inlineTeamPanel}>
          <legend>Хогийн цэг сонгох</legend>
          {!selectedGarbageKhoroo ? (
            <p className={styles.fieldHint}>Эхлээд хороо сонгоход тухайн хорооны цэгүүд гарна.</p>
          ) : filteredGarbagePoints.length ? (
            <div className={styles.inlineMemberList}>
              {filteredGarbagePoints.map((point) => {
                const pointId = String(point.id);
                return (
                  <label key={point.id}>
                    <input
                      type="checkbox"
                      name="garbage_task_point_ids"
                      value={point.id}
                      checked={selectedGarbagePointIds.includes(pointId)}
                      onChange={(event) =>
                        setSelectedGarbagePointIds((current) =>
                          event.target.checked
                            ? [...current, pointId]
                            : current.filter((item) => item !== pointId),
                        )
                      }
                    />
                    <span>
                      <strong>{point.name}</strong>
                      <small>{point.subdistrictName}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className={styles.fieldHint}>Энэ хороонд оноогдсон хогийн цэг олдсонгүй.</p>
          )}
        </fieldset>

        <div className={styles.field}>
          <label htmlFor="task-deadline">Ажлын өдөр</label>
          <input id="task-deadline" type="date" value={deadline} readOnly />
        </div>

        <div className={footerClassName}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={!selectedGarbagePointIds.length || !garbageVehicleContext?.vehicleId}
          >
            Сонгосон цэгүүдийг даалгавар болгох
          </button>
        </div>
      </form>
    );
  }

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
        <label htmlFor="task-name">Даалгаврын нэр</label>
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
            {subdistrictOptions.map((option) => (
              <option key={option.id} value={option.name}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            name="new_task_khoroo"
            placeholder="Шинэ хороо шууд нэмэх"
            className={styles.inlineUnitInput}
            value={newTaskKhoroo}
            onChange={(event) => {
              setNewTaskKhoroo(event.target.value);
              setIsKhorooConfirmed(false);
            }}
          />
          {newTaskKhoroo.trim() ? (
            <button
              type="button"
              className={styles.inlineConfirmButton}
              onClick={() => setIsKhorooConfirmed(true)}
            >
              Хороо нэмэх
            </button>
          ) : null}
          {isKhorooConfirmed && newTaskKhoroo.trim() ? (
            <small className={styles.inlineConfirmNote}>
              “{newTaskKhoroo.trim()}” хороог хадгалж, энэ даалгаварт ашиглана.
            </small>
          ) : null}
          {!subdistrictOptions.length ? (
            <small className={styles.fieldHint}>
              Хороо бүртгэлгүй бол дээрх талбарт шинэ хорооны нэрийг оруулаад нэмнэ үү.
            </small>
          ) : null}
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
              “{newTaskLocation.trim()}” байршлыг энэ даалгаварт хадгална.
            </small>
          ) : null}
        </div>
      </div>

      <section className={styles.assignmentPanel}>
        <input type="hidden" name="task_assignment_mode" value={useTeam ? "team" : "single"} />
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

        <label className={styles.teamToggleRow}>
          <input
            type="checkbox"
            checked={useTeam}
            onChange={(event) => setUseTeam(event.target.checked)}
          />
          <span>Багаар хийх</span>
        </label>

        {useTeam ? (
          <div className={styles.teamAssignmentPanel}>
          <div className={styles.field}>
            <label htmlFor="task-crew-team">Баг сонгох</label>
            <select
              id="task-crew-team"
              name="crew_team_id"
              value={selectedCrewTeamId}
              onChange={(event) => setSelectedCrewTeamId(event.target.value)}
              disabled={!localCrewTeamOptions.length}
            >
              <option value="">
                {localCrewTeamOptions.length ? "Баг сонгохгүй" : "Энэ хэлтэст бүртгэлтэй баг алга"}
              </option>
              {localCrewTeamOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className={styles.teamCreateButton}
            onClick={() => setShowNewTeamFields((current) => !current)}
            aria-expanded={showNewTeamFields}
          >
            <PlusCircle aria-hidden />
            <span>{showNewTeamFields ? "Шинэ багийг хаах" : "Шинэ баг нэмэх"}</span>
          </button>
          {showNewTeamFields ? (
            <div className={styles.inlineTeamPanel}>
              {selectedNewTeamMemberIds.map((memberId) => (
                <input
                  key={memberId}
                  type="hidden"
                  name="new_crew_member_user_ids"
                  value={memberId}
                />
              ))}
              <label>
                <span>Багийн нэр</span>
                <input
                  name="new_crew_team_name"
                  placeholder="Жишээ: Ногоон байгууламжийн баг 01"
                  value={newTeamName}
                  onChange={(event) => {
                    setNewTeamName(event.target.value);
                    setTeamSaveMessage("");
                  }}
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
                          value={user.id}
                          checked={selectedNewTeamMemberIds.includes(String(user.id))}
                          onChange={(event) =>
                            toggleNewTeamMember(String(user.id), event.target.checked)
                          }
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
              <div className={styles.inlineTeamActionRow}>
                <button
                  type="button"
                  className={styles.teamSaveButton}
                  onClick={saveNewTeam}
                  disabled={!canSaveNewTeam || isSavingTeam}
                >
                  {isSavingTeam ? "Хадгалж байна..." : "Баг хадгалах"}
                </button>
              </div>
            </div>
          ) : null}
          {teamSaveMessage ? <p className={styles.teamSaveMessage}>{teamSaveMessage}</p> : null}
          </div>
        ) : null}
      </section>

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
          Даалгавар нэмэх
        </button>
      </div>
    </form>
  );
}
