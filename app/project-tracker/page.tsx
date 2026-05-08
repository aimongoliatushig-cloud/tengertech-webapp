import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessHr } from "@/lib/hr";
import {
  canAccessProjectTracker,
  loadProjectTrackerReport,
  type ProjectTrackerModule,
  type ProjectTrackerSignal,
  type ProjectTrackerStatus,
} from "@/lib/project-tracker";

import { ManualTestChecklist } from "./manual-test-checklist";
import styles from "./project-tracker.module.css";

type PageProps = {
  searchParams?: Promise<{
    refresh?: string | string[];
    tab?: string | string[];
  }>;
};

const STATUS_LABELS: Record<ProjectTrackerStatus, string> = {
  missing: "Дутуу",
  partial: "Хэсэгчлэн",
  mostly_done: "Ихэнх нь бэлэн",
  done: "Бэлэн",
};

const TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Project\/task/gi, "Ажил/даалгавар"],
  [/Task detail\/report/gi, "Даалгаврын дэлгэрэнгүй/тайлан"],
  [/Field mobile flow/gi, "Талбарын mobile урсгал"],
  [/Workspace report export/gi, "Ажлын тайлан экспорт"],
  [/Task Word\/PDF export/gi, "Даалгаврын Word/PDF экспорт"],
  [/Odoo task\/work model/gi, "Odoo ажил/даалгаврын model"],
  [/Progress\/status logic/gi, "Явц/төлөвийн logic"],
  [/Reports dashboard/gi, "Тайлангийн самбар"],
  [/Manager create\/review/gi, "Менежер үүсгэх/хянах"],
  [/Worker report submit/gi, "Ажилтан тайлан илгээх"],
  [/Master department scope/gi, "Мастерын хэлтсийн хүрээ"],
  [/Report approval\/return/gi, "Тайлан батлах/буцаах"],
  [/Role QA/gi, "Дүрийн шалгалт"],
  [/QA acceptance docs/gi, "Чанарын шалгалтын баримт"],
  [/Build\/lint scripts/gi, "Build/lint шалгалтын script"],
  [/Procurement UI/gi, "Худалдан авалтын дэлгэц"],
  [/Procurement server actions/gi, "Худалдан авалтын серверийн үйлдэл"],
  [/Procurement library/gi, "Худалдан авалтын logic"],
  [/Odoo procurement model/gi, "Odoo худалдан авалтын model"],
  [/Quote\/payment fields/gi, "Үнийн санал/төлбөрийн талбар"],
  [/Receiving\/parts usage/gi, "Хүлээн авалт/сэлбэг ашиглалт"],
  [/Security\/access/gi, "Эрх/хандалт"],
  [/Reports\/dashboard/gi, "Тайлан/самбар"],
  [/Department head request/gi, "Хэлтсийн даргын хүсэлт"],
  [/Purchase manager quote/gi, "Худалдан авалтын ажилтны үнийн санал"],
  [/Finance payment/gi, "Санхүүгийн төлбөр"],
  [/Storekeeper receiving/gi, "Няравын хүлээн авалт"],
  [/High-value approval/gi, "Өндөр дүнгийн баталгаа"],
  [/Auto base UI/gi, "Авто баазын дэлгэц"],
  [/Fleet repair UI/gi, "Засварын дэлгэц"],
  [/Garbage routes UI/gi, "Хог тээврийн маршрутын дэлгэц"],
  [/Garbage route APIs/gi, "Хог тээврийн маршрутын серверийн холболт"],
  [/Fleet repair APIs/gi, "Засварын серверийн холболт"],
  [/Vehicle\/repair Odoo models/gi, "Техник/засварын Odoo model"],
  [/Garbage route Odoo models/gi, "Хог тээврийн Odoo model"],
  [/Weight\/fuel import/gi, "Жин/шатахуун таталт"],
  [/Driver\/loader execution/gi, "Жолооч/ачигчийн гүйцэтгэл"],
  [/Department head route planning/gi, "Хэлтсийн даргын маршрут төлөвлөлт"],
  [/Mechanic repair workflow/gi, "Механикийн засварын урсгал"],
  [/Inspection workflow/gi, "Хяналтын урсгал"],
  [/Procurement repair link/gi, "Засвар-худалдан авалтын холбоос"],
  [/Shared project\/task UI/gi, "Нэгдсэн ажил/даалгаврын дэлгэц"],
  [/Field report UI/gi, "Талбарын тайлангийн дэлгэц"],
  [/Environment Odoo addon/gi, "Орчны үйлчилгээний Odoo нэмэлт модуль"],
  [/Green\/improvement models/gi, "Ногоон байгууламж/тохижилтын model"],
  [/Department group mapping/gi, "Хэлтсийн бүлгийн тохиргоо"],
  [/Reports coverage/gi, "Тайлангийн хамрах хүрээ"],
  [/Role access flags/gi, "Дүрийн эрхийн flag"],
  [/Manager\/master review/gi, "Менежер/мастер хяналт"],
  [/Worker\/mobile report/gi, "Ажилтан/mobile тайлан"],
  [/Department filtered reports/gi, "Хэлтсээр шүүсэн тайлан"],
  [/Task assignment/gi, "Даалгавар оноолт"],
  [/Road cleaning API/gi, "Зам цэвэрлэгээний серверийн холболт"],
  [/Cleaning area store/gi, "Цэвэрлэх талбайн хадгалалт"],
  [/Cleaning Odoo model/gi, "Цэвэрлэгээний Odoo model"],
  [/Cleaning views/gi, "Цэвэрлэгээний view"],
  [/Shared work model/gi, "Нэгдсэн ажлын model"],
  [/Mobile field flow/gi, "Mobile талбарын урсгал"],
  [/Review\/return fields/gi, "Хянах/буцаах талбар"],
  [/Master create\/review/gi, "Мастер үүсгэх/хянах"],
  [/Employee own work/gi, "Ажилтны өөрийн ажил"],
  [/Manager\/admin overview/gi, "Менежер/админы тойм"],
  [/Return reason/gi, "Буцаах шалтгаан"],
  [/HR UI/gi, "Хүний нөөцийн дэлгэц"],
  [/HR API/gi, "Хүний нөөцийн серверийн холболт"],
  [/HR addon/gi, "Хүний нөөцийн нэмэлт модуль"],
  [/Employee registry/gi, "Ажилтны бүртгэл"],
  [/Leave\/sick\/trip/gi, "Чөлөө/өвчтэй/томилолт"],
  [/Clearance\/offboarding/gi, "Тойрох хуудас/ажлаас гаралт"],
  [/HR reports/gi, "Хүний нөөцийн тайлан"],
  [/HR manager access/gi, "HR менежерийн эрх"],
  [/Employee limited own access/gi, "Ажилтны хязгаарлагдсан өөрийн эрх"],
  [/Department head HR view/gi, "Хэлтсийн даргын HR харагдац"],
  [/Director\/general manager view/gi, "Захирал/менежерийн харагдац"],
  [/No attendance in HR scope/gi, "HR scope-д ирц ороогүй"],
  [/General dashboard/gi, "Ерөнхий самбар"],
  [/Department reports/gi, "Хэлтсийн тайлан"],
  [/Procurement dashboard/gi, "Худалдан авалтын самбар"],
  [/Fleet dashboard/gi, "Авто бааз/засварын самбар"],
  [/Garbage dashboard/gi, "Хог тээврийн самбар"],
  [/HR reports\/dashboard/gi, "HR тайлан/самбар"],
  [/Push notification addon\/API/gi, "Push мэдэгдлийн нэмэлт модуль/холболт"],
  [/Completion tracker/gi, "Бэлэн байдлын tracker"],
  [/Executive dashboard access/gi, "Удирдлагын самбарын эрх"],
  [/Manager department reports/gi, "Менежерийн хэлтсийн тайлан"],
  [/HR dashboard\/report access/gi, "HR самбар/тайлангийн эрх"],
  [/Notification counts\/menu/gi, "Мэдэгдлийн тоо/цэс"],
  [/Finance\/procurement visibility/gi, "Санхүү/худалдан авалтын харагдац"],
  [/UI acceptance doc/gi, "Дэлгэцийн acceptance баримт"],
  [/Full QA runner/gi, "Бүрэн чанарын шалгалтын runner"],
  [/UI/gi, "дэлгэц"],
  [/API/gi, "серверийн холболт"],
  [/workflow/gi, "ажлын урсгал"],
  [/scope/gi, "хамрах хүрээ"],
  [/repository/gi, "кодын сан"],
];

