import { Download, SlidersHorizontal } from "lucide-react";

import {
  buildWasteReport,
  getAllWastePointsFiltered,
  getKhorooOptions,
} from "@/lib/waste-points/service";
import { groupTaskRows, loadWasteTaskRows } from "@/lib/waste-points/task-report";
import {
  WASTE_STATUS_LABELS,
  WASTE_TYPE_LABELS,
  type WastePointStatus,
  type WastePointType,
} from "@/lib/waste-points/types";

import { requireWasteAccess } from "../access";
import { WasteApiError } from "../api-error";
import { WasteShell } from "../waste-shell";
import { WasteSubNav } from "../waste-sub-nav";
import styles from "../waste-points.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function WastePointsReportPage({ searchParams }: PageProps) {
  const { session, scopedDepartmentName } = await requireWasteAccess();
  const params = (await searchParams) ?? {};

  const type = (firstParam(params.type) || "all") as WastePointType | "all";
  const khoroo = firstParam(params.khoroo) || "all";
  const status = (firstParam(params.status) || "all") as WastePointStatus | "all";
  const dateFromRaw = firstParam(params.dateFrom);
  const dateToRaw = firstParam(params.dateTo);
  const dateFrom = DATE_RE.test(dateFromRaw) ? dateFromRaw : "";
  const dateTo = DATE_RE.test(dateToRaw) ? dateToRaw : "";

  const query = { type, khoroo, status, dateFrom, dateTo };
  let report: Awaited<ReturnType<typeof buildWasteReport>>;
  let khorooOptions: string[];
  let taskRows: Awaited<ReturnType<typeof loadWasteTaskRows>>;
  try {
    const [reportResult, allPoints, tasks] = await Promise.all([
      buildWasteReport(query),
      getAllWastePointsFiltered({}),
      loadWasteTaskRows({ dateFrom, dateTo }),
    ]);
    report = reportResult;
    khorooOptions = getKhorooOptions(allPoints);
    taskRows = tasks;
  } catch (error) {
    return (
      <WasteShell
        session={session}
        scopedDepartmentName={scopedDepartmentName}
        title="Хогийн цэгийн тайлан"
        subtitle="Хороо, төрөл, төлөв, огноо, машин, жолоочоор шүүж Excel/PDF гаргана"
      >
        <div className={styles.page}>
          <WasteSubNav active="report" />
          <WasteApiError error={error} retryHref="/waste-points/report" />
        </div>
      </WasteShell>
    );
  }
  const byVehicle = groupTaskRows(taskRows, "vehicle");
  const byDriver = groupTaskRows(taskRows, "driver");

  const exportParams = new URLSearchParams();
  if (type !== "all") exportParams.set("type", type);
  if (khoroo !== "all") exportParams.set("khoroo", khoroo);
  if (status !== "all") exportParams.set("status", status);
  if (dateFrom) exportParams.set("dateFrom", dateFrom);
  if (dateTo) exportParams.set("dateTo", dateTo);
  const qs = exportParams.toString();
  const excelHref = `/api/waste-points/report-export?${qs ? `${qs}&` : ""}format=excel`;
  const pdfHref = `/api/waste-points/report-export?${qs ? `${qs}&` : ""}format=pdf`;

  return (
    <WasteShell
      session={session}
      scopedDepartmentName={scopedDepartmentName}
      title="Хогийн цэгийн тайлан"
      subtitle="Хороо, төрөл, төлөв, огноо, машин, жолоочоор шүүж Excel/PDF гаргана"
    >
      <div className={styles.page}>
        <WasteSubNav active="report" />

        <section className={styles.card}>
          <form className={styles.filters} action="/waste-points/report" method="get">
            <label className={styles.field}>
              <span>Хороо</span>
              <select name="khoroo" defaultValue={khoroo}>
                <option value="all">Бүх хороо</option>
                {khorooOptions.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Төрөл</span>
              <select name="type" defaultValue={type}>
                <option value="all">Бүх төрөл</option>
                {(Object.keys(WASTE_TYPE_LABELS) as WastePointType[]).map((t) => (
                  <option key={t} value={t}>
                    {WASTE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Төлөв</span>
              <select name="status" defaultValue={status}>
                <option value="all">Бүх төлөв</option>
                {(Object.keys(WASTE_STATUS_LABELS) as WastePointStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {WASTE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Огноо (эхлэх)</span>
              <input type="date" name="dateFrom" defaultValue={dateFrom} />
            </label>
            <label className={styles.field}>
              <span>Огноо (дуусах)</span>
              <input type="date" name="dateTo" defaultValue={dateTo} />
            </label>
            <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
              <SlidersHorizontal size={15} aria-hidden /> Шүүх
            </button>
            <a href={excelHref} className={styles.button}>
              <Download size={15} aria-hidden /> Excel
            </a>
            <a href={pdfHref} className={styles.button}>
              <Download size={15} aria-hidden /> PDF
            </a>
          </form>
        </section>

        <section className={styles.statGrid}>
          <article className={styles.stat}>
            <strong className={styles.statValue}>{report.total}</strong>
            <span className={styles.statLabel}>Тайланд хамрагдсан цэг</span>
          </article>
          <article className={`${styles.stat} ${styles.danger}`}>
            <strong className={styles.statValue}>{report.fullCount}</strong>
            <span className={styles.statLabel}>Дүүрсэн</span>
          </article>
          <article className={`${styles.stat} ${styles.warn}`}>
            <strong className={styles.statValue}>{report.avgFill}%</strong>
            <span className={styles.statLabel}>Дундаж дүүргэлт</span>
          </article>
          <article className={styles.stat}>
            <strong className={styles.statValue}>
              {report.totalCapacity.toLocaleString("mn-MN")}
            </strong>
            <span className={styles.statLabel}>Нийт багтаамж (л)</span>
          </article>
          <article className={styles.stat}>
            <strong className={styles.statValue}>{taskRows.length}</strong>
            <span className={styles.statLabel}>ERP-д үүссэн ажил</span>
          </article>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Хороогоор</h2>
            <small>{report.byKhoroo.length} хороо</small>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table} style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Хороо</th>
                  <th>Цэгийн тоо</th>
                  <th>Дундаж дүүргэлт</th>
                  <th>Дүүрсэн</th>
                  <th>Багтаамж (л)</th>
                </tr>
              </thead>
              <tbody>
                {report.byKhoroo.map((g) => (
                  <tr key={g.key}>
                    <td>{g.label}</td>
                    <td className={styles.mono}>{g.count}</td>
                    <td className={styles.mono}>{g.avgFill}%</td>
                    <td className={styles.mono}>{g.fullCount}</td>
                    <td className={styles.mono}>{g.capacity.toLocaleString("mn-MN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Төрөл ба төлөвөөр</h2>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table} style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Ангилал</th>
                  <th>Утга</th>
                  <th>Тоо</th>
                  <th>Дундаж дүүргэлт</th>
                </tr>
              </thead>
              <tbody>
                {report.byType.map((g) => (
                  <tr key={`type-${g.key}`}>
                    <td>Төрөл</td>
                    <td>{g.label}</td>
                    <td className={styles.mono}>{g.count}</td>
                    <td className={styles.mono}>{g.avgFill}%</td>
                  </tr>
                ))}
                {report.byStatus.map((g) => (
                  <tr key={`status-${g.key}`}>
                    <td>Төлөв</td>
                    <td>{g.label}</td>
                    <td className={styles.mono}>{g.count}</td>
                    <td className={styles.mono}>{g.avgFill}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Машин, жолоочоор (ERP ажил)</h2>
            <small>{taskRows.length} ажил</small>
          </div>
          {taskRows.length ? (
            <div className={styles.tableScroll}>
              <table className={styles.table} style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Ангилал</th>
                    <th>Утга</th>
                    <th>Ажлын тоо</th>
                  </tr>
                </thead>
                <tbody>
                  {byVehicle.map((g) => (
                    <tr key={`v-${g.label}`}>
                      <td>Машин</td>
                      <td>{g.label}</td>
                      <td className={styles.mono}>{g.count}</td>
                    </tr>
                  ))}
                  {byDriver.map((g) => (
                    <tr key={`d-${g.label}`}>
                      <td>Жолооч</td>
                      <td>{g.label}</td>
                      <td className={styles.mono}>{g.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              Сонгосон хугацаанд хогийн цэгийн ажил үүсээгүй байна. Цэг дээрээс «Ажил үүсгэх» дармагц энд
              харагдана (машин, жолооч нь ажилд оноогдсоны дараа бөглөгдөнө).
            </div>
          )}
        </section>
      </div>
    </WasteShell>
  );
}
