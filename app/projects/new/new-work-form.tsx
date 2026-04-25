"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

import { SearchableSelect, type SearchableSelectOption } from "@/app/_components/searchable-select";
import styles from "@/app/workspace.module.css";
import type {
  DepartmentOption,
  GarbageRouteOption,
  GarbageVehicleOption,
  SelectOption,
  WorkTypeOption,
} from "@/lib/workspace";

const GARBAGE_TRANSPORT_KEYWORD = "хог тээвэрлэлтийн";
const AUTO_BASE_KEYWORD = "авто бааз";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  departmentOptions: DepartmentOption[];
  managerOptions: SelectOption[];
  garbageVehicleOptions: GarbageVehicleOption[];
  garbageRouteOptions: GarbageRouteOption[];
  workTypeOptions: WorkTypeOption[];
  lockedDepartmentId?: string;
  lockedDepartmentLabel?: string;
};

function getTodayValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatShiftLabel(shiftType: string) {
  switch (shiftType) {
    case "morning":
      return "Өглөө";
    case "day":
      return "Өдөр";
    case "evening":
      return "Орой";
    case "night":
      return "Шөнө";
    default:
      return "Тодорхойгүй";
  }
}

function formatDateLabel(value: string) {
  if (!value) {
    return "Огноо сонгоно уу";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

function buildUnitOptions(workType: WorkTypeOption | null): SearchableSelectOption[] {
  return (workType?.allowedUnits ?? []).map((unit) => ({
    id: unit.id,
    label: unit.name,
    meta: `${unit.code} · ${unit.categoryLabel}`,
    keywords: [unit.name, unit.code, unit.categoryLabel],
  }));
}

function normalizeDepartmentValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeLocationName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function departmentContains(
  department: Pick<DepartmentOption, "name" | "label"> | null | undefined,
  keyword: string,
) {
  const normalizedKeyword = normalizeDepartmentValue(keyword);
  return [department?.name, department?.label].some((value) =>
    normalizeDepartmentValue(value).includes(normalizedKeyword),
  );
}

function isGarbageTransportDepartment(
  department: Pick<DepartmentOption, "name" | "label"> | null | undefined,
) {
  return departmentContains(department, GARBAGE_TRANSPORT_KEYWORD);
}

function isCombinedOperationsDepartment(
  department: Pick<DepartmentOption, "name" | "label"> | null | undefined,
) {
  return (
    departmentContains(department, GARBAGE_TRANSPORT_KEYWORD) &&
    departmentContains(department, AUTO_BASE_KEYWORD)
  );
}

export function NewWorkForm({
  action,
  departmentOptions,
  managerOptions,
  garbageVehicleOptions,
  garbageRouteOptions,
  workTypeOptions,
  lockedDepartmentId,
  lockedDepartmentLabel,
}: Props) {
  const [departmentId, setDepartmentId] = useState(lockedDepartmentId ?? "");
  const [operationUnit, setOperationUnit] = useState(() => {
    const initialDepartment = departmentOptions.find(
      (option) => String(option.id) === (lockedDepartmentId ?? ""),
    );

    return isGarbageTransportDepartment(initialDepartment)
      ? "garbage_transport"
      : "standard";
  });
  const [vehicleId, setVehicleId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [extraLocationDraft, setExtraLocationDraft] = useState("");
  const [extraLocations, setExtraLocations] = useState<string[]>([]);
  const [shiftDate, setShiftDate] = useState(getTodayValue());
  const [trackQuantity, setTrackQuantity] = useState(false);
  const [operationType, setOperationType] = useState("");
  const [selectedUnitOverrideId, setSelectedUnitOverrideId] = useState<number | null>(null);

  const selectedDepartment = useMemo(
    () => departmentOptions.find((option) => String(option.id) === departmentId) ?? null,
    [departmentId, departmentOptions],
  );
  const selectedVehicle = useMemo(
    () => garbageVehicleOptions.find((option) => String(option.id) === vehicleId) ?? null,
    [garbageVehicleOptions, vehicleId],
  );
  const selectedRoute = useMemo(
    () => garbageRouteOptions.find((option) => String(option.id) === routeId) ?? null,
    [garbageRouteOptions, routeId],
  );
  const selectedWorkType = useMemo(
    () => workTypeOptions.find((option) => option.operationType === operationType) ?? null,
    [operationType, workTypeOptions],
  );
  const unitOptions = useMemo(() => buildUnitOptions(selectedWorkType), [selectedWorkType]);
  const selectedUnitId = useMemo(() => {
    if (!selectedWorkType) {
      return null;
    }

    if (
      selectedUnitOverrideId &&
      selectedWorkType.allowedUnits.some((unit) => unit.id === selectedUnitOverrideId)
    ) {
      return selectedUnitOverrideId;
    }

    return selectedWorkType.defaultUnitId ?? selectedWorkType.allowedUnits[0]?.id ?? null;
  }, [selectedUnitOverrideId, selectedWorkType]);

  const isCombinedDepartment = isCombinedOperationsDepartment(selectedDepartment);
  const supportsGarbageTransport = isGarbageTransportDepartment(selectedDepartment);
  const isGarbageTransport =
    supportsGarbageTransport &&
    (isCombinedDepartment ? operationUnit === "garbage_transport" : true);
  const isDepartmentLocked = Boolean(lockedDepartmentId);

  const generatedName = useMemo(() => {
    if (!isGarbageTransport) {
      return "";
    }

    const vehicleLabel = selectedVehicle?.plate || "Машины дугаар";
    const primaryLocationLabel = selectedRoute?.code || selectedRoute?.name || "Байршил";
    const locationLabel = extraLocations.length
      ? `${primaryLocationLabel} + ${extraLocations.length} байршил`
      : primaryLocationLabel;
    return `${vehicleLabel} - ${locationLabel} / ${shiftDate}`;
  }, [extraLocations.length, isGarbageTransport, selectedRoute, selectedVehicle, shiftDate]);

  const unitHelperText = selectedWorkType
    ? `Энэ ажилд ашиглах боломжтой нэгжүүд: ${selectedWorkType.allowedUnitSummary}`
    : "Эхлээд ажлын төрлөө сонгоно уу.";

  const handleDepartmentChange = (nextDepartmentId: string) => {
    setDepartmentId(nextDepartmentId);
    const nextDepartment = departmentOptions.find(
      (option) => String(option.id) === nextDepartmentId,
    );

    if (isGarbageTransportDepartment(nextDepartment)) {
      setOperationUnit("garbage_transport");
      return;
    }

    setOperationUnit("standard");
  };

  const handleAddExtraLocation = () => {
    const normalizedLocation = normalizeLocationName(extraLocationDraft);
    if (!normalizedLocation) {
      return;
    }

    setExtraLocations((currentLocations) => {
      const alreadyAdded = currentLocations.some(
        (location) => location.toLowerCase() === normalizedLocation.toLowerCase(),
      );
      return alreadyAdded ? currentLocations : [...currentLocations, normalizedLocation];
    });
    setExtraLocationDraft("");
  };

  const handleExtraLocationKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleAddExtraLocation();
  };

  return (
    <form action={action} className={styles.form}>
      {isDepartmentLocked ? (
        <div className={styles.field}>
          <label>Хэлтэс</label>
          <div className={styles.lockedFieldValue}>
            {lockedDepartmentLabel ?? selectedDepartment?.label ?? selectedDepartment?.name}
          </div>
          <input type="hidden" name="department_id" value={departmentId} />
        </div>
      ) : (
        <div className={styles.field}>
          <label htmlFor="department_id">Хэлтэс</label>
          <select
            id="department_id"
            name="department_id"
            value={departmentId}
            onChange={(event) => handleDepartmentChange(event.target.value)}
            required
          >
            <option value="">Хэлтэс сонгоно уу</option>
            {departmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {isCombinedDepartment ? (
        <div className={styles.optionalSection}>
          <div className={styles.field}>
            <label>Хэлтэс доторх ажил</label>
            <div className={styles.modeRail}>
              <button
                type="button"
                className={`${styles.modeChip} ${
                  operationUnit === "auto_base" ? styles.modeChipActive : ""
                }`}
                onClick={() => setOperationUnit("auto_base")}
              >
                <span>Авто бааз</span>
                <small>Техник, засвар, бэлэн байдал</small>
              </button>
              <button
                type="button"
                className={`${styles.modeChip} ${
                  operationUnit === "garbage_transport" ? styles.modeChipActive : ""
                }`}
                onClick={() => setOperationUnit("garbage_transport")}
              >
                <span>Хог тээвэрлэлт</span>
                <small>Машин, байршил, цэгийн ажилбар</small>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input type="hidden" name="operation_unit" value={operationUnit} />

      {isGarbageTransport ? (
        <>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="garbage_vehicle_id">Машины дугаар</label>
              <select
                id="garbage_vehicle_id"
                name="garbage_vehicle_id"
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                required={isGarbageTransport}
              >
                <option value="">Машин сонгоно уу</option>
                {garbageVehicleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="garbage_route_id">Байршил</label>
              <select
                id="garbage_route_id"
                name="garbage_route_id"
                value={routeId}
                onChange={(event) => setRouteId(event.target.value)}
                required={isGarbageTransport}
              >
                <option value="">Байршил сонгоно уу</option>
                {garbageRouteOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="start_date">Огноо</label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                value={shiftDate}
                onChange={(event) => setShiftDate(event.target.value)}
                required={isGarbageTransport}
              />
            </div>
          </div>

          <div className={styles.locationComposer}>
            <div className={styles.field}>
              <label htmlFor="additional_location_draft">Нэмэлт байршил</label>
              <div className={styles.inlineFieldRow}>
                <input
                  id="additional_location_draft"
                  name="additional_location_draft"
                  type="text"
                  value={extraLocationDraft}
                  onChange={(event) => setExtraLocationDraft(event.target.value)}
                  onKeyDown={handleExtraLocationKeyDown}
                  placeholder="Жишээ: 12-р байрны урд тал"
                />
                <button
                  type="button"
                  className={`${styles.secondaryButton} ${styles.locationAddButton}`}
                  onClick={handleAddExtraLocation}
                  disabled={!extraLocationDraft.trim()}
                >
                  Нэмэх
                </button>
              </div>
              <small className={styles.fieldHint}>
                Сонгосон байршлаас гадна нэмэлтээр оруулах цэг, байрлалаа бичээд нэмнэ.
              </small>
            </div>

            {extraLocations.length ? (
              <div className={styles.locationList} aria-label="Нэмэлт байршлууд">
                {extraLocations.map((location) => (
                  <div className={styles.locationChip} key={location}>
                    <span>{location}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setExtraLocations((currentLocations) =>
                          currentLocations.filter((item) => item !== location),
                        )
                      }
                      aria-label={`${location} байршлыг хасах`}
                    >
                      Хасах
                    </button>
                    <input type="hidden" name="additional_locations" value={location} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <input type="hidden" name="name" value={generatedName} />

          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <span className={styles.eyebrow}>Хог тээвэрлэлтийн ажил</span>
              <strong>
                {generatedName ||
                  "Машин, байршил сонгоход нэр автоматаар үүснэ"}
              </strong>
            </div>

            <div className={styles.previewGrid}>
              <div className={styles.previewMeta}>
                <span>Сонгосон машин</span>
                <strong>{selectedVehicle?.plate || "Сонгоогүй"}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Байршил</span>
                <strong>{selectedRoute?.label || "Сонгоогүй"}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Нэмэлт байршил</span>
                <strong>{extraLocations.length ? `${extraLocations.length} нэмсэн` : "Нэмээгүй"}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Цэгийн тоо</span>
                <strong>{selectedRoute ? `${selectedRoute.pointCount} цэг` : "—"}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Ээлж</span>
                <strong>{selectedRoute ? formatShiftLabel(selectedRoute.shiftType) : "—"}</strong>
              </div>
            </div>

            <p className={styles.helperNote}>
              Сонгосон машин, байршил, огноогоор нэг ажил үүснэ. Тухайн байршлын хог ачих цэг
              бүр ажил дотор тусдаа ажилбар болж автоматаар үүснэ. Нэмэлт байршлууд мөн тусдаа
              ажилбар болж нэмэгдэнэ.
            </p>
            <p className={styles.helperNote}>
              Огноо: <strong>{formatDateLabel(shiftDate)}</strong>
            </p>
          </div>
        </>
      ) : (
        <>
          <div className={styles.field}>
            <label htmlFor="name">Ажлын нэр</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Жишээ: Хаврын тохижилтын ажил"
              required
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="manager_id">Хариуцах ажилтан</label>
              <select id="manager_id" name="manager_id" defaultValue="">
                <option value="">Дараа нь сонгоно</option>
                {managerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.login})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="operation_type">Ажлын төрөл</label>
              <select
                id="operation_type"
                name="operation_type"
                value={operationType}
                onChange={(event) => setOperationType(event.target.value)}
                required
              >
                <option value="">Ажлын төрөл сонгоно уу</option>
                {workTypeOptions.map((option) => (
                  <option key={option.id} value={option.operationType}>
                    {option.name}
                  </option>
                ))}
              </select>
              <small className={styles.fieldHint}>
                {selectedWorkType
                  ? unitHelperText
                  : "Ажлын төрлөө сонгосноор зөвшөөрөгдсөн хэмжих нэгжүүд харагдана."}
              </small>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="start_date">Эхлэх огноо</label>
              <input id="start_date" name="start_date" type="date" />
            </div>

            <div className={styles.field}>
              <label htmlFor="deadline">Дуусах огноо</label>
              <input id="deadline" name="deadline" type="date" />
            </div>
          </div>

          <div className={styles.optionalSection}>
            <input
              id="track_quantity"
              name="track_quantity"
              type="checkbox"
              value="1"
              checked={trackQuantity}
              onChange={(event) => setTrackQuantity(event.target.checked)}
              className={styles.optionalCheckbox}
            />
            <label htmlFor="track_quantity" className={styles.optionalToggle}>
              <span>
                <span className={styles.optionalToggleTitle}>Төлөвлөсөн хэмжээ ашиглах</span>
                <span className={styles.optionalToggleText}>
                  Шаардлагатай үед төлөвлөсөн хэмжээ болон хэмжих нэгжийг master-data
                  dropdown-оос сонгож бүртгэнэ.
                </span>
              </span>
            </label>

            <div
              className={`${styles.optionalFields} ${
                trackQuantity ? styles.optionalFieldsVisible : ""
              }`}
            >
              <div className={styles.field}>
                <label htmlFor="planned_quantity">Төлөвлөсөн хэмжээ</label>
                <input
                  id="planned_quantity"
                  name="planned_quantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="48"
                />
              </div>

              <div className={styles.field}>
                <label>Хэмжих нэгж</label>
                <SearchableSelect
                  name="unit_id"
                  value={selectedUnitId}
                  options={unitOptions}
                  placeholder="Хэмжих нэгж сонгоно уу"
                  disabled={!selectedWorkType}
                  searchPlaceholder="Нэгж хайна уу"
                  emptyStateLabel="Энэ ажлын төрөлд тохирох нэгж алга."
                  onChange={setSelectedUnitOverrideId}
                />
                <small className={styles.fieldHint}>{unitHelperText}</small>
              </div>
            </div>
          </div>
        </>
      )}

      <div className={styles.buttonRow}>
        <button type="submit" className={styles.primaryButton}>
          {isGarbageTransport ? "Хог тээвэрлэлтийн ажил үүсгэх" : "Ажил үүсгэх"}
        </button>
      </div>
    </form>
  );
}
