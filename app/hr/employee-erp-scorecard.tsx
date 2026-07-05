import type { ReactNode } from "react";

import type { EmployeeErpEvaluation } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import styles from "./hr.module.css";

const ROLE_LABELS: Record<string, string> = {
  worker: "Ажилтан",
  master: "Мастер",
  team_leader: "Багийн ахлагч",
  manager: "Менежер",
  director: "Захирал",
  general_manager: "Ерөнхий менежер",
  system_admin: "Системийн админ",
};

function employeeAge(birthDate: string): number | null {
  const year = Number((birthDate || "").slice(0, 4));
  if (!(year > 1900)) return null;
  const now = new Date();
  const monthDay = (birthDate || "").slice(5, 10);
  const nowMonthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let age = now.getFullYear() - year;
  if (monthDay && nowMonthDay < monthDay) age -= 1;
  return age;
}

function scorecardInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("mn-MN") ?? "");
  return letters.join("") || "?";
}

export function EmployeeErpScorecard({
  employee,
  evaluation,
}: {
  employee: HrEmployeeDirectoryItem;
  evaluation: EmployeeErpEvaluation;
}) {
  const age = employeeAge(employee.birthDate);
  const missingDocs = employee.missingDocumentCount ?? 0;
  const hasContact = Boolean((employee.mobilePhone || employee.workPhone || "").trim() && (employee.workEmail || employee.privateEmail || "").trim());
  const hasDocs = missingDocs === 0;
  const hasFinancial = Boolean(
    (employee.bankAccountNumber || "").trim() ||
      (employee.taxNumber || "").trim() ||
      (employee.payCategory || "").trim() ||
      (employee.bankName || "").trim(),
  );
  const hasGrade = Boolean((employee.gradeRank || "").trim());

  const completionPercent = evaluation.totalTasks
    ? Math.round((evaluation.completedTasks / evaluation.totalTasks) * 100)
    : Math.round(employee.taskCompletionPercent || 0);

  // Профайл бүрдэлт: хувийн (үргэлж), холбоо, баримт, санхүү
  const profileChecks = [true, hasContact, hasDocs, hasFinancial];
  const profileScore = Math.round((profileChecks.filter(Boolean).length / profileChecks.length) * 100);

  // Ерөнхий төлөв
  const problems = [!hasDocs, !hasFinancial, evaluation.totalTasks > 0 && completionPercent === 0].filter(Boolean).length;
  const overall =
    profileScore >= 90 && completionPercent >= 60
      ? { label: "Идэвхтэй, бүрэн", tone: "good" as const, note: "Профайл бүрэн, гүйцэтгэл сайн" }
      : evaluation.hasLogin && (evaluation.totalTasks > 0 || completionPercent > 0)
        ? problems >= 2
          ? { label: "Эхлэл шатанд", tone: "warn" as const, note: "Бүртгэлтэй, идэвхжсэн · гүйцэтгэл/профайл дутуу" }
          : { label: "Хэвийн", tone: "good" as const, note: "Ажиллаж эхэлсэн" }
        : { label: "Идэвхжээгүй", tone: "crit" as const, note: "Даалгавар, гүйцэтгэл алга" };

  const roleLabel = ROLE_LABELS[evaluation.roleKey] || evaluation.roleKey || "Тодорхойгүй";

  const kpis: Array<{ n: string; l: string; tone?: "good" | "warn" | "crit" }> = [
    { n: `${evaluation.activeTasks}`, l: "Идэвхтэй даалгавар" },
    { n: `${evaluation.completedTasks}`, l: "Гүйцэтгэсэн", tone: evaluation.completedTasks ? "good" : "warn" },
    { n: `${completionPercent}%`, l: "Гүйцэтгэлийн хувь", tone: completionPercent >= 60 ? "good" : completionPercent > 0 ? "warn" : "crit" },
    { n: `${missingDocs}`, l: "Дутуу баримт", tone: missingDocs === 0 ? "good" : "crit" },
    { n: evaluation.lastLoginDate ? evaluation.lastLoginDate.slice(5) : "—", l: "Сүүлд нэвтэрсэн", tone: evaluation.lastLoginDate ? "good" : "warn" },
  ];

  const recommendations: Array<{ tone: "p1" | "p2" | "p3"; icon: string; text: ReactNode }> = [];
  if (!hasDocs) recommendations.push({ tone: "p1", icon: "!", text: <><b>{missingDocs} бичиг баримт</b> дутуу — HR хэсэгт нэн даруй бүрдүүлэх.</> });
  if (!hasFinancial) recommendations.push({ tone: "p1", icon: "!", text: <><b>Цалин, банк, ТТД, НД</b> мэдээлэл хоосон — санхүүгийн бүртгэл дутуу.</> });
  if (evaluation.activeTasks > 0 && completionPercent === 0)
    recommendations.push({ tone: "p2", icon: "▲", text: <><b>{evaluation.activeTasks} даалгавар</b> хийгдэж эхлээгүй — эхлүүлж, тайлан оруулах шаардлагатай.</> });
  if (!hasGrade) recommendations.push({ tone: "p2", icon: "▲", text: <>Зэрэг дэв бүртгээгүй — тодорхойлж оруулах.</> });
  if (evaluation.hasLogin) recommendations.push({ tone: "p3", icon: "✓", text: <><b>Нэвтрэлт идэвхтэй</b> — систем зөв ажиллаж байна.</> });
  if (!recommendations.length) recommendations.push({ tone: "p3", icon: "✓", text: <>Мэдээлэл бүрэн, анхаарах зүйл алга.</> });

  return (
    <section className={styles.erpCard}>
      <div className={styles.erpIdRow}>
        <span className={styles.erpAvatar}>
          {employee.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={employee.photoUrl} alt="" className={styles.erpAvatarImg} />
          ) : (
            scorecardInitials(employee.name)
          )}
        </span>
        <div className={styles.erpIdMain}>
          <strong>{employee.name}</strong>
          <small>{employee.jobTitle || "Албан тушаал бүртгээгүй"} · {employee.departmentName || "Хэлтэс бүртгээгүй"}</small>
          <div className={styles.erpIdMeta}>
            {employee.employeeCode ? <span>Код <b>{employee.employeeCode}</b></span> : null}
            {employee.registerNumber ? <span>Регистр <b>{employee.registerNumber}</b></span> : null}
            {age != null ? <span>Нас <b>{age}</b></span> : null}
          </div>
        </div>
        <div className={styles.erpStatusWrap}>
          <span className={`${styles.erpStatusPill} ${styles[`erpTone_${overall.tone}`]}`}>
            <span className={styles.erpStatusDot} />
            {overall.label}
          </span>
          <small>{overall.note}</small>
        </div>
      </div>

      <div className={styles.erpKpiGrid}>
        {kpis.map((kpi) => (
          <div key={kpi.l} className={`${styles.erpKpi} ${kpi.tone ? styles[`erpKpi_${kpi.tone}`] : ""}`}>
            <div className={styles.erpKpiN}>{kpi.n}</div>
            <div className={styles.erpKpiL}>{kpi.l}</div>
          </div>
        ))}
      </div>

      <div className={styles.erpCols}>
        <div className={styles.erpPanel}>
          <h3>
            Профайл бүрдэлт
            <span className={`${styles.erpTag} ${profileScore >= 90 ? styles.erpTagGood : profileScore >= 60 ? styles.erpTagWarn : styles.erpTagCrit}`}>{profileScore}%</span>
          </h3>
          <ErpCheck ok label="Хувийн мэдээлэл (нэр, регистр, төрсөн)" value="Бүрэн" />
          <ErpCheck ok={hasContact} label="Холбоо барих (утас, имэйл)" value={hasContact ? "Бүрэн" : "Дутуу"} />
          <ErpCheck ok={hasDocs} label="Бичиг баримт" value={hasDocs ? "Бүрэн" : `${missingDocs} дутуу`} />
          <ErpCheck ok={hasFinancial} label="Цалин / банк / ТТД / НД" value={hasFinancial ? "Оруулсан" : "Хоосон"} />
          <ErpCheck na label="Зэрэг дэв" value={hasGrade ? employee.gradeRank : "Бүртгээгүй"} />
        </div>

        <div className={styles.erpPanel}>
          <h3>
            Систем хандалт
            <span className={`${styles.erpTag} ${evaluation.hasLogin ? styles.erpTagGood : styles.erpTagCrit}`}>{evaluation.hasLogin ? "Идэвхтэй" : "Эрхгүй"}</span>
          </h3>
          <ErpInfo label="Нэвтрэх нэр" value={evaluation.login || "—"} />
          <ErpInfo label="Эрхийн түвшин" value={roleLabel} />
          <ErpInfo label="Дотоод хэрэглэгч" value={evaluation.isInternal ? "Тийм" : "—"} />
          <ErpInfo label="Сүүлд нэвтэрсэн" value={evaluation.lastLoginDate || "Нэвтрээгүй"} />
          <ErpInfo label="Даалгаврын нийт тоо" value={`${evaluation.totalTasks}`} />
        </div>
      </div>

      <div className={styles.erpCols}>
        <div className={styles.erpPanel}>
          <h3>
            Даалгавар &amp; гүйцэтгэл
            <span className={`${styles.erpTag} ${styles.erpTagWarn}`}>{evaluation.activeTasks} нээлттэй</span>
          </h3>
          <ErpInfo label="Нийт даалгавар" value={`${evaluation.totalTasks}`} />
          <ErpInfo label="Гүйцэтгэсэн" value={`${evaluation.completedTasks}`} />
          <ErpInfo label="Идэвхтэй" value={`${evaluation.activeTasks}`} />
          <div className={styles.erpBar}>
            <div className={styles.erpBarFill} style={{ width: `${Math.max(3, completionPercent)}%` }} />
          </div>
          <small className={styles.erpBarLabel}>Гүйцэтгэлийн хувь: <b>{completionPercent}%</b></small>
        </div>

        <div className={styles.erpPanel}>
          <h3>Дүгнэлт &amp; зөвлөмж</h3>
          {recommendations.map((rec, index) => (
            <div key={index} className={`${styles.erpRec} ${styles[`erpRec_${rec.tone}`]}`}>
              <span className={styles.erpRecIcon}>{rec.icon}</span>
              <span className={styles.erpRecText}>{rec.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ErpCheck({ ok, na, label, value }: { ok?: boolean; na?: boolean; label: string; value: string }) {
  const mark = na ? styles.erpMarkNa : ok ? styles.erpMarkOk : styles.erpMarkNo;
  return (
    <div className={styles.erpRow}>
      <span className={`${styles.erpMark} ${mark}`}>{na ? "–" : ok ? "✓" : "✕"}</span>
      <span className={styles.erpRowK}>{label}</span>
      <span className={styles.erpRowV} style={!ok && !na ? { color: "#dc2626" } : undefined}>{value}</span>
    </div>
  );
}

function ErpInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.erpRow}>
      <span className={styles.erpRowK}>{label}</span>
      <span className={styles.erpRowV}>{value}</span>
    </div>
  );
}
