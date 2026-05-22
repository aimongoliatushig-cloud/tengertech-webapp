"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  MapPin,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";

import dashboardStyles from "@/app/dashboard-view.module.css";
import { cn } from "@/lib/utils";

import reviewStyles from "./review.module.css";

export type ReviewInspectorBoardTask = {
  id: number;
  name: string;
  departmentName: string;
  projectName: string;
  leaderName: string;
  href: string;
  progress: number;
  deadline: string;
  scheduledDate?: string | null;
  operationTypeLabel: string;
  vehicleId?: number | null;
  vehiclePlate: string;
  vehicleModel: string;
  vehicleImageUrl: string;
};

type ReviewBoardFilter = "all" | "today" | "dated";

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase("mn-MN");
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return "Огноо тодорхойгүй";
  }

  const normalized = value.includes("T") ? value.slice(0, 10) : value;
  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(
    parsed.getDate(),
  ).padStart(2, "0")}, ${weekdays[parsed.getDay()]}`;
}

function ReviewVehicleImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <Truck aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setFailed(true)} />
  );
}

function groupKeyForTask(task: ReviewInspectorBoardTask) {
  return task.vehicleId ? `vehicle:${task.vehicleId}` : `fallback:${task.vehiclePlate}`;
}

export function ReviewInspectorBoard({
  tasks,
  totalTaskCount,
  scopedDepartmentName,
  fleetLoadError,
}: {
  tasks: ReviewInspectorBoardTask[];
  totalTaskCount: number;
  scopedDepartmentName: string | null;
  fleetLoadError: string;
}) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ReviewBoardFilter>("all");
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const today = todayKey();

  const taskGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        vehiclePlate: string;
        vehicleModel: string;
        vehicleImageUrl: string;
        tasks: ReviewInspectorBoardTask[];
        progress: number;
      }
    >();

    for (const task of tasks) {
      const key = groupKeyForTask(task);
      const existing = groups.get(key) ?? {
        key,
        vehiclePlate: task.vehiclePlate,
        vehicleModel: task.vehicleModel,
        vehicleImageUrl: task.vehicleImageUrl,
        tasks: [],
        progress: 0,
      };
      existing.tasks.push(task);
      existing.progress = Math.round(
        existing.tasks.reduce((sum, item) => sum + Math.max(0, Math.min(100, item.progress)), 0) /
          existing.tasks.length,
      );
      groups.set(key, existing);
    }

    return Array.from(groups.values()).sort(
      (left, right) =>
        right.tasks.length - left.tasks.length ||
        left.vehiclePlate.localeCompare(right.vehiclePlate, "mn"),
    );
  }, [tasks]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());
    return taskGroups.filter((group) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "today" && group.tasks.some((task) => task.scheduledDate === today)) ||
        (activeFilter === "dated" && group.tasks.some((task) => Boolean(task.scheduledDate)));
      const matchesQuery =
        !normalizedQuery ||
        normalizeText(
          `${group.vehiclePlate} ${group.vehicleModel} ${group.tasks
            .map((task) => `${task.name} ${task.projectName} ${task.leaderName}`)
            .join(" ")}`,
        ).includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, query, taskGroups, today]);

  const activeGroup =
    filteredGroups.find((group) => group.key === activeGroupKey) ?? filteredGroups[0] ?? null;
  const todayReviewCount = tasks.filter((task) => task.scheduledDate === today).length;
  const datedReviewCount = tasks.filter((task) => Boolean(task.scheduledDate)).length;
  const filterItems: Array<{ key: ReviewBoardFilter; label: string; value: number }> = [
    { key: "all", label: "Бүгд", value: tasks.length },
    { key: "today", label: "Өнөөдөр", value: todayReviewCount },
    { key: "dated", label: "Огноотой", value: datedReviewCount },
  ];

  return (
    <section className={dashboardStyles.inspectorVehicleBoard}>
      {fleetLoadError ? (
        <div className={reviewStyles.reviewNotice}>{fleetLoadError}</div>
      ) : null}

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
            placeholder="Хайх (дугаар, ажил, хороo...)"
          />
        </label>

      </div>

      {filteredGroups.length ? (
        <div className={dashboardStyles.inspectorVehicleScroller}>
          {filteredGroups.map((group) => {
            const isActive = activeGroup?.key === group.key;
            return (
              <button
                key={group.key}
                type="button"
                className={cn(
                  dashboardStyles.inspectorVehicleCard,
                  isActive && dashboardStyles.inspectorVehicleCardActive,
                )}
                onClick={() => setActiveGroupKey(group.key)}
                >
                  <span className={dashboardStyles.inspectorVehicleImage}>
                    <ReviewVehicleImage src={group.vehicleImageUrl} />
                  </span>
                <span className={dashboardStyles.inspectorVehicleCardBody}>
                  <strong>{group.vehiclePlate}</strong>
                  <small>{group.vehicleModel}</small>
                  <span className={dashboardStyles.inspectorVehicleCardStats}>
                    <span>
                      <small>Хянах</small>
                      <b>{group.tasks.length}</b>
                    </span>
                    <span>
                      <small>Нийт ажил</small>
                      <b>{totalTaskCount}</b>
                    </span>
                  </span>
                  <span className={dashboardStyles.inspectorVehicleProgress}>
                    <i style={{ inlineSize: `${group.progress}%` }} />
                    <em>{group.progress}%</em>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={dashboardStyles.inspectorEmptyState}>
          <ShieldCheck aria-hidden />
          <strong>Хянах тайлан олдсонгүй.</strong>
          <span>Хайлт эсвэл шүүлтүүрээ өөрчлөөд дахин шалгана уу.</span>
        </div>
      )}

      <div className={reviewStyles.reviewSummaryStrip}>
        <span>
          <CalendarDays aria-hidden />
          {formatDateLabel(today)}
        </span>
        <span>{scopedDepartmentName ?? "Бүх алба хэлтэс"}</span>
        <span>{tasks.length} хянах ажил</span>
      </div>

      <div className={dashboardStyles.inspectorWorkspaceGrid}>
        <section className={dashboardStyles.inspectorSelectedPanel}>
          {activeGroup ? (
            <>
              <header>
                <h2>
                  Сонгосон машин: {activeGroup.vehiclePlate} <span>({activeGroup.vehicleModel})</span>
                </h2>
                <p>Хянах даалгавар ({activeGroup.tasks.length})</p>
              </header>
              <div className={dashboardStyles.inspectorTaskTimeline}>
                {activeGroup.tasks.map((task) => (
                  <Link key={task.id} href={task.href} className={dashboardStyles.inspectorTimelineTask}>
                    <span className={dashboardStyles.inspectorTimelineDot} />
                    <span className={dashboardStyles.inspectorTimelineBody}>
                      <strong>{task.name}</strong>
                      <small>
                        <MapPin aria-hidden />
                        {task.projectName || task.operationTypeLabel}
                      </small>
                    </span>
                    <span className={reviewStyles.reviewActionButton}>Хянах</span>
                    <span className={dashboardStyles.inspectorTimelineDate}>
                      Огноо: {task.scheduledDate ? task.scheduledDate.replaceAll("-", ".") : task.deadline}
                    </span>
                    <ShieldCheck aria-hidden />
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div className={dashboardStyles.inspectorEmptyState}>
              <ShieldCheck aria-hidden />
              <strong>Хянах ажил сонгоно уу.</strong>
            </div>
          )}
        </section>

        <aside className={cn(dashboardStyles.inspectorCreatePanel, reviewStyles.reviewSidePanel)}>
          <h2>Тайлан хянах</h2>
          <div className={reviewStyles.reviewSideStat}>
            <span>Нийт хянах ажил</span>
            <strong>{tasks.length}</strong>
          </div>
          <div className={reviewStyles.reviewSideStat}>
            <span>Өнөөдрийн хянах</span>
            <strong>{todayReviewCount}</strong>
          </div>
          <div className={reviewStyles.reviewSideStat}>
            <span>Машин/бүлэг</span>
            <strong>{taskGroups.length}</strong>
          </div>
          {activeGroup?.tasks[0] ? (
            <Link href={activeGroup.tasks[0].href} className={reviewStyles.reviewPrimaryLink}>
              Эхний ажлыг хянах
            </Link>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
