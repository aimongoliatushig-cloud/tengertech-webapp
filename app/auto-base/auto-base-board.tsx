"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { updateFleetVehicleAction } from "./actions";

import styles from "./page.module.css";

type FleetVehicleCrewAssignment = {
  teamId: number;
  teamName: string;
  operationType: string;
  driverNames: string[];
  loaderNames: string[];
  memberNames: string[];
};

type FleetVehicleBoardItem = {
  id: number;
  plate: string;
  name: string;
  modelId: number | null;
  modelName: string;
  categoryId: number | null;
  categoryName: string;
  vehicleTypeId: number | null;
  vehicleTypeName: string;
  departmentId: number | null;
  departmentName: string;
  vin: string;
  odometerValue: string;
  odometerLabel: string;
  fuelTypeKey: string;
  fuelTypeLabel: string;
  fleetDriverName: string;
  responsibleDriverId: number | null;
  responsibleDriverName: string;
  loader1Id: number | null;
  loader1Name: string;
  loader2Id: number | null;
  loader2Name: string;
  stateLabel: string;
  operationalStatusKey: string;
  latestRepairState: string;
  isOperational: boolean;
  isRepair: boolean;
  isArchived: boolean;
  insurance: FleetVehicleDeadlineInfo;
  inspection: FleetVehicleDeadlineInfo;
  driverHistory: FleetVehicleDriverHistoryItem[];
  repairHistory: FleetVehicleRepairHistoryItem[];
  weightReports: FleetVehicleDailyWeightItem[];
  fuelReports: FleetVehicleDailyFuelItem[];
  procurementLinks: FleetVehicleProcurementLink[];
  crewAssignments: FleetVehicleCrewAssignment[];
};

type FleetVehicleDriverOption = {
  id: number;
  name: string;
  active: boolean;
  departmentName: string;
  jobTitle: string;
};

type FleetVehicleDepartmentOption = {
  id: number;
  name: string;
};

type FleetVehicleSelectOption = {
  id: number;
  name: string;
};

type FleetVehicleDeadlineInfo = {
  company?: string;
  policyNumber?: string;
  startDate?: string;
  endDate?: string;
  startDateValue?: string;
  endDateValue?: string;
  daysRemaining: number;
  reminderDue: boolean;
  note?: string;
  attachmentCount: number;
};

type FleetVehicleDriverHistoryItem = {
  id: number;
  driverName: string;
  dateStart: string;
  dateEnd: string;
  changedBy: string;
  changedDate: string;
};

type FleetVehicleRepairHistoryItem = {
  id: number;
  name: string;
  requestDate: string;
  dateRange: string;
  damageType: string;
  description: string;
  partsNote: string;
  amountLabel: string;
  mechanicName: string;
  stateLabel: string;
  procurementName: string;
  attachmentCount: number;
};

type FleetVehicleDailyWeightItem = {
  id: number;
  reportDate: string;
  weightLabel: string;
  source: string;
  fetchedAt: string;
  stateLabel: string;
  errorMessage: string;
};

type FleetVehicleDailyFuelItem = {
  id: number;
  reportDate: string;
  fuelLabel: string;
  fuelType: string;
  source: string;
  fetchedAt: string;
  stateLabel: string;
  errorMessage: string;
};

type FleetVehicleProcurementLink = {
  id: number;
  name: string;
  repairName: string;
  amountLabel: string;
  stateLabel: string;
};

type FleetVehicleBoard = {
  allVehicles: FleetVehicleBoardItem[];
  activeVehicles: FleetVehicleBoardItem[];
  repairVehicles: FleetVehicleBoardItem[];
  driverOptions: FleetVehicleDriverOption[];
  loaderOptions: FleetVehicleDriverOption[];
  departmentOptions: FleetVehicleDepartmentOption[];
  modelOptions: FleetVehicleSelectOption[];
  vehicleTypeOptions: FleetVehicleSelectOption[];
  categoryOptions: FleetVehicleSelectOption[];
  totalVehicles: number;
  activeCount: number;
  repairCount: number;
  insuranceDueCount: number;
  inspectionDueCount: number;
  todayWeightLabel: string;
  todayFuelLabel: string;
  highestFuelVehicle: string;
  mostRepairedVehicle: string;
  failedImportCount: number;
};

type VehicleFilterKey = "active" | "repair";

