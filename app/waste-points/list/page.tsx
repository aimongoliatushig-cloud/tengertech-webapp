import Link from "next/link";
import { Download, Eye, QrCode, Search, SlidersHorizontal } from "lucide-react";

import {
  getAllWastePointsFiltered,
  getKhorooOptions,
  listWastePoints,
  type WastePointSort,
} from "@/lib/waste-points/service";
import {
  WASTE_STATUS_LABELS,
  WASTE_STATUS_TONE,
  WASTE_TYPE_LABELS,
  WASTE_TYPE_TONE,
  formatGps,
  type WastePointStatus,
  type WastePointType,
} from "@/lib/waste-points/types";

import { requireWasteAccess } from "../access";
import { WasteShell } from "../waste-shell";
import { WasteSubNav } from "../waste-sub-nav";
import styles from "../waste-points.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const SORTS: { key: WastePointSort; label: string }[] = [
  { key: "code", label: "Код (А-Я)" },
  { key: "name", label: "Нэр (А-Я)" },
  { key: "khoroo", label: "Хороо" },
  { key: "fill_desc", label: "Дүүргэлт (их→бага)" },
  { key: "fill_asc", label: "Дүүргэлт (бага→их)" },
  { key: "updated", label: "Сүүлд шинэчилсэн" },
];

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const TONE_CLASS: Record<string, string> = {
  ok: "pillOk",
  warn: "pillWarn",
  danger: "pillDanger",
  muted: "pillMuted",
  blue: "pillBlue",
  green: "pillGreen",
  red: "pillRed",
};

