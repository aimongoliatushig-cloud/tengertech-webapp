"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Download, FileText, FolderOpen, Layers3, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import type { HrGeneratedReport, HrOption, HrReportType } from "@/lib/hr";

import styles from "../hr.module.css";

const reportTypes: Array<{ id: HrReportType; name: string }> = [
  { id: "employee_list", name: "Ажилтны жагсаалт" },
  { id: "department_employee", name: "Хэлтэс тус бүрийн ажилтны тайлан" },
  { id: "new_employee", name: "Шинээр орсон ажилтны тайлан" },
  { id: "resigned_employee", name: "Ажлаас гарсан ажилтны тайлан" },
  { id: "leave", name: "Чөлөөний тайлан" },
  { id: "sick", name: "Өвчтэй ажилтны тайлан" },
  { id: "business_trip", name: "Томилолтын тайлан" },
  { id: "discipline", name: "Сахилгын тайлан" },
  { id: "transfer", name: "Шилжилт хөдөлгөөний тайлан" },
  { id: "order_contract", name: "Тушаал, гэрээний тайлан" },
  { id: "clearance", name: "Тойрох хуудасны тайлан" },
  { id: "archive", name: "Ажлаас чөлөөлсөн байдлын тайлан" },
];

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function monthStartDate() {
  return `${todayDate().slice(0, 8)}01`;
}

function normalizeReportType(value?: string): HrReportType {
  return reportTypes.some((type) => type.id === value) ? (value as HrReportType) : "employee_list";
}

function reportViewUrl(url: string) {
  const reportUrl = new URL(url, "http://localhost");
  const reportId = reportUrl.pathname.match(/\/api\/hr\/reports\/([^/]+)\/download$/)?.[1] || "";
  const fallback = reportUrl.searchParams.get("fallback");
  if (!reportId) {
    return "/hr/reports";
  }
  return `/hr/reports/${reportId}/view${fallback ? `?fallback=${encodeURIComponent(fallback)}` : ""}`;
}