type BucketConfig = {
  key: VehicleFilterKey;
  title: string;
  count: number;
  description: string;
  hint: string;
  emptyLabel: string;
  vehicles: FleetVehicleBoardItem[];
  tone: "active" | "repair";
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function meterStyle(count: number, total: number): CSSProperties {
  return {
    "--vehicle-share": total > 0 ? count / total : 0,
  } as CSSProperties;
}

function VehicleList({
  vehicles,
  emptyLabel,
  onSelectVehicle,
}: {
  vehicles: FleetVehicleBoardItem[];
  emptyLabel: string;
  onSelectVehicle: (vehicle: FleetVehicleBoardItem) => void;
}) {
  if (!vehicles.length) {
    return <div className={styles.emptyState}>{emptyLabel}</div>;
  }

  return (
    <div className={styles.vehicleList}>
      {vehicles.map((vehicle) => (
        <button
          key={vehicle.id}
          type="button"
          className={styles.vehicleCard}
          onClick={() => onSelectVehicle(vehicle)}
        >
          <div className={styles.vehicleTop}>
            <strong className={styles.vehiclePlate}>{vehicle.plate}</strong>
            <span
              className={cx(
                styles.vehicleState,
                vehicle.isRepair ? styles.vehicleStateRepair : styles.vehicleStateActive,
              )}
            >
              {vehicle.isRepair
                ? vehicle.latestRepairState || vehicle.stateLabel || "Засварт"
                : vehicle.stateLabel || (vehicle.isOperational ? "Идэвхтэй" : "Бүртгэлтэй")}
            </span>
          </div>
          <p className={styles.vehicleName}>{vehicle.name}</p>
          <span className={styles.vehicleMetaLine}>{vehicleCrewRoleSummary(vehicle)}</span>
          <span className={styles.vehicleCrewPreview}>
            {assignedCrewCount(vehicle)
              ? `${assignedCrewCount(vehicle)} хүн · ${assignedLoaderCount(vehicle)} ачигч`
              : "Хуваарилсан хүнгүй"}
          </span>
        </button>
      ))}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.vehicleDetailItem}>
      <span>{label}</span>
      <strong>{value || "Бүртгээгүй"}</strong>
    </div>
  );
}

function namesLabel(names: string[]) {
  return names.length ? names.join(", ") : "Оноогоогүй";
}