export default async function WastePointsListPage({ searchParams }: PageProps) {
  const { session, scopedDepartmentName } = await requireWasteAccess();
  const params = (await searchParams) ?? {};

  const search = firstParam(params.q);
  const type = (firstParam(params.type) || "all") as WastePointType | "all";
  const khoroo = firstParam(params.khoroo) || "all";
  const status = (firstParam(params.status) || "all") as WastePointStatus | "all";
  const sort = (firstParam(params.sort) || "code") as WastePointSort;
  const page = Number(firstParam(params.page)) || 1;

  const query = { search, type, khoroo, status, sort, page, pageSize: 20 };
  const [result, allPoints] = await Promise.all([
    listWastePoints(query),
    getAllWastePointsFiltered({}),
  ]);
  const khorooOptions = getKhorooOptions(allPoints);

  const baseParams = new URLSearchParams();
  if (search) baseParams.set("q", search);
  if (type !== "all") baseParams.set("type", type);
  if (khoroo !== "all") baseParams.set("khoroo", khoroo);
  if (status !== "all") baseParams.set("status", status);
  if (sort !== "code") baseParams.set("sort", sort);
  const pageHref = (p: number) => {
    const next = new URLSearchParams(baseParams);
    if (p > 1) next.set("page", String(p));
    const qs = next.toString();
    return `/waste-points/list${qs ? `?${qs}` : ""}`;
  };
  const exportHref = `/api/waste-points/export${baseParams.toString() ? `?${baseParams.toString()}` : ""}`;

  const from = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
  const to = Math.min(result.page * result.pageSize, result.total);
  const pageNumbers = Array.from({ length: result.pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === result.pageCount || Math.abs(p - result.page) <= 2,
  );

  return (
    <WasteShell
      session={session}
      scopedDepartmentName={scopedDepartmentName}
      title="Хогийн цэгийн жагсаалт"
      subtitle="Хайлт, шүүлт, эрэмбэ, Excel экспорт"
    >
      <div className={styles.page}>
        <WasteSubNav active="list" />

        <section className={styles.card}>
          <form className={styles.filters} action="/waste-points/list" method="get">
            <label className={styles.field}>
              <span>Хайх</span>
              <input type="search" name="q" defaultValue={search} placeholder="Код, нэр, хаяг..." />
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
              <span>Эрэмбэ</span>
              <select name="sort" defaultValue={sort}>
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
              <SlidersHorizontal size={15} aria-hidden /> Шүүх
            </button>
            <a href={exportHref} className={styles.button}>
              <Download size={15} aria-hidden /> Excel татах
            </a>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Хогийн цэгүүд</h2>
            <small>
              <Search size={12} aria-hidden style={{ verticalAlign: "-1px", marginRight: 4 }} />
              {result.total} цэг олдлоо
            </small>
          </div>

          {result.items.length ? (
            <>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Код</th>
                      <th>Нэр</th>
                      <th>Дүүрэг</th>
                      <th>Хороо</th>
                      <th>Төрөл</th>
                      <th>GPS</th>
                      <th>Савны төрөл</th>
                      <th>Багтаамж</th>
                      <th>Дүүргэлт</th>
                      <th>QR</th>
                      <th>Статус</th>
                      <th>Үйлдэл</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((p) => (
                      <tr key={p.id}>
                        <td className={styles.mono}>{p.code}</td>
                        <td>{p.name}</td>
                        <td>{p.districtName}</td>
                        <td>{p.khorooName}</td>
                        <td>
                          <span className={`${styles.pill} ${styles[TONE_CLASS[WASTE_TYPE_TONE[p.type]]]}`}>
                            {WASTE_TYPE_LABELS[p.type]}
                          </span>
                        </td>
                        <td className={styles.mono}>{formatGps(p.latitude, p.longitude)}</td>
                        <td>{p.containerType}</td>
                        <td className={styles.mono}>
                          {p.capacity ? `${p.capacity.toLocaleString("mn-MN")} л` : "—"}
                          {p.containerCount ? ` · ${p.containerCount}ш` : ""}
                        </td>
                        <td>
                          <span className={styles.fillCell}>
                            <span className={styles.bar}>
                              <span className={styles.barFill} style={{ width: `${p.currentFillLevel}%` }} />
                            </span>
                            <small>{p.currentFillLevel}%</small>
                          </span>
                        </td>
                        <td>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className={styles.qrThumb} src={p.qrCode} alt={`${p.code} QR`} />
                        </td>
                        <td>
                          <span
                            className={`${styles.pill} ${styles[TONE_CLASS[WASTE_STATUS_TONE[p.currentStatus]]]}`}
                          >
                            {WASTE_STATUS_LABELS[p.currentStatus]}
                          </span>
                        </td>
                        <td>
                          <span className={styles.rowActions}>
                            <Link className={styles.iconLink} href={`/waste-points/${p.id}`} title="Дэлгэрэнгүй">
                              <Eye size={15} aria-hidden />
                            </Link>
                            <Link
                              className={styles.iconLink}
                              href={`/waste-points/${p.id}#qr`}
                              title="QR код"
                            >
                              <QrCode size={15} aria-hidden />
                            </Link>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  {from}–{to} / нийт {result.total}
                </span>
                <span className={styles.paginationLinks}>
                  <Link
                    href={pageHref(result.page - 1)}
                    className={`${styles.pageLink} ${result.page <= 1 ? styles.pageLinkDisabled : ""}`}
                    aria-disabled={result.page <= 1}
                  >
                    ‹
                  </Link>
                  {pageNumbers.map((p, index) => (
                    <span key={p} style={{ display: "contents" }}>
                      {index > 0 && p - pageNumbers[index - 1] > 1 ? (
                        <span className={styles.paginationInfo}>…</span>
                      ) : null}
                      <Link
                        href={pageHref(p)}
                        className={`${styles.pageLink} ${p === result.page ? styles.pageLinkActive : ""}`}
                      >
                        {p}
                      </Link>
                    </span>
                  ))}
                  <Link
                    href={pageHref(result.page + 1)}
                    className={`${styles.pageLink} ${result.page >= result.pageCount ? styles.pageLinkDisabled : ""}`}
                    aria-disabled={result.page >= result.pageCount}
                  >
                    ›
                  </Link>
                </span>
              </div>
            </>
          ) : (
            <div className={styles.empty}>Сонгосон нөхцөлд таарах хогийн цэг олдсонгүй.</div>
          )}
        </section>
      </div>
    </WasteShell>
  );
}
