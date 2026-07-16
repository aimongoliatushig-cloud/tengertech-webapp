import Link from "next/link";
import { AlertTriangle, Boxes, Gauge, ListChecks, MapPin, Trash2 } from "lucide-react";

import { getWastePointStats } from "@/lib/waste-points/service";
import {
  WASTE_STATUS_LABELS,
  WASTE_TYPE_LABELS,
  type WastePointType,
} from "@/lib/waste-points/types";

import { requireWasteAccess } from "./access";
import { WasteApiError } from "./api-error";
import { WasteShell } from "./waste-shell";
import { WasteSubNav } from "./waste-sub-nav";
import styles from "./waste-points.module.css";

export const dynamic = "force-dynamic";

function pct(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

export default async function WastePointsDashboardPage() {
  const { session, scopedDepartmentName } = await requireWasteAccess();

  let stats: Awaited<ReturnType<typeof getWastePointStats>>;
  try {
    stats = await getWastePointStats();
  } catch (error) {
    return (
      <WasteShell
        session={session}
        scopedDepartmentName={scopedDepartmentName}
        title="Хогийн цэг"
        subtitle="Авто бааз, хог тээвэрлэлтийн хэлтэс · хогийн цэгийн нэгдсэн хяналт"
      >
        <div className={styles.page}>
          <WasteSubNav active="dashboard" />
          <WasteApiError error={error} retryHref="/waste-points" />
        </div>
      </WasteShell>
    );
  }

  return (
    <WasteShell
      session={session}
      scopedDepartmentName={scopedDepartmentName}
      title="Хогийн цэг"
      subtitle="Авто бааз, хог тээвэрлэлтийн хэлтэс · хогийн цэгийн нэгдсэн хяналт"
    >
      <div className={styles.page}>
        <WasteSubNav active="dashboard" />

        <section className={styles.statGrid}>
          <article className={styles.stat}>
            <span className={styles.statIcon}>
              <Trash2 size={16} aria-hidden />
            </span>
            <strong className={styles.statValue}>{stats.total}</strong>
            <span className={styles.statLabel}>Нийт хогийн цэг</span>
          </article>
          <article className={`${styles.stat} ${styles.danger}`}>
            <span className={styles.statIcon}>
              <AlertTriangle size={16} aria-hidden />
            </span>
            <strong className={styles.statValue}>{stats.fullCount}</strong>
            <span className={styles.statLabel}>Дүүрсэн (ачих шаардлагатай)</span>
          </article>
          <article className={`${styles.stat} ${styles.warn}`}>
            <span className={styles.statIcon}>
              <Gauge size={16} aria-hidden />
            </span>
            <strong className={styles.statValue}>{stats.avgFill}%</strong>
            <span className={styles.statLabel}>Дундаж дүүргэлт</span>
          </article>
          <article className={styles.stat}>
            <span className={styles.statIcon}>
              <Boxes size={16} aria-hidden />
            </span>
            <strong className={styles.statValue}>{stats.byKhoroo.length}</strong>
            <span className={styles.statLabel}>Хамрагдсан хороо</span>
          </article>
          <article className={`${styles.stat} ${styles.ok}`}>
            <span className={styles.statIcon}>
              <ListChecks size={16} aria-hidden />
            </span>
            <strong className={styles.statValue}>
              {stats.byStatus.find((s) => s.status === "active")?.count ?? 0}
            </strong>
            <span className={styles.statLabel}>Хэвийн ажиллаж буй</span>
          </article>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Төрлөөр</h2>
            <small>Нийт {stats.total} цэг</small>
          </div>
          <div className={styles.breakdown}>
            {stats.byType.map((row) => (
              <Link
                key={row.type}
                href={`/waste-points/list?type=${row.type}`}
                className={styles.breakdownRow}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <span>{WASTE_TYPE_LABELS[row.type as WastePointType]}</span>
                <span className={styles.bar}>
                  <span className={styles.barFill} style={{ width: `${pct(row.count, stats.total)}%` }} />
                </span>
                <span className={styles.barCount}>{row.count}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Дүүргэлтийн түвшин</h2>
            <small>Дундаж {stats.avgFill}%</small>
          </div>
          <div className={styles.breakdown}>
            {[
              { label: "Бага (0–49%)", count: stats.fill.low },
              { label: "Дунд (50–79%)", count: stats.fill.mid },
              { label: "Өндөр (80–100%)", count: stats.fill.high },
            ].map((row) => (
              <div key={row.label} className={styles.breakdownRow}>
                <span>{row.label}</span>
                <span className={styles.bar}>
                  <span className={styles.barFill} style={{ width: `${pct(row.count, stats.total)}%` }} />
                </span>
                <span className={styles.barCount}>{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Хороогоор</h2>
            <small>Дарж тухайн хорооны цэгүүдийг харна</small>
          </div>
          <div className={styles.khorooGrid}>
            {stats.byKhoroo.map((row) => (
              <Link
                key={row.khoroo}
                href={`/waste-points/list?khoroo=${encodeURIComponent(row.khoroo)}`}
                className={styles.khorooChip}
              >
                <span>{row.khoroo}</span>
                <strong>{row.count}</strong>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Сүүлийн шинэчлэл</h2>
            <small>Сүүлд өөрчлөгдсөн цэгүүд</small>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table} style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Нэр</th>
                  <th>Төрөл</th>
                  <th>Дүүргэлт</th>
                  <th>Төлөв</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentlyUpdated.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.mono}>
                      <Link href={`/waste-points/${p.id}`} style={{ color: "inherit" }}>
                        {p.code}
                      </Link>
                    </td>
                    <td>{p.name}</td>
                    <td>{WASTE_TYPE_LABELS[p.type]}</td>
                    <td className={styles.mono}>{p.currentFillLevel}%</td>
                    <td>
                      <span className={`${styles.pill} ${styles.pillMuted}`}>
                        {WASTE_STATUS_LABELS[p.currentStatus]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className={styles.paginationInfo}>
          <MapPin size={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Бүх цэгийг <Link href="/waste-points/map">газрын зураг дээр</Link> харах боломжтой. Өгөгдлийг
          Smart Clean UB системээс шууд татаж байна.
        </p>
      </div>
    </WasteShell>
  );
}
