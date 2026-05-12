"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  Plus,
  Truck,
  X,
} from "lucide-react";

import { createProjectAction } from "@/app/actions";
import dashboardStyles from "@/app/dashboard-view.module.css";
import { Badge } from "@/app/_components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";
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

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const monthNames = [
    "нэгдүгээр сарын",
    "хоёрдугаар сарын",
    "гуравдугаар сарын",
    "дөрөвдүгээр сарын",
    "тавдугаар сарын",
    "зургаадугаар сарын",
    "долоодугаар сарын",
    "наймдугаар сарын",
    "есдүгээр сарын",
    "аравдугаар сарын",
    "арван нэгдүгээр сарын",
    "арван хоёрдугаар сарын",
  ];

  return `${parsed.getFullYear()} оны ${monthNames[parsed.getMonth()]} ${parsed.getDate()}`;
}

function normalizeText(value: string) {
  return fixMojibakeText(value).toLowerCase();
}

function isDoneTask(task: DashboardSnapshot["taskDirectory"][number]) {
  return task.statusKey === "verified" || task.progress >= 100;
}

function taskStatusLabel(task: DashboardSnapshot["taskDirectory"][number]) {
  if (isDoneTask(task)) {
    return "Дууссан";
  }
  if (task.statusKey === "working" || task.progress > 0) {
    return "Ажиллаж байна";
  }
  if (task.statusKey === "review") {
    return "Хянагдаж байна";
  }
  if (task.statusKey === "problem") {
    return "Анхаарах";
  }
  return "Хүлээгдэж буй";
}