function vehicleCrewRoleSummary(vehicle: FleetVehicleBoardItem) {
  const loaders = [vehicle.loader1Name, vehicle.loader2Name].filter(Boolean);
  const parts = [
    vehicle.responsibleDriverName ? `Жолооч: ${vehicle.responsibleDriverName}` : "",
    loaders.length ? `Ачигч: ${loaders.join(", ")}` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : "Жолооч, ачигч оноогоогүй";
}

function directCrewMembers(vehicle: FleetVehicleBoardItem) {
  return [
    vehicle.responsibleDriverName
      ? { key: "driver", label: "Хариуцсан жолооч", name: vehicle.responsibleDriverName }
      : null,
    vehicle.loader1Name ? { key: "loader1", label: "Ачигч 1", name: vehicle.loader1Name } : null,
    vehicle.loader2Name ? { key: "loader2", label: "Ачигч 2", name: vehicle.loader2Name } : null,
  ].filter((member): member is { key: string; label: string; name: string } => Boolean(member));
}

function uniqueCrewNames(names: string[]) {
  const seen = new Set<string>();
  return names.filter((name) => {
    const normalized = normalizeStaffText(name);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function assignedDriverCount(vehicle: FleetVehicleBoardItem) {
  return uniqueCrewNames([
    vehicle.responsibleDriverName,
    ...vehicle.crewAssignments.flatMap((assignment) => assignment.driverNames),
  ]).length;
}

function assignedLoaderCount(vehicle: FleetVehicleBoardItem) {
  return uniqueCrewNames([
    vehicle.loader1Name,
    vehicle.loader2Name,
    ...vehicle.crewAssignments.flatMap((assignment) => assignment.loaderNames),
  ]).length;
}

function assignedCrewCount(vehicle: FleetVehicleBoardItem) {
  return uniqueCrewNames([
    vehicle.responsibleDriverName,
    vehicle.loader1Name,
    vehicle.loader2Name,
    ...vehicle.crewAssignments.flatMap((assignment) => [
      ...assignment.driverNames,
      ...assignment.loaderNames,
      ...assignment.memberNames,
    ]),
  ]).length;
}

function operationTypeLabel(value: string) {
  const labels: Record<string, string> = {
    garbage: "Хог тээвэр",
    street_cleaning: "Гудамж цэвэрлэгээ",
    green_maintenance: "Ногоон байгууламж",
  };
  return labels[value] ?? value;
}

const vehicleStatusOptions = [
  { value: "available", label: "Ажиллаж байгаа" },
  { value: "assigned", label: "Оноогдсон" },
  { value: "in_repair", label: "Засвартай" },
  { value: "broken", label: "Эвдэрсэн" },
  { value: "retired", label: "Ашиглалтаас гарсан" },
  { value: "inactive", label: "Идэвхгүй" },
];

const fuelTypeOptions = [
  { value: "diesel", label: "Дизель" },
  { value: "gasoline", label: "Бензин" },
  { value: "electric", label: "Цахилгаан" },
  { value: "hybrid", label: "Хосолсон" },
  { value: "lpg", label: "Газ" },
];

function displayValue(value?: string | number) {
  return value === undefined || value === null || value === "" ? "Бүртгээгүй" : String(value);
}

function normalizeStaffText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatStaffOption(option: FleetVehicleDriverOption) {
  return [
    option.name,
    option.departmentName,
    option.jobTitle,
    option.active ? "" : "Идэвхгүй",
  ]
    .filter(Boolean)
    .join(" · ");
}

function findStaffOption(value: string, options: FleetVehicleDriverOption[]) {
  const normalized = normalizeStaffText(value);
  if (!normalized) {
    return null;
  }

  const exact = options.find(
    (option) =>
      normalizeStaffText(formatStaffOption(option)) === normalized ||
      normalizeStaffText(option.name) === normalized,
  );
  if (exact) {
    return exact;
  }

  const startsWithMatches = options.filter((option) =>
    normalizeStaffText(formatStaffOption(option)).startsWith(normalized),
  );
  if (startsWithMatches.length === 1) {
    return startsWithMatches[0];
  }

  const includesMatches = options.filter((option) =>
    normalizeStaffText(formatStaffOption(option)).includes(normalized),
  );
  return includesMatches.length === 1 ? includesMatches[0] : null;
}

function DeadlinePanel({
  title,
  info,
}: {
  title: string;
  info: FleetVehicleDeadlineInfo;
}) {
  return (
    <div className={styles.deadlinePanel}>
      <div className={styles.deadlinePanelHeader}>
        <strong>{title}</strong>
        {info.reminderDue ? <span className={styles.warningBadge}>Сануулах</span> : null}
      </div>
      <div className={styles.vehicleDetailGrid}>
        {"company" in info ? <DetailItem label="Компани" value={info.company || ""} /> : null}
        {"policyNumber" in info ? <DetailItem label="Гэрээний дугаар" value={info.policyNumber || ""} /> : null}
        <DetailItem label="Эхлэх / орсон огноо" value={info.startDate || ""} />
        <DetailItem label="Дуусах / дараагийн огноо" value={info.endDate || ""} />
        <DetailItem label="Үлдсэн хоног" value={String(info.daysRemaining || 0)} />
        <DetailItem label="Баримт" value={`${info.attachmentCount || 0} файл`} />
      </div>
      {info.note ? <p className={styles.inlineNote}>{info.note}</p> : null}
    </div>
  );
}

function EmptyPanel({ children }: { children: string }) {
  return <div className={styles.emptyState}>{children}</div>;
}

function DriverHistoryList({ items }: { items: FleetVehicleDriverHistoryItem[] }) {
  if (!items.length) {
    return <EmptyPanel>Жолоочийн түүх бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <strong>{item.driverName}</strong>
          <span>{displayValue(item.dateStart)} - {displayValue(item.dateEnd)}</span>
          <small>{displayValue(item.changedBy)} · {displayValue(item.changedDate)}</small>
        </article>
      ))}
    </div>
  );
}

function StaffPicker({
  vehicleId,
  name,
  label,
  placeholder,
  options,
  defaultId,
}: {
  vehicleId: number;
  name: string;
  label: string;
  placeholder: string;
  options: FleetVehicleDriverOption[];
  defaultId: number | null;
}) {
  const defaultOption = defaultId ? options.find((option) => option.id === defaultId) : undefined;
  const [query, setQuery] = useState(defaultOption ? formatStaffOption(defaultOption) : "");
  const [selectedId, setSelectedId] = useState(defaultOption ? String(defaultOption.id) : "");
  const listId = `${name}-${vehicleId}-options`;
  const hasUnmatchedQuery = query.trim().length > 0 && !selectedId;

  function updateSelection(value: string) {
    setQuery(value);
    const selected = findStaffOption(value, options);
    setSelectedId(selected ? String(selected.id) : "");
  }

  return (
    <label className={styles.vehicleFormField}>
      <span>{label}</span>
      <input type="hidden" name={name} value={selectedId} />
      <input
        name={`${name}_label`}
        list={listId}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => updateSelection(event.target.value)}
        onBlur={(event) => updateSelection(event.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={formatStaffOption(option)} />
        ))}
      </datalist>
      {hasUnmatchedQuery ? (
        <small className={styles.formHintError}>HR жагсаалтаас сонгоно уу.</small>
      ) : null}
    </label>
  );
}

