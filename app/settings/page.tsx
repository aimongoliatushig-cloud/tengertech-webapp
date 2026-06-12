import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getSessionRoleLabel,
  hasCapability,
  requireSession,
} from "@/lib/auth";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import {
  loadProcurementNotificationCount,
  loadWorkspaceNotificationCount,
} from "@/lib/workspace-notifications";

import {
  archiveAllGeneralCollectionPointsAction,
  archiveGeneralSubdistrictAction,
  createVehicleTypeAction,
  createGeneralSubdistrictAction,
  toggleVehicleTypeActiveAction,
  updateGeneralSubdistrictAction,
  updateVehicleTypeAction,
} from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SubdistrictRecord = {
  id: number;
  name: string;
  district_id?: [number, string] | false;
};

type VehicleTypeRecord = {
  id: number;
  name: string;
  code?: string | false;
  sequence?: number | false;
  is_garbage_truck?: boolean;
  active?: boolean;
  description?: string | false;
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function relationName(value: [number, string] | false | undefined) {
  return Array.isArray(value) ? value[1] : "";
}

async function loadGeneralSettingsData(connection: Partial<OdooConnection>) {
  const [subdistricts, points, vehicleTypes] = await Promise.all([
    executeOdooKw<SubdistrictRecord[]>(
      "mfo.subdistrict",
      "search_read",
      [[["active", "=", true]]],
      { fields: ["name", "district_id"], order: "district_id asc, name asc", limit: 500 },
      connection,
    ).catch(() => []),
    executeOdooKw<Array<{ id: number; subdistrict_id?: [number, string] | false }>>(
      "mfo.collection.point",
      "search_read",
      [[["active", "=", true]]],
      { fields: ["subdistrict_id"], limit: 1000 },
      connection,
    ).catch(() => []),
    executeOdooKw<VehicleTypeRecord[]>(
      "municipal.vehicle.type",
      "search_read",
      [[]],
      {
        fields: ["name", "code", "sequence", "is_garbage_truck", "active", "description"],
        order: "active desc, sequence asc, name asc",
        limit: 200,
        context: { active_test: false },
      },
      connection,
    ).catch(() => []),
  ]);

  const pointCountsBySubdistrict = new Map<number, number>();
  for (const point of points) {
    if (Array.isArray(point.subdistrict_id)) {
      const subdistrictId = point.subdistrict_id[0];
      pointCountsBySubdistrict.set(subdistrictId, (pointCountsBySubdistrict.get(subdistrictId) ?? 0) + 1);
    }
  }

  return {
    subdistricts,
    pointCount: points.length,
    pointCountsBySubdistrict,
    vehicleTypes,
  };
}

export default async function GeneralSettingsPage({ searchParams }: PageProps) {
  const session = await requireSession();

  if (session.role !== "system_admin") {
    redirect("/");
  }

  const params = (await searchParams) || {};
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const departmentScopeName = await loadSessionDepartmentName(session);
  const connection = {
    login: session.login,
    password: session.password,
  };
  const [
    { subdistricts, pointCount, pointCountsBySubdistrict, vehicleTypes },
    workspaceNotificationCount,
    procurementNotificationCount,
  ] = await Promise.all([
    loadGeneralSettingsData(connection),
    loadWorkspaceNotificationCount(session, { scopedDepartmentName: departmentScopeName }).catch(() => 0),
    loadProcurementNotificationCount(session).catch(() => 0),
  ]);
  const notificationCount = workspaceNotificationCount + procurementNotificationCount;
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const roleLabel = getSessionRoleLabel(session);

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active="settings"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              notificationCount={notificationCount}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title="Ерөнхий тохиргоо"
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={notificationCount}
              notificationNote={
                notificationCount > 0
                  ? `${notificationCount} уншаагүй мэдэгдэл`
                  : "Шинэ мэдэгдэл алга"
              }
            />

            {notice ? <div className={`${styles.message} ${styles.noticeMessage}`}>{notice}</div> : null}
            {error ? <div className={`${styles.message} ${styles.errorMessage}`}>{error}</div> : null}

            <section id="vehicle-types" className={styles.heroCard}>
              <h1>Машин техникийн төрөл</h1>
            </section>

            <section className={styles.workspaceSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>Авто баазын ангилал</span>
                  <h2>Ангилал нэмэх</h2>
                </div>
                <p>Энд нэмсэн идэвхтэй төрлүүд авто баазын “Ангиллаар харах” шүүлтүүр дээр гарна.</p>
              </div>

              <form action={createVehicleTypeAction} className={styles.formCard}>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span>Төрлийн нэр</span>
                    <input name="vehicle_type_name" placeholder="Жишээ: Усалгааны машин" required />
                  </label>

                  <label className={styles.field}>
                    <span>Код</span>
                    <input name="vehicle_type_code" placeholder="Жишээ: water_truck" />
                  </label>

                  <label className={styles.field}>
                    <span>Дараалал</span>
                    <input name="vehicle_type_sequence" type="number" min="0" step="1" defaultValue="10" />
                  </label>

                  <label className={styles.field}>
                    <span>Хогны машин эсэх</span>
                    <select name="vehicle_type_is_garbage" defaultValue="0">
                      <option value="0">Үгүй</option>
                      <option value="1">Тийм</option>
                    </select>
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Тайлбар</span>
                  <textarea name="vehicle_type_description" placeholder="Нэмэлт тайлбар" />
                </label>

                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    Төрөл нэмэх
                  </button>
                </div>
              </form>
            </section>

            <section className={styles.workspaceSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>Авто баазын ангиллууд</span>
                  <h2>Бүртгэлтэй төрлүүд</h2>
                </div>
                <p>{vehicleTypes.filter((type) => type.active !== false).length} идэвхтэй төрөл байна.</p>
              </div>

              {vehicleTypes.length ? (
                <div className={styles.projectTaskFlowList}>
                  {vehicleTypes.map((vehicleType) => (
                    <article key={vehicleType.id} className={styles.projectTaskFlowItem}>
                      <div>
                        <strong>{vehicleType.name}</strong>
                        <p className={styles.fieldHint}>
                          {(vehicleType.code ? `Код: ${vehicleType.code}` : "Кодгүй")}
                          {" · "}
                          Дараалал: {typeof vehicleType.sequence === "number" ? vehicleType.sequence : 10}
                          {" · "}
                          {vehicleType.is_garbage_truck ? "Хогны машин" : "Ердийн төрөл"}
                          {" · "}
                          {vehicleType.active === false ? "Идэвхгүй" : "Идэвхтэй"}
                        </p>
                      </div>
                      <div className={styles.buttonRow}>
                        <form action={toggleVehicleTypeActiveAction}>
                          <input type="hidden" name="vehicle_type_id" value={vehicleType.id} />
                          <input type="hidden" name="vehicle_type_active" value={vehicleType.active === false ? "1" : "0"} />
                          <button
                            type="submit"
                            className={vehicleType.active === false ? styles.secondaryButton : styles.dangerButton}
                          >
                            {vehicleType.active === false ? "Идэвхжүүлэх" : "Хасах"}
                          </button>
                        </form>
                        <details>
                          <summary className={styles.secondaryButton}>Засах</summary>
                          <form action={updateVehicleTypeAction} className={styles.field}>
                            <input type="hidden" name="vehicle_type_id" value={vehicleType.id} />
                            <label>
                              <span>Төрлийн нэр</span>
                              <input name="vehicle_type_name" defaultValue={vehicleType.name} required />
                            </label>
                            <label>
                              <span>Код</span>
                              <input name="vehicle_type_code" defaultValue={vehicleType.code || ""} />
                            </label>
                            <label>
                              <span>Дараалал</span>
                              <input
                                name="vehicle_type_sequence"
                                type="number"
                                min="0"
                                step="1"
                                defaultValue={typeof vehicleType.sequence === "number" ? vehicleType.sequence : 10}
                              />
                            </label>
                            <label>
                              <span>Хогны машин эсэх</span>
                              <select name="vehicle_type_is_garbage" defaultValue={vehicleType.is_garbage_truck ? "1" : "0"}>
                                <option value="0">Үгүй</option>
                                <option value="1">Тийм</option>
                              </select>
                            </label>
                            <label>
                              <span>Төлөв</span>
                              <select name="vehicle_type_active" defaultValue={vehicleType.active === false ? "0" : "1"}>
                                <option value="1">Идэвхтэй</option>
                                <option value="0">Идэвхгүй</option>
                              </select>
                            </label>
                            <label>
                              <span>Тайлбар</span>
                              <textarea name="vehicle_type_description" defaultValue={vehicleType.description || ""} />
                            </label>
                            <button type="submit" className={styles.primaryButton}>
                              Хадгалах
                            </button>
                          </form>
                        </details>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h2>Машин техникийн төрөл бүртгэгдээгүй байна</h2>
                  <p>Дээрх form-оор эхний төрлөө нэмнэ.</p>
                </div>
              )}
            </section>

            <section id="subdistricts" className={styles.heroCard}>
              <h1>Хорооны бүртгэл</h1>
            </section>

            <section className={styles.workspaceSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>Хороо нэмэх</span>
                  <h2>Дүүрэг, хороо</h2>
                </div>
                <p>Зөвхөн Хан-Уул дүүргийн хороо бүртгэнэ.</p>
              </div>

              <form action={createGeneralSubdistrictAction} className={styles.formCard}>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span>Дүүрэг</span>
                    <input value="Хан-Уул дүүрэг" readOnly />
                  </label>

                  <label className={styles.field}>
                    <span>Хороо</span>
                    <input name="subdistrict_name" placeholder="Жишээ: 9-р хороо" required />
                  </label>
                </div>

                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    Хороо нэмэх
                  </button>
                </div>
              </form>
            </section>

            <section className={styles.workspaceSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>Хороод</span>
                  <h2>Бүртгэлтэй хороод</h2>
                </div>
                <p>{pointCount} хогийн цэг бүртгэлтэй байна.</p>
              </div>

              <form action={archiveAllGeneralCollectionPointsAction} className={styles.buttonRow}>
                <button type="submit" className={styles.dangerButton}>
                  Бүх хогийн цэг устгах
                </button>
              </form>

              {subdistricts.length ? (
                <div className={styles.projectTaskFlowList}>
                  {subdistricts.map((subdistrict) => {
                    const pointCount = pointCountsBySubdistrict.get(subdistrict.id) ?? 0;
                    return (
                      <article key={subdistrict.id} className={styles.projectTaskFlowItem}>
                        <div>
                          <strong>
                            {[relationName(subdistrict.district_id), subdistrict.name].filter(Boolean).join(" · ")}
                          </strong>
                          <p className={styles.fieldHint}>{pointCount} хогийн цэг холбогдсон</p>
                        </div>
                        <div className={styles.buttonRow}>
                          <form action={archiveGeneralSubdistrictAction}>
                            <input type="hidden" name="subdistrict_id" value={subdistrict.id} />
                            <button
                              type="submit"
                              className={styles.dangerButton}
                              title="Энэ хорооны хогийн цэгүүдийг хамт идэвхгүй болгоно."
                            >
                              Устгах
                            </button>
                          </form>
                          <details>
                            <summary className={styles.secondaryButton}>Засах</summary>
                            <form action={updateGeneralSubdistrictAction} className={styles.field}>
                              <input type="hidden" name="subdistrict_id" value={subdistrict.id} />
                              <label>
                                <span>Дүүрэг</span>
                                <input value="Хан-Уул дүүрэг" readOnly />
                              </label>
                              <label>
                                <span>Хороо</span>
                                <input name="subdistrict_name" defaultValue={subdistrict.name} required />
                              </label>
                              <button type="submit" className={styles.primaryButton}>
                                Хадгалах
                              </button>
                            </form>
                          </details>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h2>Хороо бүртгэгдээгүй байна</h2>
                  <p>Дээрх form-оор эхний хороогоо нэмнэ.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