function VehicleLogo({ src }: { src?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);

  useEffect(() => {
    if (!src) {
      return;
    }

    let active = true;
    const probe = new window.Image();
    probe.onload = () => {
      if (active && probe.naturalWidth <= 0) {
        setFailedSrc(src);
      }
    };
    probe.onerror = () => {
      if (active) {
        setFailedSrc(src);
      }
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
    <img
      src={src}
      alt=""
      onError={(event) => {
        event.currentTarget.style.display = "none";
        setFailedSrc(src);
      }}
    />
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={dashboardStyles.inspectorModalPrimary}
      disabled={pending || disabled}
      aria-busy={pending}
    >
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
  const [modalVehicleId, setModalVehicleId] = useState<number | null>(null);
  const [workDate, setWorkDate] = useState(todayKey);
  const [subdistrictId, setSubdistrictId] = useState("");
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);

  useEffect(() => {
    if (!modalVehicleId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalVehicleId]);

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
    if (!subdistrictId) {
      return [];
    }
    return garbagePointOptions.filter((point) =>
      subdistrictId === "none"
        ? !point.subdistrictId
        : String(point.subdistrictId) === subdistrictId,
    );
  }, [garbagePointOptions, subdistrictId]);

  const vehicleSummaries = useMemo(() => {
    return vehicles.map((vehicle) => {
      const boardVehicle = fleetBoard.allVehicles.find((item) => item.id === vehicle.id);
      const plate = vehicle.plate || vehicle.label || `Машин #${vehicle.id}`;
      const searchablePlate = normalizeText(plate);
      const todayTasks = tasks.filter((task) => {
        const text = normalizeText(`${task.name} ${task.projectName} ${task.departmentName} ${task.operationTypeLabel}`);
        return task.scheduledDate === workDate && text.includes(searchablePlate);
      });
      const done = todayTasks.filter(isDoneTask).length;
      const total = todayTasks.length;
      const progress = total
        ? Math.round(todayTasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, task.progress)), 0) / total)
        : 0;
      const isStopped =
        boardVehicle?.isRepair || boardVehicle?.isArchived || boardVehicle?.isOperational === false;
      const statusTone = total ? "green" : isStopped ? "red" : "amber";
      const statusLabel = total ? "Ажиллаж байна" : isStopped ? "Зогсолттой" : "Ачаалалтай";
      const todayWeight =
        boardVehicle?.weightReports.find((report) => report.reportDate === workDate)?.weightLabel ??
        "0 кг";

      return {
        vehicle,
        boardVehicle,
        plate,
        tasks: todayTasks,
        total,
        done,
        pending: Math.max(total - done, 0),
        progress,
        weightLabel: todayWeight,
        statusTone,
        statusLabel,
      };
    });
  }, [fleetBoard.allVehicles, tasks, vehicles, workDate]);

  const activeSummary =
    vehicleSummaries.find((summary) => summary.vehicle.id === activeVehicleId) ?? vehicleSummaries[0] ?? null;
  const modalSummary = vehicleSummaries.find((summary) => summary.vehicle.id === modalVehicleId) ?? null;
  const modalVehicle = modalSummary?.vehicle ?? null;
  const selectedSubdistrictLabel =
    subdistrictOptions.find((option) => option.id === subdistrictId)?.label ?? "";
  const modalVehicleLabel = modalSummary?.plate ?? "";
  const generatedName = modalSummary
    ? `${modalVehicleLabel} / ${workDate}${selectedSubdistrictLabel ? ` - ${selectedSubdistrictLabel}` : ""}`
    : "";

  function openTaskModal(vehicleId: number) {
    setModalVehicleId(vehicleId);
    setSubdistrictId("");
    setSelectedPointIds([]);
  }

  function closeModal() {
    setModalVehicleId(null);
    setSubdistrictId("");
    setSelectedPointIds([]);
  }

  function togglePoint(pointId: number) {
    const value = String(pointId);
    setSelectedPointIds((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function selectAllFilteredPoints() {
    setSelectedPointIds(filteredPoints.map((point) => String(point.id)));
  }

  function clearSelectedPoints() {
    setSelectedPointIds([]);
  }

  function renderVehicleDetail(className?: string) {
    if (!activeSummary) {
      return null;
    }

    return (
      <section className={cn(dashboardStyles.inspectorVehicleDetail, className)}>
        <div className={dashboardStyles.inspectorVehicleDetailHeader}>
          <div>
            <span>Сонгосон өдрийн ажил</span>
            <h3>{activeSummary.plate} / {workDate}</h3>
          </div>
          <button type="button" onClick={() => openTaskModal(activeSummary.vehicle.id)}>
            <Plus aria-hidden />
            Даалгавар нэмэх
          </button>
        </div>

        <div className={dashboardStyles.inspectorVehicleSummaryRow}>
          <span><strong>{activeSummary.total}</strong> даалгавар</span>
          <span><strong>{activeSummary.done}</strong> дууссан</span>
          <span><strong>{activeSummary.pending}</strong> гүйцэтгээгүй</span>
          <span><strong>{activeSummary.weightLabel}</strong> ачаа</span>
        </div>

        <div className={dashboardStyles.inspectorTaskRows}>
          {activeSummary.tasks.slice(0, 8).map((task) => {
            const done = isDoneTask(task);
            return (
              <a key={task.id} href={task.href} className={dashboardStyles.inspectorTaskRow}>
                <span className={cn(
                  dashboardStyles.inspectorTaskStatusIcon,
                  done && dashboardStyles.inspectorTaskStatusIconDone,
                )}>
                  {done ? <CheckCircle2 /> : <Clock3 />}
                </span>
                <span>
                  <strong>{fixMojibakeText(task.name)}</strong>
                  <small>{taskStatusLabel(task)}</small>
                </span>
                <ChevronRight />
              </a>
            );
          })}
          {!activeSummary.tasks.length ? (
            <p className={dashboardStyles.inspectorEmptyNote}>
              Энэ машин дээр сонгосон өдөр даалгавар нэмэгдээгүй байна.
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <>
      <Card id="my-vehicles" className={dashboardStyles.taskListCard}>
        <CardHeader className={dashboardStyles.taskListHeader}>
          <div className={dashboardStyles.taskListHeaderText}>
            <CardTitle>Миний машин</CardTitle>
            <CardDescription>
              Танд хариуцуулсан машинууд. Машинаа сонгоод өнөөдрийн даалгавар, гүйцэтгэлээ нэг дор харна.
            </CardDescription>
          </div>
          <div className={dashboardStyles.inspectorHeaderTools}>
            <label>
              <span>Огноо</span>
              <input
                type="date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value || todayKey())}
              />
            </label>
            <Badge tone={vehicles.length ? "green" : "slate"}>{vehicles.length} машин</Badge>
          </div>
        </CardHeader>

        {vehicles.length ? (
          <>
            {activeSummary && !activeSummary.total ? (
              <div className={dashboardStyles.inspectorVehicleNotice}>
                <Info aria-hidden />
                <span>Энэ машин дээр сонгосон өдөр даалгавар нэмэгдээгүй байна.</span>
              </div>
            ) : null}
            <div className={dashboardStyles.assignedVehicleGrid}>
              {vehicleSummaries.map((summary) => {
                const isActive = activeSummary?.vehicle.id === summary.vehicle.id;
                return (
                  <Fragment key={summary.vehicle.id}>
                  <button
                    type="button"
                    className={cn(
                      dashboardStyles.assignedVehicleCard,
                      isActive && dashboardStyles.assignedVehicleCardActive,
                    )}
                    onClick={() => setActiveVehicleId(summary.vehicle.id)}
                  >
                    <span className={dashboardStyles.assignedVehicleIcon}>
                      <VehicleLogo src={summary.boardVehicle?.imageUrl} />
                    </span>
                    <span className={dashboardStyles.assignedVehicleContent}>
                      <strong>{summary.plate}</strong>
                      <small>{workDate}</small>
                    </span>
                    <span
                      className={cn(
                        dashboardStyles.assignedVehicleStatus,
                        summary.statusTone === "green" && dashboardStyles.assignedVehicleStatusGreen,
                        summary.statusTone === "amber" && dashboardStyles.assignedVehicleStatusAmber,
                        summary.statusTone === "red" && dashboardStyles.assignedVehicleStatusRed,
                      )}
                    >
                      <i aria-hidden />
                      {summary.statusLabel}
                    </span>
                    <ChevronRight className={dashboardStyles.assignedVehicleChevron} aria-hidden />
                    <span className={dashboardStyles.assignedVehicleStats}>
                      <span>
                        <small>Даалгавар</small>
                        <strong>{summary.total}</strong>
                      </span>
                      <span>
                        <small>Дууссан</small>
                        <strong>{summary.done}</strong>
                      </span>
                      <span>
                        <small>Ачаа</small>
                        <strong>{summary.weightLabel}</strong>
                      </span>
                    </span>
                    <span className={dashboardStyles.assignedVehicleProgress}>
                      <span>
                        <small>Гүйцэтгэл</small>
                        <strong>{summary.progress}%</strong>
                      </span>
                      <i style={{ inlineSize: `${summary.progress}%` }} />
                    </span>
                  </button>
                  {isActive ? renderVehicleDetail(dashboardStyles.inspectorVehicleDetailMobile) : null}
                  </Fragment>
                );
              })}
            </div>

            {renderVehicleDetail(dashboardStyles.inspectorVehicleDetailDesktop)}
          </>
        ) : (
          <div className={dashboardStyles.taskListEmpty}>
            <span className={dashboardStyles.taskListEmptyIcon}>
              <Truck />
            </span>
            <span className="mt-2 block text-[#1F2B24]">Танд оноогдсон машин бүртгэгдээгүй байна.</span>
            <small className="mt-1 block font-medium text-[#8A978E]">
              Хог тээвэрлэлтийн тохиргоонд байцаагч дээр хариуцах машиныг онооно.
            </small>
          </div>
        )}
      </Card>

      {modalVehicle && modalSummary && typeof document !== "undefined"
        ? createPortal(
        <div className={dashboardStyles.inspectorModalBackdrop} role="presentation" onClick={closeModal}>
          <section
            className={dashboardStyles.inspectorModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspector-vehicle-task-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={dashboardStyles.inspectorModalHeader}>
              <div>
                <span>Шинэ даалгавар</span>
                <h2 id="inspector-vehicle-task-title">{modalVehicleLabel}</h2>
                <p>Огноо: {formatDateLabel(workDate)}. Хороо болон хогийн цэгээ сонгоно.</p>
              </div>
              <button type="button" className={dashboardStyles.inspectorModalClose} onClick={closeModal}>
                <X aria-hidden />
                <span>Хаах</span>
              </button>
            </div>

            <form action={createProjectAction} className={dashboardStyles.inspectorTaskForm}>
              <input type="hidden" name="operation_unit" value="garbage_transport" />
              <input type="hidden" name="department_id" value={departmentId ?? ""} />
              <input type="hidden" name="garbage_vehicle_id" value={modalVehicle.id} />
              <input type="hidden" name="name" value={generatedName} />
              <input type="hidden" name="garbage_loader_override" value="1" />
              {(modalVehicle.loaderIds ?? []).map((loaderId) => (
                <input key={loaderId} type="hidden" name="garbage_loader_employee_ids" value={loaderId} />
              ))}

              <label className={dashboardStyles.inspectorField}>
                <span>Огноо</span>
                <input
                  type="date"
                  name="start_date"
                  value={workDate}
                  onChange={(event) => setWorkDate(event.target.value || todayKey())}
                  required
                />
              </label>

              <label className={dashboardStyles.inspectorField}>
                <span>Хороо</span>
                <select
                  name="garbage_subdistrict_id"
                  value={subdistrictId}
                  onChange={(event) => {
                    setSubdistrictId(event.target.value);
                    setSelectedPointIds([]);
                  }}
                  required
                >
                  <option value="">Хороо сонгох</option>
                  {subdistrictOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className={dashboardStyles.inspectorPointSection}>
                <div className={dashboardStyles.inspectorPointHeader}>
                  <div>
                    <span>Хогийн цэг</span>
                    <strong>{selectedPointIds.length} сонгосон</strong>
                  </div>
                  <div className={dashboardStyles.inspectorPointTools}>
                    <button
                      type="button"
                      onClick={selectAllFilteredPoints}
                      disabled={!filteredPoints.length}
                    >
                      Бүгд
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedPoints}
                      disabled={!selectedPointIds.length}
                    >
                      Цэвэрлэх
                    </button>
                  </div>
                </div>
                {subdistrictId ? (
                  filteredPoints.length ? (
                    <div className={dashboardStyles.inspectorPointGrid}>
                      {filteredPoints.map((point) => (
                        <label
                          key={point.id}
                          className={cn(
                            dashboardStyles.inspectorPoint,
                            selectedPointIds.includes(String(point.id)) && dashboardStyles.inspectorPointSelected,
                          )}
                        >
                          <input
                            type="checkbox"
                            name="garbage_point_ids"
                            value={point.id}
                            checked={selectedPointIds.includes(String(point.id))}
                            onChange={() => togglePoint(point.id)}
                          />
                          <span>{point.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className={dashboardStyles.inspectorEmptyNote}>
                      Энэ хороонд танд оноогдсон хогийн цэг алга.
                    </p>
                  )
                ) : (
                  <p className={dashboardStyles.inspectorEmptyNote}>Эхлээд хороогоо сонгоно уу.</p>
                )}
              </div>

              {!departmentId ? (
                <p className={dashboardStyles.inspectorErrorNote}>
                  Хэлтсийн тохиргоо олдсонгүй. Хог тээвэрлэлтийн хэлтэс бүртгэлтэй эсэхийг шалгана уу.
                </p>
              ) : null}

              <div className={dashboardStyles.inspectorModalActions}>
                <button type="button" className={dashboardStyles.inspectorModalSecondary} onClick={closeModal}>
                  Болих
                </button>
                <SubmitButton disabled={!departmentId || !subdistrictId || !selectedPointIds.length} />
              </div>
            </form>
          </section>
        </div>,
          document.body,
        )
        : null}
    </>
  );
}