function DriverAssignmentForm({
  vehicle,
  driverOptions,
  loaderOptions,
}: {
  vehicle: FleetVehicleBoardItem;
  driverOptions: FleetVehicleDriverOption[];
  loaderOptions: FleetVehicleDriverOption[];
}) {
  return (
    <section className={styles.driverAssignmentPanel}>
      <div className={styles.driverAssignmentIntro}>
        <span className={styles.mobileDetailEyebrow}>Хүний нөөц</span>
        <div>
          <h3>Жолооч, ачигч оноох</h3>
          <p>
            HR бүртгэлтэй жолооч болон ачигчаас сонгож хадгалахад өмнөх жолоочийн түүх автоматаар үлдэнэ.
          </p>
        </div>
      </div>

      <form action={updateFleetVehicleAction} className={styles.driverAssignmentForm}>
        <input type="hidden" name="vehicle_id" value={vehicle.id} />

        <StaffPicker
          key={`driver-${vehicle.id}-${vehicle.responsibleDriverId ?? "none"}`}
          vehicleId={vehicle.id}
          name="municipal_responsible_driver_id"
          label="Хариуцсан жолооч"
          placeholder="Жолоочийн нэр бичиж HR жагсаалтаас сонгох"
          options={driverOptions}
          defaultId={vehicle.responsibleDriverId}
        />

        <StaffPicker
          key={`loader1-${vehicle.id}-${vehicle.loader1Id ?? "none"}`}
          vehicleId={vehicle.id}
          name="municipal_loader_1_id"
          label="Ачигч 1"
          placeholder="Ачигчийн нэр бичиж HR жагсаалтаас сонгох"
          options={loaderOptions}
          defaultId={vehicle.loader1Id}
        />

        <StaffPicker
          key={`loader2-${vehicle.id}-${vehicle.loader2Id ?? "none"}`}
          vehicleId={vehicle.id}
          name="municipal_loader_2_id"
          label="Ачигч 2"
          placeholder="Ачигчийн нэр бичиж HR жагсаалтаас сонгох"
          options={loaderOptions}
          defaultId={vehicle.loader2Id}
        />

        <div className={styles.driverAssignmentMeta}>
          <span>Одоогийн бүрэлдэхүүн</span>
          <strong>{vehicle.responsibleDriverName || "Жолооч оноогоогүй"}</strong>
          <small>
            Ачигч 1: {vehicle.loader1Name || "оноогоогүй"} · Ачигч 2:{" "}
            {vehicle.loader2Name || "оноогоогүй"}
          </small>
          <small>{driverOptions.length} HR жолооч · {loaderOptions.length} HR ачигч</small>
        </div>

        <div className={styles.vehicleModalActions}>
          <button type="submit" className={styles.primaryButton}>
            Бүрэлдэхүүн хадгалах
          </button>
        </div>
      </form>
    </section>
  );
}

function RepairHistoryList({ items }: { items: FleetVehicleRepairHistoryItem[] }) {
  if (!items.length) {
    return <EmptyPanel>Засварын түүх бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <div className={styles.historyRowTop}>
            <strong>{item.name}</strong>
            <span className={styles.stateBadge}>{item.stateLabel || "Төлөвгүй"}</span>
          </div>
          <span>{item.damageType || item.description || "Эвдрэлийн мэдээлэлгүй"}</span>
          <small>
            {displayValue(item.requestDate)} · {displayValue(item.mechanicName)} · {item.amountLabel}
          </small>
          {item.procurementName ? <small>Худалдан авалт: {item.procurementName}</small> : null}
        </article>
      ))}
    </div>
  );
}

