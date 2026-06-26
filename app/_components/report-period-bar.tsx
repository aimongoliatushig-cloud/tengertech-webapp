"use client";

import Link from "next/link";

import {
  REPORT_MODE_TABS,
  buildReportPeriodHref,
  buildReportMonthOptions,
  reportTodayDateKey,
  shiftReportDayKey,
  shiftReportMonthKey,
  type ResolvedReportPeriod,
} from "@/lib/report-period";

import styles from "./report-period-bar.module.css";

type Props = {
  basePath: string;
  period: ResolvedReportPeriod;
  // Бусад шүүлтийг (төрөл, хэлтэс, хайлт г.м.) холбоос/формд хадгална.
  extraParams?: Record<string, string>;
};

export function ReportPeriodBar({ basePath, period, extraParams = {} }: Props) {
  const monthOptions = buildReportMonthOptions(reportTodayDateKey().slice(0, 7), period.month);
  const showStep = period.mode === "month" || period.mode === "year" || period.mode === "day";

  const prevHref = buildReportPeriodHref(
    basePath,
    period,
    period.mode === "month"
      ? { month: shiftReportMonthKey(period.month, -1) }
      : period.mode === "year"
        ? { year: String(Number(period.year) - 1) }
        : { date: shiftReportDayKey(period.date, -1) },
    extraParams,
  );
  const nextHref = buildReportPeriodHref(
    basePath,
    period,
    period.mode === "month"
      ? { month: shiftReportMonthKey(period.month, 1) }
      : period.mode === "year"
        ? { year: String(Number(period.year) + 1) }
        : { date: shiftReportDayKey(period.date, 1) },
    extraParams,
  );

  const extraEntries = Object.entries(extraParams).filter(([, value]) => Boolean(value));

  return (
    <div className={styles.periodBar}>
      <div className={styles.modeTabs} role="tablist" aria-label="Хугацааны хэлбэр">
        {REPORT_MODE_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={buildReportPeriodHref(basePath, period, { mode: tab.key }, extraParams)}
            className={`${styles.modeTab} ${period.mode === tab.key ? styles.modeTabActive : ""}`}
            aria-current={period.mode === tab.key ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className={styles.periodPicker}>
        {showStep ? (
          <Link href={prevHref} className={styles.stepButton} aria-label="Өмнөх">
            ◀
          </Link>
        ) : null}
        <strong className={styles.periodLabel}>{period.periodLabel}</strong>
        {showStep ? (
          <Link href={nextHref} className={styles.stepButton} aria-label="Дараах">
            ▶
          </Link>
        ) : null}
      </div>

      <form className={styles.periodForm} action={basePath} method="get">
        {extraEntries.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input type="hidden" name="mode" value={period.mode} />
        {period.mode === "month" ? (
          <select
            name="month"
            defaultValue={period.month}
            aria-label="Сар сонгох"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        {period.mode === "year" ? (
          <input
            type="number"
            name="year"
            min={2020}
            max={2100}
            defaultValue={period.year}
            aria-label="Жил сонгох"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        ) : null}
        {period.mode === "day" ? (
          <input
            type="date"
            name="date"
            defaultValue={period.date}
            aria-label="Өдөр сонгох"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        ) : null}
        {period.mode === "range" ? (
          <>
            <input type="date" name="startDate" defaultValue={period.startDate} aria-label="Эхлэх өдөр" />
            <input type="date" name="endDate" defaultValue={period.endDate} aria-label="Дуусах өдөр" />
            <button type="submit">Харах</button>
          </>
        ) : null}
      </form>
    </div>
  );
}
