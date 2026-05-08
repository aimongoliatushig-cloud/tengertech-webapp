"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./project-tracker.module.css";

type TestAction = {
  id: string;
  label: string;
};

type TestRole = {
  id: string;
  role: string;
  goal: string;
  actions: TestAction[];
};

type TestWorkflow = {
  id: string;
  title: string;
  department: string;
  roles: TestRole[];
};

const STORAGE_KEY = "municipal-project-tracker-manual-tests-v1";

const WORKFLOWS: TestWorkflow[] = [
  {
    id: "work-task-report",
    title: "Ажил / Даалгавар / Тайлан",
    department: "Бүх үндсэн хэлтэс",
    roles: [
      {
        id: "manager",
        role: "Хэлтсийн дарга / Менежер",
        goal: "Ажил үүсгэж, даалгавар оноож, явцыг хянах",
        actions: [
          { id: "create-project", label: "Шинэ ажил үүсгэх" },
          { id: "create-task", label: "Ажил дотор даалгавар үүсгэх" },
          { id: "assign-worker", label: "Ажилтан/мастер оноох" },
          { id: "review-report", label: "Ирсэн тайланг нээж шалгах" },
          { id: "approve-report", label: "Тайлан батлах" },
          { id: "return-report", label: "Тайлан буцааж, шалтгаан харагдаж байгаа эсэхийг шалгах" },
        ],
      },
      {
        id: "worker",
        role: "Ажилтан / Талбарын хэрэглэгч",
        goal: "Өөрт оноогдсон ажлыг mobile/PWA дээр гүйцэтгэх",
        actions: [
          { id: "see-own-tasks", label: "Зөвхөн өөрийн өнөөдрийн ажлыг харах" },
          { id: "open-task", label: "Даалгаврын дэлгэрэнгүй нээх" },
          { id: "submit-note", label: "Тайлбар бичиж илгээх" },
          { id: "submit-quantity", label: "Гүйцэтгэсэн тоо хэмжээ оруулах" },
          { id: "upload-photo", label: "Зураг хавсаргах" },
          { id: "resubmit-returned", label: "Буцаагдсан ажлыг засаж дахин илгээх" },
        ],
      },
      {
        id: "report-export",
        role: "Тайлан хариуцсан хэрэглэгч",
        goal: "Ажлын тайлан, Word/PDF/Excel export шалгах",
        actions: [
          { id: "open-reports", label: "Тайлангийн хуудсыг нээх" },
          { id: "filter-department", label: "Хэлтэс/нэгжээр шүүх" },
          { id: "export-word", label: "Word тайлан export хийх" },
          { id: "export-pdf", label: "PDF тайлан export хийх" },
          { id: "export-excel", label: "Excel/CSV export хийх" },
        ],
      },
    ],
  },
  {
    id: "procurement",
    title: "Худалдан авалт",
    department: "Санхүү болон үндсэн хэлтэс",
    roles: [
      {
        id: "department-head",
        role: "Хэлтсийн дарга",
        goal: "Даалгавартай холбоотой худалдан авалтын хүсэлт үүсгэх",
        actions: [
          { id: "create-request", label: "Даалгавраас худалдан авалтын хүсэлт үүсгэх" },
          { id: "add-items", label: "Бараа/үйлчилгээний мөр нэмэх" },
          { id: "attach-spec", label: "Зураг/шаардлага хавсаргах" },
          { id: "submit-request", label: "Хүсэлт илгээх" },
          { id: "see-own-department", label: "Өөрийн хэлтсийн хүсэлтүүд харагдаж байгаа эсэх" },
        ],
      },
      {
        id: "purchase-manager",
        role: "Худалдан авалтын ажилтан / Нярав",
        goal: "Үнийн санал, нийлүүлэгч, хүлээн авалт бүртгэх",
        actions: [
          { id: "see-assigned", label: "Өөрт оноогдсон худалдан авалтын ажлыг харах" },
          { id: "add-supplier-quotes", label: "3 үнийн санал бүртгэх" },
          { id: "upload-quote", label: "Үнийн саналын файл хавсаргах" },
          { id: "receive-goods", label: "Бараа/сэлбэг хүлээн авалт бүртгэх" },
          { id: "parts-usage", label: "Сэлбэг/материал ашиглалтыг засварын ажилтай холбож шалгах" },
        ],
      },
      {
        id: "finance",
        role: "Санхүү",
        goal: "V1-д төлбөр бүртгэл болон тайлан шалгах",
        actions: [
          { id: "see-finance-queue", label: "Төлбөр хүлээж буй хүсэлт харах" },
          { id: "select-supplier-simple", label: "1,000,000 MNT-ээс доош урсгалд нийлүүлэгч сонгох" },
          { id: "record-payment", label: "Төлбөрийн дүн, огноо, баримт бүртгэх" },
          { id: "partial-payment", label: "Дутуу төлбөр бүртгэхэд зөв badge/мэдээлэл харагдах" },
          { id: "payment-report", label: "Төлбөрийн тайлан дээр харагдах" },
        ],
      },
      {
        id: "high-value",
        role: "Захиргаа / CEO / Хууль",
        goal: "Өндөр дүнгийн худалдан авалтын нэмэлт шат шалгах",
        actions: [
          { id: "admin-review", label: "Өндөр дүнгийн хүсэлт захиргаанд очих" },
          { id: "ceo-decision", label: "CEO сонгосон нийлүүлэгч бүртгэх" },
          { id: "ceo-order", label: "CEO тушаал/шийдвэрийн файл хавсаргах" },
          { id: "contract-draft", label: "Гэрээний draft хавсаргах" },
          { id: "finance-after-contract", label: "Draft гэрээ болон CEO шийдвэрийн дараа санхүү төлбөр бүртгэх" },
        ],
      },
    ],
  },
  {
    id: "fleet-garbage",
    title: "Авто бааз, хог тээвэрлэлт",
    department: "Авто бааз, хог тээвэрлэлт",
    roles: [
      {
        id: "auto-manager",
        role: "Хэлтсийн дарга / Авто баазын менежер",
        goal: "Техник, жолооч, маршрут, dashboard шалгах",
        actions: [
          { id: "vehicle-registry", label: "Машин техникийн бүртгэл харах/үүсгэх" },
          { id: "assign-driver", label: "Жолооч оноох, өмнөх түүх хадгалагдах эсэх" },
          { id: "insurance-inspection", label: "Даатгал/улсын үзлэгийн мэдээлэл харах" },
          { id: "weekly-route", label: "7 хоногийн маршрут төлөвлөх" },
          { id: "generate-today", label: "Өнөөдрийн маршрут үүсгэх" },
          { id: "dashboard", label: "Хог тээврийн dashboard явц харуулах" },
        ],
      },
      {
        id: "driver-loader",
        role: "Жолооч / Ачигч",
        goal: "Өнөөдрийн маршрутыг цэг бүрээр гүйцэтгэх",
        actions: [
          { id: "see-today-route", label: "Өөрийн өнөөдрийн маршрут харах" },
          { id: "arrive-point", label: "Цэг дээр очсон гэж тэмдэглэх" },
          { id: "before-photo", label: "Өмнөх зураг оруулах" },
          { id: "after-photo", label: "Дараах зураг оруулах" },
          { id: "complete-point", label: "Цэг дуусгах" },
          { id: "skip-reason", label: "Цэг алгасахад шалтгаан шаардах" },
        ],
      },
      {
        id: "inspector",
        role: "Хяналтын ажилтан",
        goal: "Маршрут, зураг, зөрчил, хяналтын тайлан шалгах",
        actions: [
          { id: "see-all-routes", label: "Маршрутын гүйцэтгэл харах" },
          { id: "inspect-proof", label: "Өмнөх/дараах зураг шалгах" },
          { id: "create-inspection", label: "Хяналтын тайлан үүсгэх" },
          { id: "issue-report", label: "Асуудал/зөрчил бүртгэх" },
        ],
      },
      {
        id: "garbage-import",
        role: "Менежер / Санхүүгийн хянагч",
        goal: "Жин/шатахууны импорт, тайлан шалгах",
        actions: [
          { id: "weight-report", label: "Өдрийн хог ачалтын жингийн тайлан харах" },
          { id: "fuel-report", label: "Шатахууны мэдээлэл харах" },
          { id: "failed-import", label: "Амжилтгүй таталтын алдаа харагдах" },
          { id: "env-only", label: "Нууц тохиргоо `.env`-ээс уншиж байгаа эсэхийг шалгах" },
        ],
      },
    ],
  },
  {
    id: "fleet-repair",
    title: "Засвар үйлчилгээ",
    department: "Авто бааз, хог тээвэрлэлт",
    roles: [
      {
        id: "repair-requester",
        role: "Жолооч / Хэлтсийн дарга",
        goal: "Засварын хүсэлт үүсгэх",
        actions: [
          { id: "create-repair", label: "Засварын хүсэлт үүсгэх" },
          { id: "attach-before", label: "Эвдрэлийн зураг/баримт хавсаргах" },
          { id: "track-status", label: "Засварын төлөв харах" },
        ],
      },
      {
        id: "mechanic",
        role: "Механик / Засварчин",
        goal: "Оношлох, засах, сэлбэг хэрэгцээ бүртгэх",
        actions: [
          { id: "diagnose", label: "Оношилгоо оруулах" },
          { id: "request-parts", label: "Сэлбэг хэрэгтэй гэж тэмдэглэх" },
          { id: "start-repair", label: "Засвар эхлүүлэх" },
          { id: "complete-repair", label: "Засвар дуусгах" },
          { id: "repair-history", label: "Техникийн засварын түүх дээр хадгалагдах" },
        ],
      },
      {
        id: "repair-manager",
        role: "Засварын ахлагч / Менежер",
        goal: "Засварын урсгал, зөвшөөрөл, машин буцаалт шалгах",
        actions: [
          { id: "approve-repair", label: "Засвар батлах/зөвшөөрөх" },
          { id: "procurement-link", label: "Сэлбэгийн худалдан авалттай холбоос шалгах" },
          { id: "return-vehicle", label: "Техникийг ашиглалтад буцаах" },
          { id: "repair-dashboard", label: "Засварын dashboard дээр харагдах" },
        ],
      },
    ],
  },
  {
    id: "green-improvement",
    title: "Ногоон байгууламж, тохижилт үйлчилгээ",
    department: "Ногоон байгууламж, тохижилт үйлчилгээ",
    roles: [
      {
        id: "green-manager",
        role: "Инженер / Мастер / Менежер",
        goal: "Хэлтсийн ажил үүсгэж, ажилтан оноох",
        actions: [
          { id: "create-green-work", label: "Ногоон байгууламжийн ажил үүсгэх" },
          { id: "create-improvement-work", label: "Тохижилт үйлчилгээний ажил үүсгэх" },
          { id: "assign-team", label: "Ажилтан/баг оноох" },
          { id: "review-green-report", label: "Ирсэн тайлан шалгах" },
          { id: "department-dashboard", label: "Хэлтсийн dashboard/report дээр харагдах" },
        ],
      },
      {
        id: "green-worker",
        role: "Ажилтан",
        goal: "Өөрт оноогдсон ажлыг тайлагнах",
        actions: [
          { id: "see-own-work", label: "Өөрийн ажил харах" },
          { id: "submit-progress", label: "Явц/тоо хэмжээ оруулах" },
          { id: "upload-photo", label: "Зураг хавсаргах" },
          { id: "submit-report", label: "Тайлан илгээх" },
          { id: "returned-fix", label: "Буцаагдсан тайлан засах" },
        ],
      },
    ],
  },
  {
    id: "road-cleaning",
    title: "Зам цэвэрлэгээ",
    department: "Зам цэвэрлэгээ",
    roles: [
      {
        id: "cleaning-master",
        role: "Мастер",
        goal: "Цэвэрлэх талбай үүсгэж, өнөөдрийн ажил хянах",
        actions: [
          { id: "create-area", label: "Цэвэрлэх талбай бүртгэх" },
          { id: "assign-employee", label: "Ажилтан оноох" },
          { id: "today-work-created", label: "Өнөөдрийн ажил автоматаар үүссэн эсэх" },
          { id: "no-duplicate", label: "Давхар өнөөдрийн ажил үүсэхгүй эсэх" },
          { id: "approve-cleaning", label: "Гүйцэтгэсэн цэвэрлэгээ батлах" },
          { id: "return-cleaning", label: "Шалтгаантай буцаах" },
        ],
      },
      {
        id: "cleaning-worker",
        role: "Цэвэрлэгээний ажилтан",
        goal: "Mobile/PWA-аар цэвэрлэгээ гүйцэтгэх",
        actions: [
          { id: "see-cleaning-work", label: "Өөрийн өнөөдрийн цэвэрлэгээний ажил харах" },
          { id: "start-cleaning", label: "Ажил эхлүүлэх" },
          { id: "check-lines", label: "Default checklist мөрүүдийг тэмдэглэх" },
          { id: "before-after", label: "Өмнөх/дараах зураг оруулах" },
          { id: "submit-cleaning", label: "Ажил дуусгаж илгээх" },
          { id: "fix-returned", label: "Буцаагдсан ажлыг засаж дахин илгээх" },
        ],
      },
    ],
  },
  {
    id: "hr",
    title: "Хүний нөөц",
    department: "Хүний нөөц",
    roles: [
      {
        id: "hr-manager",
        role: "HR менежер",
        goal: "Ажилтан, HR бүртгэл, тайлан удирдах",
        actions: [
          { id: "create-employee", label: "Шинэ ажилтан бүртгэх" },
          { id: "upload-documents", label: "Гэрээ/тушаал/хавсралт оруулах" },
          { id: "leave-sick-trip", label: "Чөлөө/өвчтэй/томилолт бүртгэх" },
          { id: "discipline", label: "Сахилгын бүртгэл үүсгэх" },
          { id: "transfer", label: "Шилжилт хөдөлгөөн бүртгэх" },
          { id: "offboarding", label: "Ажлаас гаралт, тойрох хуудас, архив шалгах" },
          { id: "hr-report", label: "HR тайлан гаргах" },
        ],
      },
      {
        id: "employee",
        role: "Ажилтан",
        goal: "Өөрийн HR мэдээлэл болон тайлбар оруулах эрх шалгах",
        actions: [
          { id: "own-profile", label: "Өөрийн profile хязгаарлагдсан байдлаар харах" },
          { id: "own-timeoff", label: "Өөрийн чөлөө/өвчтэй/томилолт харах" },
          { id: "discipline-explanation", label: "Сахилгын тайлбар оруулах" },
        ],
      },
      {
        id: "hr-scope-check",
        role: "HR scope шалгалт",
        goal: "Ирц HR scope-д ороогүй эсэх",
        actions: [
          { id: "no-attendance-menu", label: "HR цэсэнд ирц/хоцролт/таслалт байхгүй" },
          { id: "no-attendance-kpi", label: "HR dashboard дээр attendance KPI байхгүй" },
          { id: "no-attendance-report", label: "HR report дээр attendance report байхгүй" },
        ],
      },
    ],
  },
  {
    id: "dashboards-notifications",
    title: "Самбар / Тайлан / Мэдэгдэл",
    department: "Удирдлага ба бүх хэлтэс",
    roles: [
      {
        id: "executive",
        role: "Захирал / Ерөнхий менежер",
        goal: "Нэгдсэн самбар, хэлтсийн явц, эрсдэл харах",
        actions: [
          { id: "general-dashboard", label: "Ерөнхий dashboard нээх" },
          { id: "department-progress", label: "3 үндсэн хэлтсийн явц харах" },
          { id: "overdue-review", label: "Хугацаа хэтэрсэн/хяналт хүлээсэн ажлыг харах" },
          { id: "fleet-summary", label: "Техник, засвар, хог тээврийн summary харах" },
          { id: "hr-summary", label: "HR summary харах" },
        ],
      },
      {
        id: "notifications",
        role: "Бүх холбогдох дүр",
        goal: "Мэдэгдэл, review queue, буцаалт шалгах",
        actions: [
          { id: "assigned-notification", label: "Шинэ ажил оноогдоход мэдэгдэл ирэх" },
          { id: "returned-notification", label: "Тайлан буцаагдахад мэдэгдэл ирэх" },
          { id: "procurement-stage-notification", label: "Худалдан авалтын шат солигдоход мэдэгдэл/даалгавар харагдах" },
          { id: "repair-notification", label: "Засварын төлөв солигдоход холбогдох дүрд мэдэгдэх" },
          { id: "hr-notification", label: "HR event дээр мэдэгдэл/хяналт харагдах" },
        ],
      },
      {
        id: "tracker",
        role: "Тест хариуцсан хэрэглэгч",
        goal: "Энэ checklist-ийг ашиглаж бүх role workflow шалгах",
        actions: [
          { id: "open-tracker", label: "Бэлэн байдлын tracker нээх" },
          { id: "manual-tab", label: "Гараар тестлэх tab нээх" },
          { id: "check-persist", label: "Checkbox тэмдэглээд refresh хийхэд хадгалагдах" },
          { id: "module-progress", label: "Модуль бүрийн гар тестийн хувь зөв өөрчлөгдөх" },
        ],
      },
    ],
  },
];

