"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";

import {
  CalendarDays,
  FileText,
  Layers3,
  Paperclip,
  Route,
  Truck,
} from "lucide-react";

import styles from "@/app/workspace.module.css";
import type {
  DepartmentOption,
  GarbageRouteOption,
  GarbageVehicleOption,
  SelectOption,
} from "@/lib/workspace";

const GARBAGE_TRANSPORT_KEYWORD = "хог тээвэрлэлтийн";
const AUTO_BASE_KEYWORD = "авто бааз";
const WEEKDAY_OPTIONS = [
  { key: "monday", label: "Даваа" },
  { key: "tuesday", label: "Мягмар" },
  { key: "wednesday", label: "Лхагва" },
  { key: "thursday", label: "Пүрэв" },
  { key: "friday", label: "Баасан" },
  { key: "saturday", label: "Бямба" },
  { key: "sunday", label: "Ням" },
] as const;

type SeasonalLineDraft = {
  id: string;
  khorooLabel: string;
  locationName: string;
  plannedVehicleCount: string;
  plannedTonnage: string;
  workDate: string;
  routeId: string;
  remarks: string;
};
const CUSTOM_WORK_TYPE_VALUE = "__new_work__";

type FilePreview = {
  name: string;
  type: string;
  url: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  departmentOptions: DepartmentOption[];
  managerOptions: SelectOption[];
  garbageVehicleOptions: GarbageVehicleOption[];
  garbageRouteOptions: GarbageRouteOption[];
  lockedDepartmentId?: string;
  lockedDepartmentLabel?: string;
  initialDepartmentId?: string;
};

function SubmitWorkButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={`${styles.primaryButton} ${pending ? styles.primaryButtonPending : ""}`}
      disabled={pending}
      aria-busy={pending}
    >
      <span className={styles.submitSpinner} aria-hidden />
      <span>{pending ? "Уншиж байна..." : label}</span>
    </button>
  );
}

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

  const monthNames = [
    "нэгдүгээр сар",
    "хоёрдугаар сар",
    "гуравдугаар сар",
    "дөрөвдүгээр сар",
    "тавдугаар сар",
    "зургаадугаар сар",
    "долдугаар сар",
    "наймдугаар сар",
    "есдүгээр сар",
    "аравдугаар сар",
    "арван нэгдүгээр сар",
    "арван хоёрдугаар сар",
  ];

  return `${parsed.getFullYear()} оны ${monthNames[parsed.getMonth()]}ын ${parsed.getDate()}`;
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

function emptySeasonalLine(index: number): SeasonalLineDraft {
  return {
    id: `seasonal-line-${index}-${Date.now()}`,
    khorooLabel: "",
    locationName: "",
    plannedVehicleCount: "",
    plannedTonnage: "",
    workDate: "",
    routeId: "",
    remarks: "",
  };
}

