"use client";

import { useState } from "react";

import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, ListChecks } from "lucide-react";

import type { AssignedTaskItem, AssignedTaskStatusKey } from "@/lib/odoo";
import { cn } from "@/lib/utils";
import { HIDE_OVERDUE_UI } from "@/lib/ui-feature-flags";

const STATUS_META: Record<
  AssignedTaskStatusKey,
  { label: string; badge: string; text: string; dot: string }
> = {
  // Blue = Planned · Orange = In progress/Review · Green = Done
  planned: { label: "Төлөвлөсөн", badge: "bg-[#E8EEFD] text-[#1D4ED8]", text: "text-[#1D4ED8]", dot: "bg-[#2563EB]" },
  doing: { label: "Хийгдэж байна", badge: "bg-[#FCF0DC] text-[#9A5B05]", text: "text-[#9A5B05]", dot: "bg-[#E8820A]" },
  review: { label: "Шалгаж байна", badge: "bg-[#FCF0DC] text-[#9A5B05]", text: "text-[#9A5B05]", dot: "bg-[#E8820A]" },
  done: { label: "Дууссан", badge: "bg-[#E7F3E8] text-[#1B5E20]", text: "text-[#1B5E20]", dot: "bg-[#2E7D32]" },
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
  title = "Миний даалгавар",
  subtitle,
  variant = "worker",
  maxRows,
}: {
  tasks: AssignedTaskItem[];
  currentDateKey: string;
  allHref?: string;
  title?: string;
  subtitle?: string;
  /** "worker" — миний хийх даалгавар (Тайлан оруулах). "monitor" — хяналтын жагсаалт (төлөв). */
  variant?: "worker" | "monitor";
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
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E7F3E8] text-[#1B5E20]">
              <ListChecks className="h-[18px] w-[18px]" />
            </span>
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-[#57655C]">
            {subtitle
              ? subtitle
              : activeCount > 0
                ? `Хийж гүйцэтгэх ${activeCount} даалгавар байна. Гүйцэтгэсний дараа тайлан оруулна.`
                : "Оногдсон бүх даалгаврыг гүйцэтгэсэн байна."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
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
      </div>

      <div>
        <div className="hidden sm:grid sm:grid-cols-[36px_minmax(0,1fr)_140px_100px_54px] gap-4 border-b border-[#EEF3EF] pl-12 pr-6 pb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8A978E]">
          <span>№</span>
          <span>Даалгаврын нэр</span>
          <span>Төлөв</span>
          <span>Хугацаа</span>
          <span className="text-right">Үйлдэл</span>
        </div>

        {rows.length ? (
          rows.map((task, index) => {
            const status = STATUS_META[task.statusKey];
            const isDone = task.statusKey === "done";
            const overdue = !HIDE_OVERDUE_UI && !isDone && Boolean(task.deadline && task.deadline < currentDateKey);
            // Ижилхэн "Хугацаа хэтэрсэн" гэж мөр бүрт давтахын оронд хэдэн
            // хоногоор хэтэрснийг харуулна — жагсаалт дотор эрэмбэлэгдэх
            // яаралтай байдлыг нэг харцаар ялгаж өгнө.
            const overdueDays = (() => {
              if (!overdue || !task.deadline) {
                return 0;
              }
              const diff = Date.parse(currentDateKey) - Date.parse(task.deadline);
              return Number.isNaN(diff) ? 0 : Math.max(1, Math.round(diff / 86_400_000));
            })();
            const overdueLabel = overdueDays ? `${overdueDays} хоног хэтэрсэн` : "Хугацаа хэтэрсэн";
            const statusPill =
              variant === "monitor" ? (
                /* Хяналтын жагсаалтад будсан хайрцаг олноороо давтагдвал
                   дохиоллын самбар шиг харагддаг тул цэг + текстээр намуухан
                   илэрхийлнэ. */
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium",
                    overdue ? "text-[#B4231C]" : status.text,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", overdue ? "bg-[#DC2626]" : status.dot)} />
                  {overdue ? overdueLabel : status.label}
                </span>
              ) : isDone ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF1EF] px-3 py-1.5 text-xs font-semibold text-[#57655C]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2E7D32]" />
                  Гүйцэтгэсэн
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#E7F3E8] px-3 py-1.5 text-xs font-semibold text-[#1B5E20]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Тайлан оруулах
                </span>
              );
            const dateText = task.deadline ? task.deadline.replaceAll("-", ".") : "—";
            const contextText = [task.departmentName, task.projectName]
              .filter(Boolean)
              .join(" · ");
            return (
              <Link
                key={`wtt-${task.id}`}
                href={task.href}
                className="group flex items-center gap-3 border-b border-[#EEF3EF] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[#F6FBF7] sm:grid sm:grid-cols-[36px_minmax(0,1fr)_140px_100px_54px] sm:gap-4 sm:pl-12 sm:pr-6"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F2F8F3] text-[13px] font-semibold tabular-nums text-[#57655C]">
                  {index + 1}
                </span>

                <span className="min-w-0 flex-1 sm:flex-none">
                  <strong className="block truncate text-sm font-semibold text-[#16241b]">{task.name}</strong>
                  {contextText ? (
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-[#8A978E]">
                      {contextText}
                    </span>
                  ) : null}
                  {/* Гар утсанд төлөв + хугацаа нэрийн доор. Огноог улаанаар
                      будахгүй — хэтэрснийг pill аль хэдийн хэлж байгаа. */}
                  <span className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
                    {statusPill}
                    <span className="text-[12px] font-medium tabular-nums text-[#8A978E]">
                      {dateText}
                    </span>
                  </span>
                </span>

                <span className="hidden min-w-0 sm:block">{statusPill}</span>

                <span className="hidden text-[13px] font-medium tabular-nums text-[#57655C] sm:block">
                  {dateText}
                </span>

                <span className="ml-auto flex shrink-0 justify-end text-[#B4C3B8] transition group-hover:text-[#2e7d32] sm:ml-0">
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })
        ) : (
          <div className="py-10 text-center text-sm font-medium text-[#8A978E]">
            Энэ төлөвт даалгавар алга.
          </div>
        )}
      </div>

      <Link
        href={allHref}
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1b5e20] transition hover:gap-2.5"
      >
        {hasMore ? `Бусад ${filtered.length - rows.length} даалгавар` : "Бүгдийг харах"}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