export function HrReportsClient({
  reports,
  departments,
  initialFilters = {},
}: {
  reports: HrGeneratedReport[];
  departments: HrOption[];
  initialFilters?: {
    reportType?: string;
    departmentId?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [deletePendingId, setDeletePendingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [selectedType, setSelectedType] = useState<HrReportType>(normalizeReportType(initialFilters.reportType));
  const [selectedArchiveType, setSelectedArchiveType] = useState<HrReportType | "all">("all");

  const groupedReports = useMemo(
    () => reportTypes.map((type) => ({ ...type, reports: reports.filter((report) => report.reportType === type.id) })),
    [reports],
  );
  const visibleReports = useMemo(
    () => (selectedArchiveType === "all" ? reports : reports.filter((report) => report.reportType === selectedArchiveType)),
    [reports, selectedArchiveType],
  );
  const selectedReportTypeName = reportTypes.find((type) => type.id === selectedType)?.name ?? reportTypes[0].name;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/hr/reports", { method: "POST", body: new FormData(event.currentTarget) });
      const payload = (await response.json().catch(() => ({}))) as { report?: HrGeneratedReport; error?: string };
      if (!response.ok) throw new Error(payload.error || "HR тайлан гаргахад алдаа гарлаа.");
      setMessage("HR тайлан PDF-ээр гарч, өөрийн ангилалдаа хадгалагдлаа.");
      if (payload.report?.downloadUrl) {
        window.location.assign(reportViewUrl(payload.report.downloadUrl));
        return;
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "HR тайлан гаргахад алдаа гарлаа.");
    } finally {
      setPending(false);
    }
  }

  async function deleteReport(report: HrGeneratedReport) {
    if (!window.confirm("Энэ хадгалсан тайланг устгах уу?")) return;
    setDeletePendingId(report.id);
    setMessage("");
    try {
      const response = await fetch(`/api/hr/reports/${report.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "HR тайлан устгахад алдаа гарлаа.");
      setMessage("Хадгалсан тайлан устгагдлаа.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "HR тайлан устгахад алдаа гарлаа.");
    } finally {
      setDeletePendingId(null);
    }
  }

  return (
    <div className={styles.reportWorkspace}>
      {pending ? (
        <div className={styles.loadingOverlay} role="status" aria-live="polite">
          <div className={styles.loadingDialog}>
            <span className={styles.loadingSpinner} aria-hidden />
            <strong>PDF тайлан гаргаж байна</strong>
            <p>Сонгосон хугацааны мэдээллийг Odoo-оос уншаад тайланг хадгалж байна.</p>
          </div>
        </div>
      ) : null}

      <section className={styles.reportListPanel}>
        <div className={styles.reportListHeader}>
          <div>
            <span className={styles.eyebrow}>Тайлангийн архив</span>
            <h2>Хадгалсан тайлангууд</h2>
            <p>Гаргасан PDF бүр тайлангийн төрлөөрөө ангилагдаж, эндээс нээх болон устгах боломжтой.</p>
          </div>
          <strong>{reports.length}</strong>
        </div>

        <div className={styles.reportTypeTabs} role="tablist" aria-label="Тайлангийн төрөл">
          <button
            type="button"
            className={selectedArchiveType === "all" ? styles.reportTypeTabActive : styles.reportTypeTab}
            onClick={() => setSelectedArchiveType("all")}
          >
            <Layers3 aria-hidden />
            <span>Бүгд</span>
            <strong>{reports.length}</strong>
          </button>
          {groupedReports.map((group) => (
            <button
              key={group.id}
              type="button"
              className={selectedArchiveType === group.id ? styles.reportTypeTabActive : styles.reportTypeTab}
              onClick={() => setSelectedArchiveType(group.id)}
            >
              <FileText aria-hidden />
              <span>{group.name}</span>
              <strong>{group.reports.length}</strong>
            </button>
          ))}
        </div>

        {visibleReports.length ? (
          <div className={styles.reportCardList}>
            {visibleReports.map((report) => {
              const typeName = reportTypes.find((type) => type.id === report.reportType)?.name ?? "HR тайлан";
              return (
                <article key={report.id} className={styles.reportCard}>
                  <div className={styles.reportCardIcon}>
                    <FileText aria-hidden />
                  </div>
                  <div className={styles.reportCardBody}>
                    <strong>{report.name}</strong>
                    <span>{typeName}</span>
                    <p>
                      {report.dateFrom} - {report.dateTo}
                    </p>
                  </div>
                  <div className={styles.reportCardMeta}>
                    <span>
                      <CalendarDays aria-hidden />
                      {report.generatedDate}
                    </span>
                    <span>
                      <Users aria-hidden />
                      {report.generatedBy || "HR"}
                    </span>
                  </div>
                  <div className={styles.reportCardActions}>
                    <a className={styles.secondaryButton} href={reportViewUrl(report.downloadUrl)}>
                      <Download aria-hidden />
                      PDF
                    </a>
                    <button
                      className={styles.dangerButton}
                      type="button"
                      disabled={deletePendingId === report.id}
                      onClick={() => deleteReport(report)}
                    >
                      <Trash2 aria-hidden />
                      {deletePendingId === report.id ? "Устгаж байна..." : "Устгах"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.reportEmptyState}>
            <FolderOpen aria-hidden />
            <strong>Энэ ангилалд хадгалсан тайлан алга.</strong>
            <span>Баруун талын формоор PDF тайлан гаргахад сонгосон төрөлдөө хадгалагдана.</span>
          </div>
        )}
      </section>

      <aside className={styles.reportSidePanel}>
        <form className={styles.reportCreateForm} onSubmit={submit}>
          <div className={styles.reportCreateHeader}>
            <span className={styles.eyebrow}>PDF тайлан</span>
            <h2>Шинэ PDF тайлан гаргах</h2>
            <p>{selectedReportTypeName}</p>
          </div>
          {message ? <p className={message.includes("алдаа") || message.includes("болохгүй") ? styles.errorText : styles.successText}>{message}</p> : null}
          <label className={styles.field}>
            <span>Тайлангийн төрөл</span>
            <select name="reportType" value={selectedType} onChange={(event) => setSelectedType(event.target.value as HrReportType)} required>
              {reportTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Хэлтэс</span>
            <select name="departmentId" defaultValue={initialFilters.departmentId || ""}>
              <option value="">Бүх хэлтэс</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.formGridTwo}>
            <label className={styles.field}>
              <span>Эхлэх огноо</span>
              <input name="dateFrom" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} defaultValue={initialFilters.dateFrom || monthStartDate()} required />
            </label>
            <label className={styles.field}>
              <span>Дуусах огноо</span>
              <input name="dateTo" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} defaultValue={initialFilters.dateTo || todayDate()} required />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit" disabled={pending}>
            <FileText aria-hidden />
            {pending ? "PDF гаргаж байна..." : "PDF тайлан гаргах"}
          </button>
        </form>
        <div className={styles.reportSideHint}>
          <strong>{reports.length}</strong>
          <span>хадгалсан PDF тайлан</span>
        </div>
      </aside>
    </div>
  );
}
