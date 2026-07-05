"use client";

import { useState } from "react";

import Link from "next/link";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";

import type { AssignedTaskItem, AssignedTaskStatusKey } from "@/lib/odoo";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  AssignedTaskStatusKey,
  { label: string; badge: string; dot: string }
> = {
  // Blue = Planned · Orange = In progress/Review · Green = Done
  planned: { label: "Төлөвлөсөн", badge: "bg-[#E8EEFD] text-[#1D4ED8]", dot: "bg-[#2563EB]" },
  doing: { label: "Хийгдэж байна", badge: "bg-[#FCF0DC] text-[#9A5B05]", dot: "bg-[#E8820A]" },
  review: { label: "Шалгаж байна", badge: "bg-[#FCF0DC] text-[#9A5B05]", dot: "bg-[#E8820A]" },
  done: { label: "Дууссан", badge: "bg-[#E7F3E8] text-[#1B5E20]", dot: "bg-[#2E7D32]" },
};
const OVERDUE_BADGE = "bg-[#FBE9E9] text-[#B01919]";

const FILTER_OPTIONS: Array<{ key: "all" | AssignedTaskStatusKey; label: string }> = [
  { key: "all", label: "Бүгд" },
  { key: "planned", label: "Төлөвлөсөн" },
  { key: "doing", label: "Хийгдэж байна" },
  { key: "review", label: "Шалгаж байна" },
  { key: "done", label: "Дууссан" },
];

export function WorkerTaskTable({
  tasks,
  currentDateKey,
  allHref = "/tasks",
  title = "Өнөөдрийн даалгавар",
  maxRows,
}: {
  tasks: AssignedTaskItem[];
  currentDateKey: string;
  allHref?: string;
  title?: string;
  maxRows?: number;
}) {
  const [filter, setFilter] = useState<"all" | AssignedTaskStatusKey>("all");
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = filter === "all" ? tasks : tasks.filter((task) => task.statusKey === filter);
  const rows = maxRows ? filtered.slice(0, maxRows) : filtered;
  const hasMore = maxRows ? filtered.length > maxRows : false;
  const activeCount = tasks.filter((task) => task.statusKey !== "done").length;
  const activeFilterLabel =
    FILTER_OPTIONS.find((option) => option.key === filter)?.label ?? "Бүгд";

  return (
    <section className="min-w-0 rounded-2xl border border-[#E7EBE8] bg-white p-6 shadow-[0_1px_2px_rgba(20,40,30,0.04),0_1px_3px_rgba(20,40,30,0.06)]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#16241b]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF1EF] text-[#16241b]">
              <ListChecks className="h-[18px] w-[18px]" />
            </span>
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-[#57655C]">
            {activeCount > 0
              ? `Хийж гүйцэтгэх ${activeCount} даалгавар байна. Гүйцэтгэсний дараа тайлан оруулна.`
              : "Оногдсон бүх даалгаврыг гүйцэтгэсэн байна."}
          </p>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E7EBE8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#3f5147] transition hover:border-[#B4C3B8]"
            aria-expanded={menuOpen}
          >
            {activeFilterLabel}
            <ChevronDown className={cn("h-4 w-4 transition", menuOpen && "rotate-180")} />
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                aria-label="Хаах"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-[#E7EBE8] bg-white py-1 shadow-[0_12px_30px_rgba(20,40,30,0.14)]">
                {FILTER_OPTIONS.map((option) => {
                  const count =
                    option.key === "all"
                      ? tasks.length
                      : tasks.filter((task) => task.statusKey === option.key).length;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setFilter(option.key);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-semibold transition hover:bg-[#F2F8F3]",
                        filter === option.key ? "text-[#2563EB]" : "text-[#3f5147]",
                      )}
                    >
                      {option.label}
                      <span className="text-[#8A978E]">{count}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div>
        <div className="grid grid-cols-[32px_minmax(0,1fr)_120px_58px] gap-4 border-b border-[#EEF3EF] px-2 pb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8A978E] sm:grid-cols-[36px_minmax(0,1fr)_150px_72px]">
          <span>№</span>
          <span>Даалгавар</span>
          <span>Төлөв</span>
          <span className="text-right">Хугацаа</span>
        </div>

        {rows.length ? (
          rows.map((task, index) => {
            const status = STATUS_META[task.statusKey];
            const isDone = task.statusKey === "done";
            const overdue = !isDone && Boolean(task.deadline && task.deadline < currentDateKey);
            const dueShort = task.deadline ? task.deadline.slice(5) : "—";
            return (
              <Link
                key={`wtt-${task.id}`}
                href={task.href}
                className="group grid grid-cols-[32px_minmax(0,1fr)_120px_58px] items-center gap-4 border-b border-[#EEF3EF] px-2 py-2.5 transition-colors last:border-b-0 hover:bg-[#F6F8F7] sm:grid-cols-[36px_minmax(0,1fr)_150px_72px]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF1EF] text-[13px] font-bold tabular-nums text-[#57655C]">
                  {index + 1}
                </span>

                <span className="min-w-0">
                  <strong className="block truncate text-sm font-semibold text-[#16241b]">{task.name}</strong>
                  {task.projectName ? (
                    <span className="mt-0.5 block truncate text-xs font-medium text-[#8A978E]">{task.projectName}</span>
                  ) : null}
                </span>

                <span className="min-w-0">
                  {overdue ? (
                    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold", OVERDUE_BADGE)}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
                      Хугацаа хэтэрсэн
                    </span>
                  ) : (
                    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold", status.badge)}>
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.dot)} />
                      {status.label}
                    </span>
                  )}
                </span>

                <span
                  className={cn(
                    "text-right text-[13px] font-semibold tabular-nums",
                    overdue ? "text-[#DC2626]" : "text-[#57655C]",
                  )}
                >
                  {dueShort}
                </span>
              </Link>
            );
          })
        ) : (
          <div className="px-2 py-10 text-center text-sm font-medium text-[#8A978E]">
            Энэ төлөвт даалгавар алга.
          </div>
        )}
      </div>

      <Link
        href={allHref}
        className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563EB] transition hover:gap-2"
      >
        {hasMore ? `Бусад ${filtered.length - rows.length} даалгавар` : "Бүгдийг харах"}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