function WeightReportList({ items }: { items: FleetVehicleDailyWeightItem[] }) {
  if (!items.length) {
    return <EmptyPanel>Жингийн тайлан бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <div className={styles.historyRowTop}>
            <strong>{item.weightLabel}</strong>
            <span className={styles.stateBadge}>{item.stateLabel}</span>
          </div>
          <span>{displayValue(item.reportDate)} · {displayValue(item.source)}</span>
          {item.errorMessage ? <small>{item.errorMessage}</small> : <small>Татсан: {displayValue(item.fetchedAt)}</small>}
        </article>
      ))}
    </div>
  );
}

function FuelReportList({ items }: { items: FleetVehicleDailyFuelItem[] }) {
  if (!items.length) {
    return <EmptyPanel>Шатахууны мэдээлэл бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <div className={styles.historyRowTop}>
            <strong>{item.fuelLabel}</strong>
            <span className={styles.stateBadge}>{item.stateLabel}</span>
          </div>
          <span>{displayValue(item.reportDate)} · {displayValue(item.fuelType)}</span>
          {item.errorMessage ? <small>{item.errorMessage}</small> : <small>Татсан: {displayValue(item.fetchedAt)}</small>}
        </article>
      ))}
    </div>
  );
}

function ProcurementList({ items }: { items: FleetVehicleProcurementLink[] }) {
  if (!items.length) {
    return <EmptyPanel>Худалдан авалтын холбоос бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <div className={styles.historyRowTop}>
            <strong>{item.name}</strong>
            <span className={styles.stateBadge}>{item.stateLabel}</span>
          </div>
          <span>{displayValue(item.repairName)}</span>
          <small>{item.amountLabel}</small>
        </article>
      ))}
    </div>
  );
}