function getActionKey(workflowId: string, roleId: string, actionId: string) {
  return `${workflowId}:${roleId}:${actionId}`;
}

function countActions(workflows: TestWorkflow[]) {
  return workflows.reduce(
    (total, workflow) =>
      total + workflow.roles.reduce((roleTotal, role) => roleTotal + role.actions.length, 0),
    0,
  );
}

function countChecked(workflows: TestWorkflow[], checked: Record<string, boolean>) {
  return workflows.reduce(
    (total, workflow) =>
      total +
      workflow.roles.reduce(
        (roleTotal, role) =>
          roleTotal +
          role.actions.filter((action) => checked[getActionKey(workflow.id, role.id, action.id)]).length,
        0,
      ),
    0,
  );
}

function percent(checked: number, total: number) {
  return total ? Math.round((checked / total) * 100) : 0;
}

export function ManualTestChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setChecked(JSON.parse(raw) as Record<string, boolean>);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }, [checked, loaded]);

  const totalActions = useMemo(() => countActions(WORKFLOWS), []);
  const checkedActions = countChecked(WORKFLOWS, checked);
  const totalPercent = percent(checkedActions, totalActions);

  function toggle(key: string) {
    setChecked((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function clearAll() {
    if (window.confirm("Бүх гараар тэмдэглэсэн тестийг арилгах уу?")) {
      setChecked({});
    }
  }

  return (
    <section className={styles.manualSection}>
      <div className={styles.manualHeader}>
        <div>
          <span className={styles.kicker}>Гараар тестлэх checklist</span>
          <h2>Дүр ба workflow тус бүрийн тест</h2>
          <p>
            Энэ хэсэг нь таны гараар хийсэн шалгалтыг хадгална. Checkbox тэмдэглэвэл browser-ийн
            local storage-д хадгалагдаж, refresh хийсний дараа хэвээр үлдэнэ.
          </p>
        </div>
        <div className={styles.manualProgressCard}>
          <span>Нийт гараар шалгасан</span>
          <strong>{totalPercent}%</strong>
          <small>
            {checkedActions} / {totalActions} үйлдэл
          </small>
          <button type="button" onClick={clearAll}>
            Бүгдийг арилгах
          </button>
        </div>
      </div>

      <div className={styles.manualWorkflowGrid}>
        {WORKFLOWS.map((workflow) => {
          const workflowTotal = countActions([workflow]);
          const workflowChecked = countChecked([workflow], checked);
          const workflowPercent = percent(workflowChecked, workflowTotal);

          return (
            <article key={workflow.id} className={styles.manualWorkflowCard}>
              <div className={styles.manualWorkflowTop}>
                <div>
                  <span className={styles.kicker}>{workflow.department}</span>
                  <h3>{workflow.title}</h3>
                </div>
                <div className={styles.manualPercent}>
                  <strong>{workflowPercent}%</strong>
                  <span>
                    {workflowChecked}/{workflowTotal}
                  </span>
                </div>
              </div>
              <div className={styles.track} aria-hidden>
                <span style={{ width: `${Math.max(workflowPercent, 3)}%` }} />
              </div>

              <div className={styles.manualRoleList}>
                {workflow.roles.map((role) => {
                  const roleChecked = role.actions.filter(
                    (action) => checked[getActionKey(workflow.id, role.id, action.id)],
                  ).length;
                  const rolePercent = percent(roleChecked, role.actions.length);

                  return (
                    <section key={role.id} className={styles.manualRoleCard}>
                      <div className={styles.manualRoleHeader}>
                        <div>
                          <h4>{role.role}</h4>
                          <p>{role.goal}</p>
                        </div>
                        <strong>{rolePercent}%</strong>
                      </div>
                      <div className={styles.manualActionList}>
                        {role.actions.map((action) => {
                          const key = getActionKey(workflow.id, role.id, action.id);
                          const isChecked = Boolean(checked[key]);

                          return (
                            <label key={key} className={styles.manualAction}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggle(key)}
                              />
                              <span>{action.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
