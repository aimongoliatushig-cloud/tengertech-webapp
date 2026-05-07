"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Download, FileText, Trash2 } from "lucide-react";
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
  { id: "archive", name: "Архивын тайлан" },
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

  const groupedReports = useMemo(
    () => reportTypes.map((type) => ({ ...type, reports: reports.filter((report) => report.reportType === type.id) })),
    [reports],
  );

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
    <div className={styles.twoColumn}>
      {pending ? (
        <div className={styles.loadingOverlay} role="status" aria-live="polite">
          <div className={styles.loadingDialog}>
            <span className={styles.loadingSpinner} aria-hidden />
            <strong>PDF тайлан гаргаж байна</strong>
            <p>Сонгосон хугацааны мэдээллийг Odoo-оос уншаад тайланг хадгалж байна.</p>
          </div>
        </div>
      ) : null}
      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Хадгалсан тайлангууд</h2>
            <p>Гаргасан PDF бүр тайлангийн төрлөөрөө ангилагдана.</p>
          </div>
          <span>{reports.length}</span>
        </div>
        <div className={styles.reportArchiveStack}>
          {groupedReports.map((group) => (
            <article key={group.id} className={styles.reportCategory}>
              <div className={styles.sectionHeader}>
                <h3>{group.name}</h3>
                <span>{group.reports.length}</span>
              </div>
              {group.reports.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Тайлан</th>
                        <th>Хугацаа</th>
                        <th>Гаргасан</th>
                        <th>Үйлдэл</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.reports.map((report) => (
                        <tr key={report.id}>
                          <td>{report.name}</td>
                          <td>
                            {report.dateFrom} - {report.dateTo}
                          </td>
                          <td>{report.generatedBy || report.generatedDate}</td>
                          <td>
                            <div className={styles.recordActions}>
                              <a className={styles.secondaryButton} href={reportViewUrl(report.downloadUrl)}>
                                <Download aria-hidden />
                                PDF
                              </a>
                              <button className={styles.dangerButton} type="button" disabled={deletePendingId === report.id} onClick={() => deleteReport(report)}>
                                <Trash2 aria-hidden />
                                {deletePendingId === report.id ? "Устгаж байна..." : "Устгах"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.mutedText}>Энэ ангилалд хадгалсан тайлан алга.</p>
              )}
            </article>
          ))}
        </div>
      </section>
      <form className={styles.formPanel} onSubmit={submit}>
        <h2>Шинэ PDF тайлан гаргах</h2>
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
            <input name="dateFrom" type="date" defaultValue={initialFilters.dateFrom || monthStartDate()} required />
          </label>
          <label className={styles.field}>
            <span>Дуусах огноо</span>
            <input name="dateTo" type="date" defaultValue={initialFilters.dateTo || todayDate()} required />
          </label>
        </div>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={pending}
        >
          <FileText aria-hidden />
          {pending ? "PDF гаргаж байна..." : "PDF тайлан гаргах"}
        </button>
      </form>
    </div>
  );
}
