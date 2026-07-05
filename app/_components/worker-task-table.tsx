"use client";

import { useState } from "react";

import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, ListChecks } from "lucide-react";

import type { AssignedTaskItem, AssignedTaskStatusKey } from "@/lib/odoo";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  AssignedTaskStatusKey,
  { label: string; dot: string; text: string }
> = {
  planned: { label: "Төлөвлөсөн", dot: "bg-[#94A79A]", text: "text-[#516156]" },
  doing: { label: "Хийгдэж байна", dot: "bg-[#F59E0B]", text: "text-[#B45309]" },
  review: { label: "Шалгаж байна", dot: "bg-[#3B82F6]", text: "text-[#1D4ED8]" },
  done: { label: "Дууссан", dot: "bg-[#22C55E]", text: "text-[#15803D]" },
};

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
}: {
  tasks: AssignedTaskItem[];
  currentDateKey: string;
  allHref?: string;
}) {
  const [filter, setFilter] = useState<"all" | AssignedTaskStatusKey>("all");
  const [menuOpen, setMenuOpen] = useState(false);

  const rows = filter === "all" ? tasks : tasks.filter((task) => task.statusKey === filter);
  const activeCount = tasks.filter((task) => task.statusKey !== "done").length;
  const activeFilterLabel =
    FILTER_OPTIONS.find((option) => option.key === filter)?.label ?? "Бүгд";

  return (
    <section className="rounded-3xl border border-[#E4EFE7] bg-white p-4 shadow-[0_10px_30px_rgba(31,43,36,0.05)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#16241b]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(74,154,93,0.14)] text-[#1b5e20]">
              <ListChecks className="h-4 w-4" />
            </span>
            Миний даалгавар
          </h2>
          <p className="mt-1 text-xs text-[#6b7a72]">
            {activeCount > 0
              ? `Хийж гүйцэтгэх ${activeCount} даалгавар байна. Гүйцэтгэсний дараа тайлан оруулна.`
              : "Оногдсон бүх даалгаврыг гүйцэтгэсэн байна."}
          </p>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E4EFE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3f5147] transition hover:border-[#2e7d32]"
            aria-expanded={menuOpen}
          >
            {activeFilterLabel}
            <ChevronDown className={cn("h-3.5 w-3.5 transition", menuOpen && "rotate-180")} />
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                aria-label="Хаах"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-[#E4EFE7] bg-white py-1 shadow-[0_12px_30px_rgba(31,43,36,0.14)]">
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
                        "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-semibold transition hover:bg-[#F2F8F3]",
                        filter === option.key ? "text-[#1b5e20]" : "text-[#3f5147]",
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
        <div className="grid grid-cols-[28px_minmax(0,1fr)_112px_24px] gap-3 border-b border-[#EEF3EF] px-1 pb-2 text-[11px] font-bold uppercase tracking-wide text-[#8A978E] sm:grid-cols-[32px_minmax(0,1fr)_128px_92px_24px]">
          <span>№</span>
          <span>Даалгаврын нэр</span>
          <span>Төлөв</span>
          <span className="hidden sm:block">Хугацаа</span>
          <span className="text-right">Үйлдэл</span>
        </div>

        {rows.length ? (
          rows.map((task, index) => {
            const status = STATUS_META[task.statusKey];
            const isDone = task.statusKey === "done";
            const overdue = !isDone && Boolean(task.deadline && task.deadline < currentDateKey);
            return (
              <Link
                key={`wtt-${task.id}`}
                href={task.href}
                className="group grid grid-cols-[28px_minmax(0,1fr)_112px_24px] items-center gap-3 rounded-xl px-1 py-2.5 transition hover:bg-[#F6FBF7] sm:grid-cols-[32px_minmax(0,1fr)_128px_92px_24px]"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black",
                    isDone
                      ? "bg-[rgba(34,197,94,0.14)] text-[#15803d]"
                      : "bg-[rgba(74,154,93,0.12)] text-[#1b5e20]",
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </span>

                <span className="min-w-0">
                  <strong
                    className={cn(
                      "block truncate text-sm font-semibold",
                      isDone ? "text-[#5b6b60]" : "text-[#16241b]",
                    )}
                  >
                    {task.name}
                  </strong>
                  <span className={cn("mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold", status.text)}>
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.dot)} />
                    {task.statusLabel || status.label}
                  </span>
                </span>

                <span className="min-w-0">
                  {isDone ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(34,197,94,0.12)] px-2.5 py-1 text-[11px] font-extrabold text-[#15803d]">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Гүйцэтгэсэн
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(46,125,65,0.10)] px-2.5 py-1 text-[11px] font-extrabold text-[#1b5e20]">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Тайлан оруулах
                    </span>
                  )}
                </span>

                <span
                  className={cn(
                    "hidden text-xs font-semibold tabular-nums sm:block",
                    overdue ? "text-[#dc2626]" : "text-[#6b7a72]",
                  )}
                >
                  {task.deadline || "—"}
                </span>

                <span className="flex justify-end text-[#B4C3B8] transition group-hover:text-[#2e7d32]">
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })
        ) : (
          <div className="px-2 py-8 text-center text-sm font-medium text-[#8A978E]">
            Энэ төлөвт даалгавар алга.
          </div>
        )}
      </div>

      <Link
        href={allHref}
        className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#1b5e20] transition hover:gap-2"
      >
        Бүгдийг харах
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
