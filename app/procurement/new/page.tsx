import Link from "next/link";
import { redirect } from "next/navigation";

import { ProcurementLineEditor } from "@/app/procurement/_components/procurement-line-editor";
import { ProcurementRelationFields } from "@/app/procurement/_components/procurement-relation-fields";
import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { createProcurementRequestAction } from "@/app/procurement/actions";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessProcurementModule, requireSession } from "@/lib/auth";
import {
  createFallbackProcurementUser,
  isProcurementSetupError,
  loadProcurementMe,
  loadProcurementMeta,
  type ProcurementMeta,
  type ProcurementUser,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function createEmptyProcurementMeta(): ProcurementMeta {
  return {
    projects: [],
    tasks: [],
    vehicles: [],
    departments: [],
    storekeepers: [],
    suppliers: [],
    uoms: [],
  };
}

function getSetupWarning(loadError: unknown) {
  return isProcurementSetupError(loadError)
    ? "Худалдан авалтын backend API хараахан идэвхжээгүй байна. Хуудас туршилтын горимоор нээгдэнэ, харин хүсэлт хадгалах бол Odoo дээр procurement API/module update шаардлагатай."
    : "Худалдан авалтын backend мэдээлэл дуудагдсангүй. Хүсэлт хадгалах болон сонголтын өгөгдөл Odoo холболтоос хамаарна.";
}

function isDepartmentHeadSession(session: Awaited<ReturnType<typeof requireSession>>) {
  return session.role === "project_manager" || Boolean(session.groupFlags?.municipalDepartmentHead);
}

function isExecutiveProcurementUser(procurementUser: ProcurementUser) {
  return procurementUser.flags.admin || procurementUser.flags.director || procurementUser.flags.general_manager;
}

function normalizeName(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase("mn-MN");
}

export const dynamic = "force-dynamic";

export default async function NewProcurementPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (!canAccessProcurementModule(session)) {
    redirect("/");
  }

  const params = (await searchParams) || {};
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const selectedTaskId = getValue(params.task_id);
  const selectedProjectId = getValue(params.project_id);
  const selectedVehicleId = getValue(params.vehicle_id);
  const relationType = selectedVehicleId ? "vehicle" : "project";
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [procurementUser, meta, departmentScopeName, setupWarning] = await Promise.all([
    loadProcurementMe(connectionOverrides).catch(() => createFallbackProcurementUser(session)),
    loadProcurementMeta(connectionOverrides).catch(() => createEmptyProcurementMeta()),
    loadSessionDepartmentName(session),
    loadProcurementMe(connectionOverrides)
      .then(() => "")
      .catch((loadError) => getSetupWarning(loadError)),
  ]);
  const isDepartmentHeadView =
    isDepartmentHeadSession(session) && !isExecutiveProcurementUser(procurementUser);
  const scopedDepartment = departmentScopeName
    ? meta.departments.find((department) => normalizeName(department.name) === normalizeName(departmentScopeName))
    : null;
  const departmentLabel = scopedDepartment?.name || departmentScopeName || "Хэлтэс тодорхойгүй";
  const defaultStorekeeperId = meta.storekeepers[0]?.id ? String(meta.storekeepers[0].id) : "";
  const vehicleOptions = meta.vehicles;

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Шинэ худалдан авах хүсэлт"
      description="Хэлтсийн хэрэгцээг төсөлтэй эсвэл машин/засвартай холбоотойгоор тусад нь бүртгэнэ."
      activeTab="new"
    >
      {setupWarning ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{setupWarning}</section> : null}
      {notice ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{notice}</section> : null}
      {error ? <section className={`${styles.statusBanner} ${styles.errorBanner}`}>{error}</section> : null}

      {!procurementUser.flags.requester && !procurementUser.flags.admin ? (
        <section className={styles.cardSection}>
          <div className={styles.emptyState}>
            <strong>Танд шинэ худалдан авах хүсэлт үүсгэх эрх алга.</strong>
            <p>Хэлтсийн дарга эсвэл эрх бүхий хэрэглэгчээр нэвтэрнэ үү.</p>
          </div>
        </section>
      ) : (
        <form action={createProcurementRequestAction} className={styles.formLayout}>
          <div className={styles.mainStack}>
            <section className={styles.cardSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Ерөнхий мэдээлэл</h2>
                  <p>Хэлтсийн дарга зөвхөн хэрэгцээ, холбоотой объект, барааны мөрүүдийг бүртгэнэ.</p>
                </div>
              </div>
              <div className={styles.formGrid}>
                <label className={styles.fieldLabel}>
                  Гарчиг
                  <input name="title" placeholder="Жишээ: Камаз - шүүрдэх сойз" required />
                </label>

                {isDepartmentHeadView ? (
                  <>
                    <label className={styles.fieldLabel}>
                      Хэлтэс
                      <input value={departmentLabel} readOnly />
                    </label>
                    <input type="hidden" name="department_id" value={scopedDepartment?.id || ""} />
                    {defaultStorekeeperId ? (
                      <input type="hidden" name="responsible_storekeeper_user_id" value={defaultStorekeeperId} />
                    ) : null}
                  </>
                ) : (
                  <>
                    <label className={styles.fieldLabel}>
                      Хэлтэс
                      <select name="department_id" defaultValue="">
                        <option value="">Сонгох</option>
                        {meta.departments.map((department) => (
                          <option key={department.id} value={department.id}>{department.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.fieldLabel}>
                      Агуулах хариуцагч / Нярав
                      <select name="responsible_storekeeper_user_id" defaultValue="">
                        <option value="">Сонгох</option>
                        {meta.storekeepers.map((storekeeper) => (
                          <option key={storekeeper.id} value={storekeeper.id}>{storekeeper.name}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}

                <label className={styles.fieldLabel}>
                  Шаардлагатай огноо
                  <input type="date" name="required_date" />
                </label>
                <label className={`${styles.fieldLabel} ${styles.fieldSpanFull}`}>
                  Тайлбар
                  <textarea name="description" placeholder="Яагаад хэрэгтэй, хаана ашиглах, ямар нөхцөлтэйг товч бичнэ үү." />
                </label>
              </div>
            </section>

            <section className={styles.cardSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Холбоотой объект</h2>
                  <p>Нэг хүсэлт зөвхөн төсөл/даалгавартай эсвэл машин/засвартай холбоотой байна.</p>
                </div>
              </div>
              <ProcurementRelationFields
                projects={meta.projects}
                tasks={meta.tasks}
                vehicles={vehicleOptions}
                selectedProjectId={selectedProjectId}
                selectedTaskId={selectedTaskId}
                selectedVehicleId={selectedVehicleId}
                defaultType={relationType}
              />
            </section>

            <section className={styles.cardSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Барааны мөрүүд</h2>
                  <p>Нярав дараагийн шатанд нийлүүлэгчийн нэр болон нэхэмжлэхийн зургийг бүртгэнэ.</p>
                </div>
              </div>
              <ProcurementLineEditor uoms={meta.uoms} />
            </section>
          </div>

          <aside className={styles.sideStack}>
            <section className={styles.sidePanel}>
              <h3>Хэлтсийн даргын урсгал</h3>
              <div className={styles.statusGuide}>
                <div className={styles.statusGuideItem}><span><span className={styles.statusDot} /> Хүсэлт үүсгэх</span><span className={styles.badge}>Таны алхам</span></div>
                <div className={styles.statusGuideItem}><span><span className={`${styles.statusDot} ${styles.dotWarning}`} /> Нэхэмжлэх бүртгэх</span><span className={styles.badgeWarning}>Нярав</span></div>
                <div className={styles.statusGuideItem}><span><span className={`${styles.statusDot} ${styles.dotPurple}`} /> Шийдвэр, гэрээ, төлбөр</span><span className={styles.badgePurple}>Хариуцсан нэгж</span></div>
                <div className={styles.statusGuideItem}><span><span className={`${styles.statusDot} ${styles.dotBlue}`} /> Хүлээн авалт</span><span className={styles.badgeBlue}>Нярав</span></div>
              </div>
              <input type="hidden" name="procurement_type" value="goods" />
              <input type="hidden" name="urgency" value="medium" />
            </section>

            <section className={styles.formActionsCard}>
              <div className={styles.formActionsCopy}>
                <strong>Хүсэлт илгээхэд бэлэн үү?</strong>
                <span>Илгээсний дараа нярав нийлүүлэгчийн нэр, нэхэмжлэхийн зургийг бүртгэнэ.</span>
              </div>
              <div className={styles.buttonRow}>
                <Link href="/procurement" className={styles.secondaryButton}>Буцах</Link>
                <button type="submit" className={styles.primaryButton}>Илгээх</button>
              </div>
            </section>
          </aside>
        </form>
      )}
    </ProcurementShell>
  );
}