function uiText(value: string) {
  return TEXT_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

function getParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function percentStyle(value: number) {
  return { "--percent": `${Math.max(0, Math.min(100, value)) * 3.6}deg` } as CSSProperties;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function SummaryCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className={styles.summaryCard}>
      <span>{label}</span>
      <strong>{value}%</strong>
      <div className={styles.track} aria-hidden>
        <span style={{ width: `${Math.max(value, 3)}%` }} />
      </div>
      <small className={styles.muted}>{note}</small>
    </article>
  );
}

function SignalColumn({ title, signals }: { title: string; signals: ProjectTrackerSignal[] }) {
  return (
    <article className={styles.signalColumn}>
      <h3>{title}</h3>
      <div className={styles.signalList}>
        {signals.map((signal) => {
          const ready = signal.evidence.length > 0;
          return (
            <div
              key={`${title}-${signal.label}`}
              className={`${styles.signalItem} ${ready ? styles.signalReady : styles.signalMissing}`}
            >
              <span>{ready ? "Нотолгоотой" : "Дутуу"}</span>
              <strong>{uiText(signal.label)}</strong>
              <small className={styles.muted}>
                {ready ? `${signal.evidence.length} нотолгоо` : uiText(signal.missing)}
              </small>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ModuleCard({ module }: { module: ProjectTrackerModule }) {
  const visibleEvidence = module.evidenceRefs.slice(0, 6);
  const visibleMissing = module.missingSignals.slice(0, 6);

  return (
    <article className={styles.moduleCard}>
      <div className={styles.moduleTop}>
        <div className={styles.moduleTitle}>
          <span className={styles.statusPill}>{STATUS_LABELS[module.status]}</span>
          <h2>{module.title}</h2>
          <p>{module.summary}</p>
          <small className={styles.muted}>{module.department}</small>
        </div>
        <div className={styles.percentBadge} style={percentStyle(module.overallPercent)}>
          <strong>{module.overallPercent}%</strong>
        </div>
      </div>

      <div className={styles.moduleStats}>
        <div className={styles.moduleStat}>
          <span>Функц</span>
          <strong>{module.implementationPercent}%</strong>
          <div className={styles.track} aria-hidden>
            <span style={{ width: `${Math.max(module.implementationPercent, 3)}%` }} />
          </div>
        </div>
        <div className={styles.moduleStat}>
          <span>Дүрийн үйлдэл</span>
          <strong>{module.roleActionPercent}%</strong>
          <div className={styles.track} aria-hidden>
            <span style={{ width: `${Math.max(module.roleActionPercent, 3)}%` }} />
          </div>
        </div>
        <div className={styles.moduleStat}>
          <span>Туршилт</span>
          <strong>{module.testingPercent}%</strong>
          <div className={styles.track} aria-hidden>
            <span style={{ width: `${Math.max(module.testingPercent, 3)}%` }} />
          </div>
        </div>
        <div className={styles.moduleStat}>
          <span>Нотолгоо</span>
          <strong>{module.evidenceCount}</strong>
          <small className={styles.muted}>Файл / код / doc</small>
        </div>
      </div>

      <div className={styles.signalGrid}>
        <SignalColumn title="Функцийн нотолгоо" signals={module.implementation} />
        <SignalColumn title="Дүрийн үйлдэл" signals={module.roleActions} />
        <SignalColumn title="Туршилтын workflow" signals={module.testing} />
      </div>

      {visibleMissing.length ? (
        <div>
          <span className={styles.kicker}>Дутуу нотолгоо</span>
          <ul className={styles.missingList}>
            {visibleMissing.map((item) => (
              <li key={`${module.key}-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.evidenceList}>
        {visibleEvidence.map((item) => (
          <div key={`${module.key}-${item.kind}-${item.path}-${item.reason}`} className={styles.evidenceItem}>
            <span>Нотолгооны файл</span>
            <code>{item.path}</code>
          </div>
        ))}
      </div>
    </article>
  );
}

export const dynamic = "force-dynamic";

export default async function ProjectTrackerPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (!canAccessProjectTracker(session)) {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const forceRefresh = getParam(params.refresh) === "1";
  const activeTab = getParam(params.tab) === "manual" ? "manual" : "auto";
  const [report, scopedDepartmentName, canViewHr] = await Promise.all([
    loadProjectTrackerReport({ forceRefresh }),
    loadSessionDepartmentName(session).catch(() => null),
    canAccessHr(session).catch(() => false),
  ]);

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.contentWithMenu}>
        <aside className={shellStyles.menuColumn}>
          <AppMenu
            active="project-tracker"
            canCreateProject={canCreateProject}
            canCreateTasks={canCreateTasks}
            canWriteReports={canWriteReports}
            canViewQualityCenter={canViewQualityCenter}
            canUseFieldConsole={canUseFieldConsole}
            canViewHr={canViewHr}
            canViewGeneralDashboard
            userName={session.name}
            roleLabel={getRoleLabel(session.role)}
            groupFlags={session.groupFlags}
            masterMode={isMasterRole(session.role)}
            departmentScopeName={scopedDepartmentName}
          />
        </aside>

        <div className={`${shellStyles.pageContent} ${styles.page}`}>
          <header className={styles.header}>
            <div>
              <span className={styles.kicker}>Төслийн бэлэн байдал</span>
              <h1>Municipal ERP гүйцэтгэлийн хяналт</h1>
              <p>
                Энэ самбар кодын сан дахь код, Odoo нэмэлт модуль, Next.js хуудас, эрхийн файл, шаардлагын
                баримт, чанарын шалгалтын нотолгоог автоматаар уншиж, модуль бүр үйлдвэрлэлд ашиглахад хэр бэлэн
                байгааг тооцно.
              </p>
            </div>
            <div className={styles.headerMeta}>
              <div className={styles.metaCard}>
                <span>Сүүлд scan хийсэн</span>
                <strong>{formatDate(report.generatedAt)}</strong>
                <small className={styles.muted}>{report.source}</small>
              </div>
              <Link href="/project-tracker?refresh=1" className={styles.refreshLink}>
                Дахин scan хийх
              </Link>
            </div>
          </header>

          <section className={styles.summaryGrid}>
            <SummaryCard
              label="Нийт бэлэн байдал"
              value={report.overallPercent}
              note="Функц, дүрийн үйлдэл, тестийн нийлмэл үнэлгээ"
            />
            <SummaryCard
              label="Функцийн хэрэгжилт"
              value={report.implementationPercent}
              note="Backend, frontend, API, workflow нотолгоо"
            />
            <SummaryCard
              label="Дүрийн үйлдэл"
              value={report.roleActionPercent}
              note="Менежер, мастер, ажилтан, HR, санхүү зэрэг дүрүүд"
            />
            <SummaryCard
              label="Туршилтын workflow"
              value={report.testingPercent}
              note="QA script, test target, acceptance нотолгоо"
            />
          </section>

          <nav className={styles.tabRail} aria-label="Бэлэн байдлын хяналтын хэсгүүд">
            <Link
              href="/project-tracker"
              className={`${styles.tabLink} ${activeTab === "auto" ? styles.tabLinkActive : ""}`}
              aria-current={activeTab === "auto" ? "page" : undefined}
            >
              Автомат scan
            </Link>
            <Link
              href="/project-tracker?tab=manual"
              className={`${styles.tabLink} ${activeTab === "manual" ? styles.tabLinkActive : ""}`}
              aria-current={activeTab === "manual" ? "page" : undefined}
            >
              Гараар тестлэх
            </Link>
          </nav>

          {activeTab === "manual" ? <ManualTestChecklist /> : null}

          {activeTab === "auto" ? (
            <>
          <section className={styles.warningCard}>
            <h2>100% гэж юу гэсэн үг вэ?</h2>
            <ul className={styles.warningList}>
              {report.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <div>
                <span className={styles.kicker}>Модулиуд</span>
                <h2>Хэлтэс, workflow тус бүрийн гүйцэтгэл</h2>
                <p>Гомдол санал, бүрэн accounting, бүрэн inventory нь V1 scope-оос хасагдсан.</p>
              </div>
              <Link href="/project-tracker/prd" className={styles.refreshLink}>
                Шаардлагын баримт харах
              </Link>
            </div>
            <div className={styles.moduleGrid}>
              {report.modules.map((module) => (
                <ModuleCard key={module.key} module={module} />
              ))}
            </div>
          </section>

          <section className={styles.warningCard}>
            <h2>Scope-д ороогүй зүйлс</h2>
            <ul className={styles.warningList}>
              {report.outOfScope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
