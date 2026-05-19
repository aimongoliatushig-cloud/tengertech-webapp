"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  List,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Truck,
} from "lucide-react";

import { createProjectAction } from "@/app/actions";
import dashboardStyles from "@/app/dashboard-view.module.css";
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

type InspectorFilter = "all" | "active" | "review" | "planned" | "done";
type InspectorViewMode = "grid" | "list";

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
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<InspectorFilter>("all");
  const [viewMode, setViewMode] = useState<InspectorViewMode>("grid");

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
      const done = blockedStatusLabel ? todayTasks.length : todayTasks.filter(isDoneTask).length;
      const total = todayTasks.length;
      const progress = total
        ? blockedStatusLabel
          ? 100
          : Math.round(todayTasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, task.progress)), 0) / total)
        : 0;
      const hasReview = todayTasks.some((task) => task.statusKey === "review" || task.statusKey === "problem");
      const bucket: InspectorFilter = blockedStatusLabel
        ? "review"
        : total > 0 && done === total
          ? "done"
          : hasReview
            ? "review"
            : total > 0
              ? "active"
              : "planned";
      const statusLabel = blockedStatusLabel || (bucket === "done" ? "Дууссан" : bucket === "planned" ? "Төлөвлөгдсөн" : bucket === "review" ? "Хянагдаж байгаа" : "Ажилтай");

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
  const toggleSelectedPoint = (pointId: number) => {
    setSelectedPointIds((current) =>
      current.includes(pointId) ? current.filter((item) => item !== pointId) : [...current, pointId],
    );
  };
  const filterItems: Array<{ key: InspectorFilter; label: string; value: number }> = [
    { key: "all", label: "Бүгд", value: vehicleSummaries.length },
    { key: "active", label: "Ажилтай", value: vehicleSummaries.filter((summary) => summary.bucket === "active").length },
    { key: "review", label: "Хянагдаж байгаа", value: vehicleSummaries.filter((summary) => summary.bucket === "review").length },
    { key: "planned", label: "Төлөвлөгдсөн", value: vehicleSummaries.filter((summary) => summary.bucket === "planned").length },
    { key: "done", label: "Дууссан", value: vehicleSummaries.filter((summary) => summary.bucket === "done").length },
  ];

  return (
    <section id="my-vehicles" className={dashboardStyles.inspectorVehicleBoard}>
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
            placeholder="Хайх (дугаар, машин, хороо...)"
          />
        </label>
        <div className={dashboardStyles.inspectorViewToggle} aria-label="Харагдац">
          <button
            type="button"
            className={viewMode === "grid" ? dashboardStyles.inspectorViewToggleActive : undefined}
            onClick={() => setViewMode("grid")}
            aria-label="Картаар харах"
          >
            <Grid3X3 aria-hidden />
          </button>
          <button
            type="button"
            className={viewMode === "list" ? dashboardStyles.inspectorViewToggleActive : undefined}
            onClick={() => setViewMode("list")}
            aria-label="Жагсаалтаар харах"
          >
            <List aria-hidden />
          </button>
        </div>
      </div>

      {filteredSummaries.length ? (
        <div
          className={cn(
            dashboardStyles.inspectorVehicleScroller,
            viewMode === "list" && dashboardStyles.inspectorVehicleScrollerList,
          )}
        >
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
              >
                <span className={dashboardStyles.inspectorVehicleImage}>
                  <VehicleLogo src={summary.boardVehicle?.imageUrl} />
                  <span>{summary.statusLabel}</span>
                </span>
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

      <div className={dashboardStyles.inspectorControlBar}>
        <button type="button" onClick={() => setWorkDate((current) => shiftDate(current, -1))} aria-label="Өмнөх өдөр">
          <ChevronLeft aria-hidden />
        </button>
        <label>
          <CalendarDays aria-hidden />
          <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value || todayKey())} />
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
        <select value={effectivePointId} onChange={(event) => setPointId(event.target.value)} disabled={!subdistrictId}>
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
          <input type="hidden" name="operation_unit" value="garbage_transport" />
          <input type="hidden" name="department_id" value={departmentId ?? ""} />
          <input type="hidden" name="garbage_vehicle_id" value={activeSummary?.vehicle.id ?? ""} />
          <input type="hidden" name="name" value={generatedName} />
          <input type="hidden" name="garbage_loader_override" value="1" />
          {(activeSummary?.vehicle.loaderIds ?? []).map((loaderId) => (
            <input key={loaderId} type="hidden" name="garbage_loader_employee_ids" value={loaderId} />
          ))}

          <label>
            <span>Машин сонгох *</span>
            <select
              value={activeSummary?.vehicle.id ?? ""}
              onChange={(event) => setActiveVehicleId(Number(event.target.value))}
              required
            >
              {vehicleSummaries.map((summary) => (
                <option key={summary.vehicle.id} value={summary.vehicle.id} disabled={summary.isStopped}>
                  {summary.plate} - {summary.modelName}
                  {summary.isStopped ? ` (${summary.statusLabel})` : ""}
                </option>
              ))}
            </select>
          </label>

          {activeVehicleBlocked && activeSummary ? (
            <p className={dashboardStyles.inspectorCreateError}>
              {activeSummary.plate} машин {fixMojibakeText(activeSummary.statusLabel).toLowerCase()} тул шинэ даалгавар
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
                    onClick={() => setSelectedPointIds(filteredPoints.map((point) => point.id))}
                    disabled={activeVehicleBlocked}
                  >
                    Бүгдийг сонгох
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPointIds([])}
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
              type="date"
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