function VehicleDetailModal({
  vehicle,
  driverOptions,
  loaderOptions,
  departmentOptions,
  modelOptions,
  vehicleTypeOptions,
  categoryOptions,
  onClose,
}: {
  vehicle: FleetVehicleBoardItem;
  driverOptions: FleetVehicleDriverOption[];
  loaderOptions: FleetVehicleDriverOption[];
  departmentOptions: FleetVehicleDepartmentOption[];
  modelOptions: FleetVehicleSelectOption[];
  vehicleTypeOptions: FleetVehicleSelectOption[];
  categoryOptions: FleetVehicleSelectOption[];
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState("main");
  const tabs = [
    { key: "main", label: "Үндсэн мэдээлэл" },
    { key: "edit", label: "Мэдээлэл засах" },
    { key: "driver", label: "Хариуцсан жолооч" },
    { key: "insurance", label: "Даатгал" },
    { key: "inspection", label: "Улсын үзлэг" },
    { key: "repair", label: "Засварын түүх" },
    { key: "weight", label: "Жингийн тайлан" },
    { key: "fuel", label: "Шатахуун" },
    { key: "procurement", label: "Худалдан авалт" },
  ];
  const directCrew = directCrewMembers(vehicle);
  const crewCount = assignedCrewCount(vehicle);
  const driverCount = assignedDriverCount(vehicle);
  const loaderCount = assignedLoaderCount(vehicle);

  return (
    <div className={styles.vehicleModalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={styles.vehicleModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`vehicle-detail-${vehicle.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.vehicleModalHeader}>
          <div>
            <span className={styles.mobileDetailEyebrow}>Машины дэлгэрэнгүй</span>
            <h2 id={`vehicle-detail-${vehicle.id}`}>{vehicle.plate}</h2>
            <p>{vehicle.name}</p>
          </div>
          <button type="button" className={styles.vehicleModalClose} onClick={onClose}>
            Хаах
          </button>
        </div>

        <div className={styles.vehicleTabBar} role="tablist" aria-label="Машины дэлгэрэнгүй цонхнууд">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={cx(styles.vehicleTabButton, activeTab === tab.key && styles.vehicleTabButtonActive)}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "main" ? (
          <section className={styles.vehicleTabPanel}>
            <div className={styles.vehicleDetailGrid}>
              <DetailItem label="Марка / модель" value={vehicle.modelName || vehicle.name} />
              <DetailItem label="Төрөл" value={vehicle.vehicleTypeName || vehicle.categoryName} />
              <DetailItem label="Хэлтэс" value={vehicle.departmentName} />
              <DetailItem label="Төлөв" value={vehicle.stateLabel} />
              <DetailItem label="Арлын дугаар" value={vehicle.vin} />
              <DetailItem label="Туулсан зам" value={vehicle.odometerLabel} />
              <DetailItem label="Хариуцсан жолооч" value={vehicle.responsibleDriverName} />
              <DetailItem label="Ачигч 1" value={vehicle.loader1Name} />
              <DetailItem label="Ачигч 2" value={vehicle.loader2Name} />
              <DetailItem label="Түлшний төрөл" value={vehicle.fuelTypeLabel} />
            </div>

            <section className={styles.vehicleCrewPanel}>
              <div className={styles.vehicleCrewHeader}>
                <span className={styles.mobileDetailEyebrow}>Хуваарилсан хүмүүс</span>
                <strong>{crewCount}</strong>
              </div>
              {crewCount ? (
                <div className={styles.vehicleCrewList}>
                  {directCrew.length ? (
                    <article className={styles.vehicleCrewCard}>
                      <p className={styles.vehicleCrewType}>Шууд оноолт</p>
                      {directCrew.map((member) => (
                        <div key={member.key}>
                          <span>{member.label}</span>
                          <strong>{member.name}</strong>
                        </div>
                      ))}
                    </article>
                  ) : null}
                  {vehicle.crewAssignments.map((assignment) => (
                    <article key={assignment.teamId} className={styles.vehicleCrewCard}>
                      {assignment.operationType ? (
                        <p className={styles.vehicleCrewType}>
                          {operationTypeLabel(assignment.operationType)}
                        </p>
                      ) : null}
                      <div>
                        <span>Баг</span>
                        <strong>{assignment.teamName}</strong>
                      </div>
                      <div>
                        <span>Жолооч</span>
                        <strong>{namesLabel(assignment.driverNames)}</strong>
                      </div>
                      <div>
                        <span>Ачигч</span>
                        <strong>{namesLabel(assignment.loaderNames)}</strong>
                      </div>
                      {assignment.memberNames.length ? (
                        <div>
                          <span>Бусад гишүүд</span>
                          <strong>{namesLabel(assignment.memberNames)}</strong>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.vehicleCrewEmpty}>
                  Энэ машин дээр жолооч, ачигч эсвэл идэвхтэй баг хуваарилагдаагүй байна.
                </p>
              )}
            </section>
          </section>
        ) : null}

        {activeTab === "driver" ? (
          <section className={styles.vehicleTabPanel}>
            <div className={styles.vehicleDetailGrid}>
              <DetailItem label="Одоогийн жолооч" value={vehicle.responsibleDriverName} />
              <DetailItem label="Ачигч 1" value={vehicle.loader1Name} />
              <DetailItem label="Ачигч 2" value={vehicle.loader2Name} />
              <DetailItem label="Хуваарилсан хүмүүс" value={`${crewCount} хүн · ${loaderCount} ачигч`} />
              <DetailItem label="Жолоочийн тоо" value={`${driverCount}`} />
              <DetailItem label="Төлөв" value={vehicle.stateLabel} />
            </div>
            <DriverAssignmentForm
              vehicle={vehicle}
              driverOptions={driverOptions}
              loaderOptions={loaderOptions}
            />
            <DriverHistoryList items={vehicle.driverHistory} />
          </section>
        ) : null}

        {activeTab === "insurance" ? (
          <section className={styles.vehicleTabPanel}>
            <DeadlinePanel title="Даатгалын мэдээлэл" info={vehicle.insurance} />
          </section>
        ) : null}

        {activeTab === "inspection" ? (
          <section className={styles.vehicleTabPanel}>
            <DeadlinePanel title="Улсын үзлэгийн мэдээлэл" info={vehicle.inspection} />
          </section>
        ) : null}

        {activeTab === "repair" ? (
          <section className={styles.vehicleTabPanel}>
            <RepairHistoryList items={vehicle.repairHistory} />
          </section>
        ) : null}

        {activeTab === "weight" ? (
          <section className={styles.vehicleTabPanel}>
            <WeightReportList items={vehicle.weightReports} />
          </section>
        ) : null}

        {activeTab === "fuel" ? (
          <section className={styles.vehicleTabPanel}>
            <FuelReportList items={vehicle.fuelReports} />
          </section>
        ) : null}

        {activeTab === "procurement" ? (
          <section className={styles.vehicleTabPanel}>
            <ProcurementList items={vehicle.procurementLinks} />
          </section>
        ) : null}

        {activeTab === "edit" ? (
        <section className={styles.vehicleTabPanel}>
          <form key={vehicle.id} action={updateFleetVehicleAction} className={styles.vehicleEditForm}>
          <input type="hidden" name="vehicle_id" value={vehicle.id} />

          <label className={styles.vehicleFormField}>
            <span>Улсын дугаар</span>
            <input name="license_plate" defaultValue={vehicle.plate} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Машины нэр</span>
            <input name="name" defaultValue={vehicle.name} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Марка / модель</span>
            <select name="model_id" defaultValue={vehicle.modelId ?? ""}>
              <option value="">Сонгоогүй</option>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.vehicleFormField}>
            <span>Төрөл</span>
            <select
              name={vehicleTypeOptions.length ? "municipal_vehicle_type_id" : "category_id"}
              defaultValue={
                vehicleTypeOptions.length
                  ? vehicle.vehicleTypeId ?? ""
                  : vehicle.categoryId ?? ""
              }
            >
              <option value="">Сонгоогүй</option>
              {(vehicleTypeOptions.length ? vehicleTypeOptions : categoryOptions).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.vehicleFormField}>
            <span>Төлөв</span>
            <select name="x_municipal_operational_status" defaultValue={vehicle.operationalStatusKey}>
              <option value="">Сонгоогүй</option>
              {vehicleStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.vehicleFormField}>
            <span>Арлын дугаар</span>
            <input name="vin_sn" defaultValue={vehicle.vin} placeholder="Арлын дугаар" />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Туулсан зам</span>
            <input
              name="odometer"
              type="number"
              min="0"
              step="1"
              defaultValue={vehicle.odometerValue}
              placeholder="0"
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Хэлтэс</span>
            <select name="municipal_department_id" defaultValue={vehicle.departmentId ?? ""}>
              <option value="">Сонгоогүй</option>
              {departmentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.vehicleFormField}>
            <span>Түлшний төрөл</span>
            <select name="fuel_type" defaultValue={vehicle.fuelTypeKey}>
              <option value="">Сонгоогүй</option>
              {fuelTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даатгалын компани</span>
            <input name="municipal_insurance_company" defaultValue={vehicle.insurance.company || ""} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даатгалын гэрээний дугаар</span>
            <input
              name="municipal_insurance_policy_number"
              defaultValue={vehicle.insurance.policyNumber || ""}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даатгал эхлэх огноо</span>
            <input
              name="municipal_insurance_date_start"
              type="date"
              defaultValue={vehicle.insurance.startDateValue || ""}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даатгал дуусах огноо</span>
            <input
              name="municipal_insurance_date_end"
              type="date"
              defaultValue={vehicle.insurance.endDateValue || ""}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Улсын үзлэгт орсон огноо</span>
            <input
              name="municipal_inspection_date"
              type="date"
              defaultValue={vehicle.inspection.startDateValue || ""}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Дараагийн үзлэгийн огноо</span>
            <input
              name="municipal_next_inspection_date"
              type="date"
              defaultValue={vehicle.inspection.endDateValue || ""}
            />
          </label>

          <label className={cx(styles.vehicleFormField, styles.vehicleFormFieldWide)}>
            <span>Даатгалын тайлбар</span>
            <textarea name="municipal_insurance_note" defaultValue={vehicle.insurance.note || ""} />
          </label>

          <label className={cx(styles.vehicleFormField, styles.vehicleFormFieldWide)}>
            <span>Улсын үзлэгийн тайлбар</span>
            <textarea name="municipal_inspection_note" defaultValue={vehicle.inspection.note || ""} />
          </label>

          <input type="hidden" name="mfo_active_for_ops_present" value="1" />
          <label className={styles.vehicleCheckbox}>
            <input
              name="mfo_active_for_ops"
              type="checkbox"
              defaultChecked={vehicle.isOperational}
            />
            <span>Үйл ажиллагаанд идэвхтэй ашиглаж байгаа</span>
          </label>

          <div className={styles.vehicleModalActions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Болих
            </button>
            <button type="submit" className={styles.primaryButton}>
              Хадгалах
            </button>
          </div>
          </form>
        </section>
        ) : null}
      </section>
    </div>
  );
}

export function AutoBaseBoard({
  board,
  notice,
  error,
}: {
  board: FleetVehicleBoard;
  initialVehicleId?: number | null;
  notice?: string;
  error?: string;
}) {
  const vehiclesById = useMemo(
    () => new Map(board.allVehicles.map((vehicle) => [vehicle.id, vehicle])),
    [board.allVehicles],
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<VehicleFilterKey>("active");
  const selectedVehicle = selectedVehicleId ? vehiclesById.get(selectedVehicleId) ?? null : null;
  const buckets: BucketConfig[] = [
    {
      key: "active",
      title: "Ажиллаж байгаа машин",
      count: board.activeCount,
      description: "Ажилд гарах боломжтой болон хуваарилагдсан машинууд.",
      hint: "Ажиллаж байгаа жагсаалт",
      emptyLabel: "Одоогоор ажиллаж байгаа машин алга.",
      vehicles: board.activeVehicles,
      tone: "active",
    },
    {
      key: "repair",
      title: "Засагдаж буй машин",
      count: board.repairCount,
      description: "Засвар, саатал, техникийн хүлээлттэй машинууд.",
      hint: "Засвартай жагсаалт",
      emptyLabel: "Одоогоор засагдаж буй машин алга.",
      vehicles: board.repairVehicles,
      tone: "repair",
    },
  ];
  const selectedBucket = buckets.find((bucket) => bucket.key === activeFilter) ?? buckets[0];

  return (
    <>
      {notice || error ? (
        <div
          className={cx(styles.vehicleNotice, error && styles.vehicleNoticeError)}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      ) : null}

      <div className={styles.metricGrid}>
        <div className={styles.metricTile}>
          <span>Нийт машин техник</span>
          <strong>{board.totalVehicles}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Ажиллаж байгаа</span>
          <strong>{board.activeCount}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Засвартай</span>
          <strong>{board.repairCount}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Даатгал сануулах</span>
          <strong>{board.insuranceDueCount}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Үзлэг сануулах</span>
          <strong>{board.inspectionDueCount}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Өнөөдрийн жин</span>
          <strong>{board.todayWeightLabel}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Өнөөдрийн шатахуун</span>
          <strong>{board.todayFuelLabel}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Алдаатай таталт</span>
          <strong>{board.failedImportCount}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Их шатахуун</span>
          <strong>{board.highestFuelVehicle || "Байхгүй"}</strong>
        </div>
        <div className={styles.metricTile}>
          <span>Их засварт орсон</span>
          <strong>{board.mostRepairedVehicle || "Байхгүй"}</strong>
        </div>
      </div>

      <section className={styles.vehicleFilterBoard} data-testid="vehicle-filter-board">
        <div className={styles.vehicleFilterTabs} role="tablist" aria-label="Машины төлөвөөр шүүх">
          {buckets.map((bucket) => (
            <button
              key={bucket.key}
              type="button"
              role="tab"
              aria-selected={selectedBucket.key === bucket.key}
              className={cx(
                styles.vehicleFilterTab,
                bucket.tone === "repair" ? styles.vehicleFilterTabRepair : styles.vehicleFilterTabActive,
                selectedBucket.key === bucket.key && styles.vehicleFilterTabSelected,
              )}
              style={meterStyle(bucket.count, Math.max(board.totalVehicles, 1))}
              onClick={() => setActiveFilter(bucket.key)}
            >
              <span className={styles.vehicleFilterTabText}>
                <strong>{bucket.title}</strong>
                <small>{bucket.hint}</small>
              </span>
              <span className={styles.vehicleFilterCount}>{bucket.count}</span>
              <span className={styles.vehicleFilterMeter} aria-hidden>
                <span />
              </span>
            </button>
          ))}
        </div>

        <section
          className={cx(
            styles.vehicleFilterPanel,
            selectedBucket.tone === "repair" ? styles.vehicleFilterPanelRepair : styles.vehicleFilterPanelActive,
          )}
          role="tabpanel"
        >
          <div className={styles.vehicleFilterPanelHeader}>
            <div>
              <span className={styles.mobileDetailEyebrow}>Сонгосон төлөв</span>
              <h2>{selectedBucket.title}</h2>
              <p>{selectedBucket.description}</p>
            </div>
            <span className={styles.countBadge}>{selectedBucket.count}</span>
          </div>

          <VehicleList
            vehicles={selectedBucket.vehicles}
            emptyLabel={selectedBucket.emptyLabel}
            onSelectVehicle={(vehicle) => {
              setSelectedVehicleId(vehicle.id);
            }}
          />
        </section>
      </section>

      {selectedVehicle ? (
        <VehicleDetailModal
          vehicle={selectedVehicle}
          driverOptions={board.driverOptions}
          loaderOptions={board.loaderOptions}
          departmentOptions={board.departmentOptions}
          modelOptions={board.modelOptions}
          vehicleTypeOptions={board.vehicleTypeOptions}
          categoryOptions={board.categoryOptions}
          onClose={() => {
            setSelectedVehicleId(null);
          }}
        />
      ) : null}
    </>
  );
}