export function NewWorkForm({
  action,
  departmentOptions,
  managerOptions,
  garbageVehicleOptions,
  garbageRouteOptions,
  lockedDepartmentId,
  lockedDepartmentLabel,
  initialDepartmentId,
}: Props) {
  const defaultDepartmentId = lockedDepartmentId ?? initialDepartmentId ?? "";
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId);
  const [operationUnit, setOperationUnit] = useState(() => {
    const initialDepartment = departmentOptions.find(
      (option) => String(option.id) === defaultDepartmentId,
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
  const [seasonalStartDate, setSeasonalStartDate] = useState(getTodayValue());
  const [seasonalEndDate, setSeasonalEndDate] = useState(getTodayValue());
  const [seasonalWorkDays, setSeasonalWorkDays] = useState<Array<(typeof WEEKDAY_OPTIONS)[number]["key"]>>([
    "monday",
    "wednesday",
    "friday",
  ]);
  const [seasonalLines, setSeasonalLines] = useState<SeasonalLineDraft[]>([
    emptySeasonalLine(0),
  ]);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);

  const selectedDepartment = useMemo(
    () => departmentOptions.find((option) => String(option.id) === departmentId) ?? null,
    [departmentId, departmentOptions],
  );

  useEffect(
    () => () => {
      filePreviews.forEach((file) => URL.revokeObjectURL(file.url));
    },
    [filePreviews],
  );
  const selectedDepartmentHead = useMemo(() => {
    const departmentHeadOptions = managerOptions.filter(
      (option) => option.role === "project_manager",
    );

    if (!selectedDepartment) {
      return departmentHeadOptions.length === 1 ? departmentHeadOptions[0] : null;
    }

    const selectedDepartmentNames = [selectedDepartment.name, selectedDepartment.label]
      .map(normalizeDepartmentValue)
      .filter(Boolean);
    const matchingDepartmentHead = departmentHeadOptions.find((option) => {
      const managerDepartmentName = normalizeDepartmentValue(option.departmentName);
      if (!managerDepartmentName) {
        return false;
      }

      return selectedDepartmentNames.some(
        (departmentName) =>
          managerDepartmentName === departmentName ||
          managerDepartmentName.includes(departmentName) ||
          departmentName.includes(managerDepartmentName),
      );
    });

    return matchingDepartmentHead ?? (departmentHeadOptions.length === 1 ? departmentHeadOptions[0] : null);
  }, [managerOptions, selectedDepartment]);
  const selectedVehicle = useMemo(
    () => garbageVehicleOptions.find((option) => String(option.id) === vehicleId) ?? null,
    [garbageVehicleOptions, vehicleId],
  );
  const selectedRoute = useMemo(
    () => garbageRouteOptions.find((option) => String(option.id) === routeId) ?? null,
    [garbageRouteOptions, routeId],
  );
  const isCombinedDepartment = isCombinedOperationsDepartment(selectedDepartment);
  const supportsGarbageTransport = isGarbageTransportDepartment(selectedDepartment);
  const isGarbageTransport =
    supportsGarbageTransport && operationUnit === "garbage_transport";
  const isSeasonalGarbage =
    supportsGarbageTransport && operationUnit === "garbage_seasonal";
  const isDepartmentLocked = Boolean(lockedDepartmentId);
  const submitLabel = isGarbageTransport
    ? "Хог тээвэрлэлтийн ажил үүсгэх"
    : isSeasonalGarbage
      ? "Улирлын төлөвлөгөө үүсгэх"
      : "Ажил үүсгэх";

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

  const activeSeasonalLines = seasonalLines.filter(
    (line) =>
      line.khorooLabel ||
      line.locationName ||
      line.plannedVehicleCount ||
      line.plannedTonnage ||
      line.workDate,
  );
  const seasonalTotals = activeSeasonalLines.reduce(
    (summary, line) => ({
      vehicleCount: summary.vehicleCount + (Number(line.plannedVehicleCount) || 0),
      tonnage: summary.tonnage + (Number(line.plannedTonnage) || 0),
    }),
    { vehicleCount: 0, tonnage: 0 },
  );

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

  const updateSeasonalLine = (
    targetId: string,
    key: keyof Omit<SeasonalLineDraft, "id">,
    value: string,
  ) => {
    setSeasonalLines((current) =>
      current.map((line) => (line.id === targetId ? { ...line, [key]: value } : line)),
    );
  };

  const toggleSeasonalWorkDay = (dayKey: (typeof WEEKDAY_OPTIONS)[number]["key"]) => {
    setSeasonalWorkDays((current) =>
      current.includes(dayKey)
        ? current.filter((value) => value !== dayKey)
        : [...current, dayKey],
    );
  };

  const seasonWorkDaysLabel = seasonalWorkDays.length
    ? WEEKDAY_OPTIONS.filter((item) => seasonalWorkDays.includes(item.key))
        .map((item) => item.label)
        .join(", ")
    : "Сонгоогүй";

  const formModeLabel = isGarbageTransport
    ? "Хог тээвэрлэлтийн маршрут"
    : isSeasonalGarbage
      ? "Улирлын хог ачилтын төлөвлөгөө"
      : "Ерөнхий ажил";
  const formModeDescription = isGarbageTransport
    ? "Машин, маршрут, огноо сонгоход ажил болон маршрутын цэгүүдийн ажилбар автоматаар үүснэ."
    : isSeasonalGarbage
      ? "Хорооны байрлал, машин, тонн, ажиллах өдрүүдээр олон мөрийн төлөвлөгөө үүсгэнэ."
      : "Ажлын нэр, хариуцсан хэлтсийн дарга, хугацаагаа оруулна.";
  const selectedDepartmentLabel =
    lockedDepartmentLabel ?? selectedDepartment?.label ?? selectedDepartment?.name ?? "Сонгоогүй";

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
    <form action={action} className={`${styles.form} ${styles.createWorkForm}`}>
      <div className={styles.createWorkIntro}>
        <div className={styles.createWorkIntroCopy}>
          <span className={styles.formBadge}>Ажил нэмэх урсгал</span>
          <h2>{formModeLabel}</h2>
          <p>{formModeDescription}</p>
        </div>

        <div className={styles.createWorkSteps} aria-label="Ажил үүсгэх алхам">
          <div className={styles.createWorkStep}>
            <span><Layers3 aria-hidden /></span>
            <strong>Хэлтэс ба горим</strong>
            <small>{selectedDepartmentLabel}</small>
          </div>
        </div>

        <div className={styles.createWorkSignalGrid} aria-label="Сонгосон ажлын товч мэдээлэл">
          {isGarbageTransport ? (
            <>
              <div>
                <Truck aria-hidden />
                <span>Техник</span>
                <strong>{selectedVehicle?.plate || "Сонгоогүй"}</strong>
              </div>
              <div>
                <Route aria-hidden />
                <span>Маршрут</span>
                <strong>{selectedRoute?.code || selectedRoute?.name || "Сонгоогүй"}</strong>
              </div>
            </>
          ) : null}
          <div>
            <CalendarDays aria-hidden />
            <span>Огноо</span>
            <strong>
              {isSeasonalGarbage
                ? `${formatDateLabel(seasonalStartDate)} - ${formatDateLabel(seasonalEndDate)}`
                : formatDateLabel(shiftDate)}
            </strong>
          </div>
        </div>
      </div>

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

      {supportsGarbageTransport ? (
        <div className={styles.optionalSection}>
          <div className={styles.field}>
            <label>Ажлын горим</label>
            <div className={styles.modeRail}>
              {isCombinedDepartment ? (
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
              ) : null}

              <button
                type="button"
                className={`${styles.modeChip} ${
                  operationUnit === "garbage_transport" ? styles.modeChipActive : ""
                }`}
                onClick={() => setOperationUnit("garbage_transport")}
              >
                <span>Тогтмол маршрут</span>
                <small>Машин, маршрут, цэгийн өдөр тутмын ажил</small>
              </button>

              <button
                type="button"
                className={`${styles.modeChip} ${
                  operationUnit === "garbage_seasonal" ? styles.modeChipActive : ""
                }`}
                onClick={() => setOperationUnit("garbage_seasonal")}
              >
                <span>Улирлын хог ачилт</span>
                <small>Огнооны хүрээ, өдрүүд, байршлын мөрөөр төлөвлөнө</small>
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
      ) : isSeasonalGarbage ? (
        <>
          <div className={styles.field}>
            <label htmlFor="seasonal-name">Төлөвлөгөөний нэр</label>
            <input
              id="seasonal-name"
              name="name"
              type="text"
              placeholder="Жишээ: 2026 хаврын үүсмэл хог ачилтын төлөвлөгөө"
              required={isSeasonalGarbage}
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="seasonal-start-date">Эхлэх огноо</label>
              <input
                id="seasonal-start-date"
                name="start_date"
                type="date"
                value={seasonalStartDate}
                onChange={(event) => setSeasonalStartDate(event.target.value)}
                required={isSeasonalGarbage}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="seasonal-end-date">Дуусах огноо</label>
              <input
                id="seasonal-end-date"
                name="deadline"
                type="date"
                value={seasonalEndDate}
                onChange={(event) => setSeasonalEndDate(event.target.value)}
                required={isSeasonalGarbage}
              />
            </div>
          </div>

          <div className={styles.optionalSection}>
            <div className={styles.field}>
              <label>Ажиллах өдрүүд</label>
              <div className={styles.modeRail}>
                {WEEKDAY_OPTIONS.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    className={`${styles.modeChip} ${
                      seasonalWorkDays.includes(day.key) ? styles.modeChipActive : ""
                    }`}
                    onClick={() => toggleSeasonalWorkDay(day.key)}
                  >
                    <span>{day.label}</span>
                    <small>Төлөвлөгөөнд энэ өдрийг оруулна</small>
                  </button>
                ))}
              </div>
            </div>
            <input
              type="hidden"
              name="seasonal_work_days_json"
              value={JSON.stringify(seasonalWorkDays)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="seasonal-notes">Тайлбар</label>
            <textarea
              id="seasonal-notes"
              name="seasonal_notes"
              placeholder="Ээлж, онцгой нөхцөл, зохион байгуулалтын тайлбар"
            />
          </div>

          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <span className={styles.eyebrow}>Байршлын мөрүүд</span>
              <strong>Хороо, байршил, машин, тонн мэдээллээр төлөвлөнө</strong>
            </div>

            <div className={styles.previewGrid}>
              <div className={styles.previewMeta}>
                <span>Мөрийн тоо</span>
                <strong>{activeSeasonalLines.length || seasonalLines.length}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Нийт машин</span>
                <strong>{seasonalTotals.vehicleCount} машин</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Нийт тонн</span>
                <strong>{Math.round(seasonalTotals.tonnage * 100) / 100} тн</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Ажиллах өдрүүд</span>
                <strong>{seasonWorkDaysLabel}</strong>
              </div>
            </div>

            <p className={styles.helperNote}>
              Огнооны хүрээ: <strong>{formatDateLabel(seasonalStartDate)}</strong> -
              <strong> {formatDateLabel(seasonalEndDate)}</strong>
            </p>
          </div>

          {seasonalLines.map((line, index) => (
            <div key={line.id} className={styles.optionalSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>Мөр {index + 1}</span>
                  <small className={styles.sectionNote}>
                    Хороо, байршил, машин тоо, тонныг мөрөөр оруулна.
                  </small>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() =>
                    setSeasonalLines((current) =>
                      current.length > 1
                        ? current.filter((item) => item.id !== line.id)
                        : current,
                    )
                  }
                  disabled={seasonalLines.length === 1}
                >
                  Мөр хасах
                </button>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Хороо</label>
                  <input
                    type="text"
                    value={line.khorooLabel}
                    onChange={(event) =>
                      updateSeasonalLine(line.id, "khorooLabel", event.target.value)
                    }
                    placeholder="Жишээ: 9-р хороо"
                  />
                </div>

                <div className={styles.field}>
                  <label>Байршил</label>
                  <input
                    type="text"
                    value={line.locationName}
                    onChange={(event) =>
                      updateSeasonalLine(line.id, "locationName", event.target.value)
                    }
                    placeholder="Жишээ: Морин уулын доод жалга"
                  />
                </div>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Машин тоо</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={line.plannedVehicleCount}
                    onChange={(event) =>
                      updateSeasonalLine(line.id, "plannedVehicleCount", event.target.value)
                    }
                    placeholder="1"
                  />
                </div>

                <div className={styles.field}>
                  <label>Тонн</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={line.plannedTonnage}
                    onChange={(event) =>
                      updateSeasonalLine(line.id, "plannedTonnage", event.target.value)
                    }
                    placeholder="12.5"
                  />
                </div>

                <div className={styles.field}>
                  <label>Ажлын өдөр</label>
                  <input
                    type="date"
                    value={line.workDate}
                    min={seasonalStartDate || undefined}
                    max={seasonalEndDate || undefined}
                    onChange={(event) =>
                      updateSeasonalLine(line.id, "workDate", event.target.value)
                    }
                  />
                  <small className={styles.fieldHint}>
                    Хоосон орхивол ерөнхий өдрүүдийн хуваарийг дагана.
                  </small>
                </div>

                <div className={styles.field}>
                  <label>Маршрут</label>
                  <select
                    value={line.routeId}
                    onChange={(event) =>
                      updateSeasonalLine(line.id, "routeId", event.target.value)
                    }
                  >
                    <option value="">Маршрутгүй</option>
                    {garbageRouteOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.field}>
                <label>Тэмдэглэл</label>
                <textarea
                  value={line.remarks}
                  onChange={(event) =>
                    updateSeasonalLine(line.id, "remarks", event.target.value)
                  }
                  placeholder="Тусгай чиглэл, заавар, хаяглал"
                />
              </div>
            </div>
          ))}

          <input
            type="hidden"
            name="seasonal_lines_json"
            value={JSON.stringify(
              seasonalLines.map((line, index) => ({
                sequence: index + 1,
                khorooLabel: line.khorooLabel,
                locationName: line.locationName,
                plannedVehicleCount: line.plannedVehicleCount,
                plannedTonnage: line.plannedTonnage,
                workDate: line.workDate || null,
                routeId: line.routeId ? Number(line.routeId) : null,
                remarks: line.remarks,
              })),
            )}
          />

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() =>
                setSeasonalLines((current) => [...current, emptySeasonalLine(current.length)])
              }
            >
              Мөр нэмэх
            </button>
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
          <input type="hidden" name="operation_type" value={CUSTOM_WORK_TYPE_VALUE} />

          <div className={styles.field}>
            <label>Хариуцах ажилтан</label>
            <div className={styles.lockedFieldValue}>
              {selectedDepartmentHead
                ? [
                    selectedDepartmentHead.name,
                    selectedDepartmentHead.jobTitle,
                    selectedDepartmentHead.login,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : selectedDepartment
                  ? "Хэлтсийн дарга олдсонгүй"
                  : "Эхлээд хэлтэс сонгоно уу"}
            </div>
            <input
              type="hidden"
              name="manager_id"
              value={selectedDepartmentHead ? String(selectedDepartmentHead.id) : ""}
            />
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
        </>
      )}

      <div className={styles.field}>
        <label htmlFor="project-files">Файл хавсаргах</label>
        <textarea
          id="project-description"
          name="project_description"
          placeholder="Хавсралт болон ажлын дэлгэрэнгүй тайлбар бичнэ үү"
          rows={4}
        />
        <small className={styles.fieldHint}>
          Энэ тайлбар ажлын дэлгэрэнгүй дээр харагдана.
        </small>
        <label className={styles.fileDropZone} htmlFor="project-files">
          <Paperclip aria-hidden />
          <span>PDF, зураг, бичиг баримт олон файлаар хавсаргана</span>
        </label>
        <input
          id="project-files"
          name="project_files"
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
                ) : (
                  <FileText aria-hidden />
                )}
                <span>{file.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.buttonRow}>
        <SubmitWorkButton label={submitLabel} />
      </div>
    </form>
  );
}
