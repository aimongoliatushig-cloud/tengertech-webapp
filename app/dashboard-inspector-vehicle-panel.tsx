"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Truck,
} from "lucide-react";

import { createProjectAction } from "@/app/actions";
import dashboardStyles from "@/app/dashboard-view.module.css";
import {
  isAutoGarbageDepartment,
  isGarbageTransportDepartment,
} from "@/lib/department-permissions";
import { cn } from "@/lib/utils";
import { fixMojibakeText } from "@/lib/text-normalize";
import { type DashboardSnapshot, type FleetVehicleBoard } from "@/lib/odoo";
import { type GarbagePointOption, type GarbageVehicleOption } from "@/lib/workspace";

type InspectorVehiclePanelProps = {
  vehicles: GarbageVehicleOption[];
  garbagePointOptions: GarbagePointOption[];
  departmentId?: number | null;
  tasks: DashboardSnapshot["taskDirectory"];
  fleetBoard: FleetVehicleBoard;
};

type InspectorFilter = "all" | "review" | "planned" | "done";

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, (month || 1) - 1, day || 1);
  parsed.setDate(parsed.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(
    parsed.getDate(),
  ).padStart(2, "0")}, ${weekdays[parsed.getDay()]}`;
}

function normalizeText(value: string) {
  return fixMojibakeText(value).toLowerCase();
}

function isDriverOption(jobTitle: string) {
  const title = normalizeText(jobTitle);
  return title.includes("жолооч") || title.includes("driver") || title.includes("chauffeur");
}

function isClearlyNotDriverOption(jobTitle: string) {
  const title = normalizeText(jobTitle);
  return (
    title.includes("ачигч") ||
    title.includes("хяналт") ||
    title.includes("байцаагч") ||
    title.includes("дарга") ||
    title.includes("менежер") ||
    title.includes("диспетчер") ||
    title.includes("засвар") ||
    title.includes("loader") ||
    title.includes("inspector") ||
    title.includes("manager") ||
    title.includes("dispatcher") ||
    title.includes("mechanic")
  );
}

function driverDepartmentLabel(value?: string | null) {
  const label = fixMojibakeText(value || "").trim();
  return label || "Хэлтэсгүй";
}

function isSelectableGarbageDriver(option: { departmentName?: string; jobTitle?: string }, activeDepartment: string) {
  const departmentName = driverDepartmentLabel(option.departmentName);
  const sameActiveDepartment = activeDepartment !== "Хэлтэсгүй" && departmentName === activeDepartment;
  if (
    !isAutoGarbageDepartment(departmentName) &&
    !isGarbageTransportDepartment(departmentName) &&
    !sameActiveDepartment
  ) {
    return false;
  }
  return isDriverOption(option.jobTitle || "");
}

function isDoneTask(task: DashboardSnapshot["taskDirectory"][number]) {
  return task.statusKey === "verified";
}

function taskStatusLabel(task: DashboardSnapshot["taskDirectory"][number]) {
  if (isDoneTask(task)) return "Дууссан";
  if (task.statusKey === "review") return "Хянагдаж байгаа";
  if (task.statusKey === "working" || task.progress > 0) return "Ажиллаж байна";
  if (task.statusKey === "problem") return "Анхаарах";
  return "Төлөвлөгдсөн";
}

function blockedVehicleStatusLabel(
  boardVehicle: FleetVehicleBoard["allVehicles"][number] | undefined,
  vehicle?: GarbageVehicleOption,
) {
  const optionStatusLabel = normalizeText(vehicle?.statusLabel ?? "");
  const optionIsRepair =
    Boolean(vehicle?.isRepair) ||
    optionStatusLabel.includes("засвар") ||
    optionStatusLabel.includes("эвдэр") ||
    optionStatusLabel.includes("repair") ||
    optionStatusLabel.includes("broken");
  const optionIsInactive = Boolean(vehicle?.isArchived) || vehicle?.isOperational === false;

  if (optionIsRepair && !boardVehicle) {
    return "Засвартай";
  }
  if (boardVehicle?.isRepair || optionIsRepair) {
    return boardVehicle?.operationalStatusKey === "broken" ? "Эвдэрсэн" : "Засвартай";
  }
  if (boardVehicle?.isArchived || boardVehicle?.isOperational === false || optionIsInactive) {
    return "Зогсолттой";
  }
  return "";
}

function VehicleLogo({ src }: { src?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);

  useEffect(() => {
    if (!src) return;

    let active = true;
    const probe = new window.Image();
    probe.onload = () => {
      if (active && probe.naturalWidth <= 0) setFailedSrc(src);
    };
    probe.onerror = () => {
      if (active) setFailedSrc(src);
    };
    probe.src = src;

    return () => {
      active = false;
    };
  }, [src]);

  if (!src || failed) {
    return <Truck aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setFailedSrc(src)} />
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={dashboardStyles.inspectorCreateSubmit}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      <Plus aria-hidden />
      {pending ? "Үүсгэж байна..." : "Даалгавар үүсгэх"}
    </button>
  );
}

export function DashboardInspectorVehiclePanel({
  vehicles,
  garbagePointOptions,
  departmentId,
  tasks,
  fleetBoard,
}: InspectorVehiclePanelProps) {
  const [activeVehicleId, setActiveVehicleId] = useState<number | null>(null);
  const [workDate, setWorkDate] = useState(todayKey);
  const [subdistrictId, setSubdistrictId] = useState("");
  const [pointId, setPointId] = useState("");
  const [selectedPointIds, setSelectedPointIds] = useState<number[]>([]);
  const [driverOverridesByVehicle, setDriverOverridesByVehicle] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<InspectorFilter>("all");

  const subdistrictOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const point of garbagePointOptions) {
      const key = point.subdistrictId ? String(point.subdistrictId) : "none";
      if (!options.has(key)) {
        options.set(key, point.subdistrictName || "Хороо сонгоогүй");
      }
    }
    return Array.from(options, ([id, label]) => ({ id, label }));
  }, [garbagePointOptions]);

  const filteredPoints = useMemo(() => {
    if (!subdistrictId) return [];
    return garbagePointOptions.filter((point) =>
      subdistrictId === "none" ? !point.subdistrictId : String(point.subdistrictId) === subdistrictId,
    );
  }, [garbagePointOptions, subdistrictId]);

  const effectivePointId = filteredPoints.some((point) => String(point.id) === pointId) ? pointId : "";

  const availablePointIds = useMemo(() => new Set(filteredPoints.map((point) => point.id)), [filteredPoints]);
  const validSelectedPointIds = useMemo(() => {
    return selectedPointIds.filter((pointId) => availablePointIds.has(pointId));
  }, [availablePointIds, selectedPointIds]);

  const vehicleSummaries = useMemo(() => {
    const subdistrictLabel = subdistrictOptions.find((option) => option.id === subdistrictId)?.label;
    const pointLabel = garbagePointOptions.find((point) => String(point.id) === effectivePointId)?.name;
    return vehicles.map((vehicle) => {
      const boardVehicle = fleetBoard.allVehicles.find((item) => item.id === vehicle.id);
      const plate = vehicle.plate || vehicle.label || `Машин #${vehicle.id}`;
      const modelName = boardVehicle?.modelName || boardVehicle?.name || vehicle.label || "Бүртгэлтэй машин";
      const searchablePlate = normalizeText(plate);
      const todayTasks = tasks.filter((task) => {
        const text = normalizeText(`${task.name} ${task.projectName} ${task.departmentName} ${task.operationTypeLabel}`);
        const matchesVehicle = task.scheduledDate === workDate && text.includes(searchablePlate);
        const matchesSubdistrict = !subdistrictLabel || text.includes(normalizeText(subdistrictLabel));
        const matchesPoint = !pointLabel || text.includes(normalizeText(pointLabel));
        return matchesVehicle && matchesSubdistrict && matchesPoint;
      });
      const blockedStatusLabel = blockedVehicleStatusLabel(boardVehicle, vehicle);
      const done = todayTasks.filter(isDoneTask).length;
      const total = todayTasks.length;
      const progress = total
        ? Math.round(todayTasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, task.progress)), 0) / total)
        : 0;
      const hasReview = todayTasks.some((task) => task.statusKey === "review" || task.statusKey === "problem");
      const bucket: InspectorFilter = total > 0 && done === total
          ? "done"
          : hasReview
            ? "review"
            : "planned";
      const statusLabel = bucket === "done" ? "Дууссан" : bucket === "review" ? "Хянагдаж байгаа" : "Төлөвлөгдсөн";

      return {
        vehicle,
        boardVehicle,
        plate,
        modelName,
        tasks: todayTasks,
        total,
        done,
        pending: Math.max(total - done, 0),
        progress,
        bucket,
        statusLabel,
        stopStatusLabel: blockedStatusLabel,
        isStopped: Boolean(blockedStatusLabel),
      };
    });
  }, [effectivePointId, fleetBoard.allVehicles, garbagePointOptions, subdistrictId, subdistrictOptions, tasks, vehicles, workDate]);

  const filteredSummaries = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return vehicleSummaries.filter((summary) => {
      const matchesFilter = activeFilter === "all" || summary.bucket === activeFilter;
      const matchesQuery =
        !normalizedQuery ||
        normalizeText(`${summary.plate} ${summary.modelName} ${summary.vehicle.driverName ?? ""}`).includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, query, vehicleSummaries]);

  const activeSummary =
    filteredSummaries.find((summary) => summary.vehicle.id === activeVehicleId) ?? filteredSummaries[0] ?? null;
  const activeVehicleBlocked = Boolean(activeSummary?.isStopped);
  const activeDefaultDriverId = activeSummary?.vehicle.driverId ? String(activeSummary.vehicle.driverId) : "";
  const driverOptions = useMemo(() => {
    const activeDepartment = driverDepartmentLabel(
      activeSummary?.vehicle.departmentName || activeSummary?.boardVehicle?.departmentName,
    );
    const options = new Map<number, { id: number; name: string; departmentName: string; jobTitle: string }>();
    for (const option of fleetBoard.driverOptions) {
      if (!option.active) continue;
      const departmentName = driverDepartmentLabel(option.departmentName);
      if (!isSelectableGarbageDriver(option, activeDepartment)) continue;
      options.set(option.id, {
        id: option.id,
        name: fixMojibakeText(option.name),
        departmentName,
        jobTitle: fixMojibakeText(option.jobTitle || "Жолооч"),
      });
    }
    if (activeSummary?.vehicle.driverId && !options.has(activeSummary.vehicle.driverId)) {
      options.set(activeSummary.vehicle.driverId, {
        id: activeSummary.vehicle.driverId,
        name: fixMojibakeText(activeSummary.vehicle.driverName || `Жолооч #${activeSummary.vehicle.driverId}`),
        departmentName: activeDepartment,
        jobTitle: "Машинд бүртгэлтэй жолооч",
      });
    }
    return Array.from(options.values()).sort((left, right) => left.name.localeCompare(right.name, "mn"));
  }, [activeSummary, fleetBoard.driverOptions]);
  const driverOptionGroups = useMemo(() => {
    const groups = new Map<string, typeof driverOptions>();
    for (const driver of driverOptions) {
      const key = driver.departmentName || "Хэлтэсгүй";
      groups.set(key, [...(groups.get(key) ?? []), driver]);
    }
    return Array.from(groups, ([departmentName, options]) => ({ departmentName, options })).sort((left, right) =>
      left.departmentName.localeCompare(right.departmentName, "mn"),
    );
  }, [driverOptions]);
  const selectedDriverId = activeSummary
    ? (driverOverridesByVehicle[activeSummary.vehicle.id] ?? activeDefaultDriverId)
    : "";
  const selectedSubdistrictLabel = subdistrictOptions.find((option) => option.id === subdistrictId)?.label ?? "";
  const selectedPoint = filteredPoints.find((point) => String(point.id) === effectivePointId) ?? null;
  const selectedPoints = filteredPoints.filter((point) => validSelectedPointIds.includes(point.id));
  const generatedName = activeSummary
    ? `${activeSummary.plate} / ${workDate}${
        selectedPoints.length > 1
          ? ` - ${selectedPoints.length} цэг`
          : selectedPoints[0]
            ? ` - ${selectedPoints[0].name}`
            : selectedPoint
              ? ` - ${selectedPoint.name}`
              : selectedSubdistrictLabel
                ? ` - ${selectedSubdistrictLabel}`
                : ""
      }`
    : "";
  const syncSinglePointSelection = (nextPointId: string) => {
    setPointId(nextPointId);
    const parsedPointId = Number(nextPointId);
    setSelectedPointIds(Number.isFinite(parsedPointId) && parsedPointId > 0 ? [parsedPointId] : []);
  };
  const toggleSelectedPoint = (pointId: number) => {
    const next = selectedPointIds.includes(pointId)
      ? selectedPointIds.filter((item) => item !== pointId)
      : [...selectedPointIds, pointId];
    setSelectedPointIds(next);
    setPointId(next.length === 1 ? String(next[0]) : "");
  };
  const filterItems: Array<{ key: InspectorFilter; label: string; value: number }> = [
    { key: "all", label: "Бүгд", value: vehicleSummaries.length },
    { key: "planned", label: "Төлөвлөгдсөн", value: vehicleSummaries.filter((summary) => summary.bucket === "planned").length },
    { key: "review", label: "Хянагдаж буй", value: vehicleSummaries.filter((summary) => summary.bucket === "review").length },
    { key: "done", label: "Дууссан", value: vehicleSummaries.filter((summary) => summary.bucket === "done").length },
  ];

  return (
    <section id="my-vehicles" className={dashboardStyles.inspectorVehicleBoard}>
      <header className={dashboardStyles.inspectorMobileFlowHeader}>
        <span>
          <Truck aria-hidden />
        </span>
        <div>
          <strong>Машин сонгох</strong>
          <small>Сонгоод доор нь хороо, хогийн цэгээ тэмдэглээд даалгавар үүсгэнэ.</small>
        </div>
      </header>

      <div className={dashboardStyles.inspectorVehicleToolbar}>
        <div className={dashboardStyles.inspectorFilterPills}>
          {filterItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(item.key === activeFilter && dashboardStyles.inspectorFilterPillActive)}
              onClick={() => setActiveFilter(item.key)}
            >
              {item.label}
              <span>{item.value}</span>
            </button>
          ))}
        </div>
        <label className={dashboardStyles.inspectorSearchField}>
          <Search aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Дугаар, машин, жолоочоор хайх"
          />
        </label>
      </div>

      {filteredSummaries.length ? (
        <div className={dashboardStyles.inspectorVehicleScroller}>
          {filteredSummaries.map((summary) => {
            const isActive = activeSummary?.vehicle.id === summary.vehicle.id;
            return (
              <button
                key={summary.vehicle.id}
                type="button"
                className={cn(
                  dashboardStyles.inspectorVehicleCard,
                  isActive && dashboardStyles.inspectorVehicleCardActive,
                  summary.isStopped && dashboardStyles.inspectorVehicleCardBlocked,
                )}
                onClick={() => setActiveVehicleId(summary.vehicle.id)}
                aria-pressed={isActive}
                aria-label={`${summary.plate} ${isActive ? "\u0441\u043e\u043d\u0433\u043e\u0433\u0434\u0441\u043e\u043d" : "\u043c\u0430\u0448\u0438\u043d \u0441\u043e\u043d\u0433\u043e\u0445"}`}
              >
                <span className={dashboardStyles.inspectorVehicleImage}>
                  <VehicleLogo src={summary.boardVehicle?.imageUrl} />
                </span>
                {isActive ? (
                  <span className={dashboardStyles.inspectorVehicleSelectedBadge}>
                    <CheckCircle2 aria-hidden />
                    Сонгосон
                  </span>
                ) : null}
                <span className={dashboardStyles.inspectorVehicleCardBody}>
                  <strong>{summary.plate}</strong>
                  <small>{summary.modelName}</small>
                  <span className={dashboardStyles.inspectorVehicleCardStats}>
                    <span>
                      <small>Ажил</small>
                      <b>{summary.total}</b>
                    </span>
                    <span>
                      <small>Дууссан</small>
                      <b>{summary.done}</b>
                    </span>
                  </span>
                  <span className={dashboardStyles.inspectorVehicleProgress}>
                    <i style={{ inlineSize: `${summary.progress}%` }} />
                    <em>{summary.progress}%</em>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={dashboardStyles.inspectorEmptyState}>
          <Truck aria-hidden />
          <strong>Танд оноогдсон машин олдсонгүй.</strong>
          <span>Хайлт эсвэл төлөвийн шүүлтүүрээ өөрчлөөд шалгана уу.</span>
        </div>
      )}

      <div className={dashboardStyles.inspectorMobileStepLabel}>Даалгаврын өдөр</div>
      <div className={dashboardStyles.inspectorControlBar}>
        <button type="button" onClick={() => setWorkDate((current) => shiftDate(current, -1))} aria-label="Өмнөх өдөр">
          <ChevronLeft aria-hidden />
        </button>
        <label>
          <CalendarDays aria-hidden />
          <input type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} value={workDate} onChange={(event) => setWorkDate(event.target.value || todayKey())} />
          <span>{formatDateLabel(workDate)}</span>
        </label>
        <button type="button" onClick={() => setWorkDate((current) => shiftDate(current, 1))} aria-label="Дараах өдөр">
          <ChevronRight aria-hidden />
        </button>
        <select
          value={subdistrictId}
          onChange={(event) => {
            setSubdistrictId(event.target.value);
            setPointId("");
            setSelectedPointIds([]);
          }}
        >
          <option value="">Хороо: Бүгд</option>
          {subdistrictOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select value={effectivePointId} onChange={(event) => syncSinglePointSelection(event.target.value)} disabled={!subdistrictId}>
          <option value="">Хогийн цэг: Бүгд</option>
          {filteredPoints.map((point) => (
            <option key={point.id} value={point.id}>
              {point.name}
            </option>
          ))}
        </select>
        <button type="button" className={dashboardStyles.inspectorTodayButton} onClick={() => setWorkDate(todayKey())}>
          <CalendarDays aria-hidden />
          Өнөөдөр
        </button>
      </div>

      <div className={dashboardStyles.inspectorWorkspaceGrid}>
        <section className={dashboardStyles.inspectorSelectedPanel}>
          {activeSummary ? (
            <>
              <header>
                <h2>
                  Сонгосон машин: {activeSummary.plate} <span>({activeSummary.modelName})</span>
                </h2>
                <p>Өнөөдрийн даалгавар ({activeSummary.total})</p>
              </header>
              <div className={dashboardStyles.inspectorTaskTimeline}>
                {activeSummary.tasks.map((task) => {
                  const done = isDoneTask(task);
                  return (
                    <a key={task.id} href={task.href} className={dashboardStyles.inspectorTimelineTask}>
                      <span className={cn(dashboardStyles.inspectorTimelineDot, done && dashboardStyles.inspectorTimelineDotDone)} />
                      <span className={dashboardStyles.inspectorTimelineBody}>
                        <strong>{fixMojibakeText(task.name)}</strong>
                        <small>
                          <MapPin aria-hidden />
                          {fixMojibakeText(task.projectName || task.operationTypeLabel || "Хог тээвэрлэх")}
                        </small>
                      </span>
                      <span
                        className={cn(
                          dashboardStyles.inspectorTimelineBadge,
                          task.statusKey === "review" && dashboardStyles.inspectorTimelineBadgeReview,
                          done && dashboardStyles.inspectorTimelineBadgeDone,
                        )}
                      >
                        {taskStatusLabel(task)}
                      </span>
                      <span className={dashboardStyles.inspectorTimelineDate}>Огноо: {workDate.replaceAll("-", ".")}</span>
                      <MoreHorizontal aria-hidden />
                    </a>
                  );
                })}
                {!activeSummary.tasks.length ? (
                  <div className={dashboardStyles.inspectorTimelineEmpty}>
                    <CalendarDays aria-hidden />
                    <span>Төлөвлөгдсөн даалгавар байхгүй байна.</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className={dashboardStyles.inspectorEmptyState}>
              <Truck aria-hidden />
              <strong>Машин сонгоно уу.</strong>
            </div>
          )}
        </section>

        <form action={createProjectAction} className={dashboardStyles.inspectorCreatePanel}>
          <h2>Шинэ даалгавар нэмэх</h2>
          <p className={dashboardStyles.inspectorCreateLead}>
            Сонгосон машинд тухайн өдрийн хогийн цэгийн ажлыг үүсгэнэ.
          </p>
          <input type="hidden" name="operation_unit" value="garbage_transport" />
          <input type="hidden" name="department_id" value={departmentId ?? ""} />
          <input type="hidden" name="garbage_vehicle_id" value={activeSummary?.vehicle.id ?? ""} />
          <input type="hidden" name="name" value={generatedName} />
          <input type="hidden" name="garbage_loader_override" value="1" />
          {(activeSummary?.vehicle.loaderIds ?? []).map((loaderId) => (
            <input key={loaderId} type="hidden" name="garbage_loader_employee_ids" value={loaderId} />
          ))}

          <div className={dashboardStyles.inspectorSelectedVehicleField}>
            <span>
              <Truck aria-hidden />
            </span>
            <div>
              <small>Сонгосон машин</small>
              <strong>
                {activeSummary ? `${activeSummary.plate} - ${activeSummary.modelName}` : "Машин сонгоогүй"}
              </strong>
              {activeSummary?.stopStatusLabel ? <em>{activeSummary.stopStatusLabel}</em> : null}
            </div>
          </div>

          <label>
            <span>Жолооч сонгох</span>
            <select
              name="garbage_driver_employee_id"
              value={selectedDriverId}
              onChange={(event) => {
                const vehicleId = activeSummary?.vehicle.id;
                if (!vehicleId) return;
                const nextDriverId = event.target.value;
                setDriverOverridesByVehicle((current) => {
                  if (nextDriverId === activeDefaultDriverId) {
                    const next = { ...current };
                    delete next[vehicleId];
                    return next;
                  }
                  return { ...current, [vehicleId]: nextDriverId };
                });
              }}
              disabled={activeVehicleBlocked || !driverOptions.length}
            >
              <option value="">Жолооч оноогоогүй</option>
              {driverOptionGroups.map((group) => (
                <optgroup key={group.departmentName} label={group.departmentName}>
                  {group.options.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                      {driver.jobTitle ? ` - ${driver.jobTitle}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <small className={dashboardStyles.inspectorDriverHint}>
              Үндсэн: {activeSummary?.vehicle.driverName || "жолооч оноогоогүй"}
            </small>
          </label>

          {activeVehicleBlocked && activeSummary ? (
            <p className={dashboardStyles.inspectorCreateError}>
              {activeSummary.plate} машин {fixMojibakeText(activeSummary.stopStatusLabel).toLowerCase()} тул шинэ даалгавар
              нэмэх боломжгүй. Засвар дуусаж ажиллах төлөвтэй болсны дараа идэвхжинэ.
            </p>
          ) : null}

          <label>
            <span>Хороо сонгох *</span>
            <select
              name="garbage_subdistrict_id"
              value={subdistrictId}
              onChange={(event) => {
                setSubdistrictId(event.target.value);
                setPointId("");
                setSelectedPointIds([]);
              }}
              required
              disabled={activeVehicleBlocked}
            >
              <option value="">Хороо сонгох</option>
              {subdistrictOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <section className={dashboardStyles.inspectorCreatePointSection}>
            <div className={dashboardStyles.inspectorCreatePointHeader}>
              <span>Хогийн цэг сонгох *</span>
              <strong>{validSelectedPointIds.length} сонгосон</strong>
            </div>
            {validSelectedPointIds.map((selectedPointId) => (
              <input key={selectedPointId} type="hidden" name="garbage_point_ids" value={selectedPointId} />
            ))}
            {filteredPoints.length ? (
              <>
                <div className={dashboardStyles.inspectorCreatePointTools}>
                  <button
                    type="button"
                    onClick={() => {
                      setPointId("");
                      setSelectedPointIds(filteredPoints.map((point) => point.id));
                    }}
                    disabled={activeVehicleBlocked}
                  >
                    Бүгдийг сонгох
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPointId("");
                      setSelectedPointIds([]);
                    }}
                    disabled={activeVehicleBlocked || !validSelectedPointIds.length}
                  >
                    Цэвэрлэх
                  </button>
                </div>
                <div className={dashboardStyles.inspectorCreatePointGrid}>
                  {filteredPoints.map((point) => {
                    const checked = validSelectedPointIds.includes(point.id);
                    return (
                      <label
                        key={point.id}
                        className={cn(
                          dashboardStyles.inspectorCreatePoint,
                          checked && dashboardStyles.inspectorCreatePointSelected,
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={activeVehicleBlocked}
                          onChange={() => toggleSelectedPoint(point.id)}
                        />
                        <span>{point.name}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className={dashboardStyles.inspectorCreateEmptyNote}>
                Эхлээд хороо сонгоно уу. Дараа нь тухайн хорооны нэг эсвэл олон хогийн цэгийг сонгоод даалгавар үүсгэнэ.
              </p>
            )}
          </section>

          <label>
            <span>Огноо *</span>
            <input
              type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10}
              name="start_date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value || todayKey())}
              required
              disabled={activeVehicleBlocked}
            />
          </label>

          <label>
            <span>Тайлбар</span>
            <textarea
              name="project_description"
              placeholder="Тайлбар (заавал биш)..."
              rows={3}
              disabled={activeVehicleBlocked}
            />
          </label>

          {!departmentId ? (
            <p className={dashboardStyles.inspectorCreateError}>Хог тээвэрлэлтийн хэлтэс олдсонгүй. Тохиргоогоо шалгана уу.</p>
          ) : null}

          <div className={dashboardStyles.inspectorCreateActions}>
            <button
              type="reset"
              onClick={() => {
                setPointId("");
                setSelectedPointIds([]);
              }}
            >
              Цуцлах
            </button>
            <SubmitButton disabled={!departmentId || !activeSummary || activeVehicleBlocked || !subdistrictId || !validSelectedPointIds.length} />
          </div>
        </form>
      </div>
    </section>
  );
}
