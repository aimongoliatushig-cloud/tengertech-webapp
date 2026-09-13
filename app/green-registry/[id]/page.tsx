import Link from "next/link";
import { notFound } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getSessionRoleLabel, hasCapability, requireSession } from "@/lib/auth";
import { loadGreenRegistry } from "@/lib/green-registry";
import { updateGreenLocationAction } from "../actions";
import { GreenLocationPicker } from "../green-map";
import styles from "../green-registry.module.css";

export const dynamic = "force-dynamic";

export default async function GreenLocationEditPage({ params, searchParams }:{ params:Promise<{id:string}>; searchParams?:Promise<{error?:string}> }) {
  const session = await requireSession();
  const query: {error?:string} = searchParams ? await searchParams : {};
  const [{id}, data, departmentName] = await Promise.all([params, loadGreenRegistry(session), loadSessionDepartmentName(session)]);
  const location = data.locations.find((item) => item.id === Number(id));
  if (!location) notFound();
  const itemCount = data.assets
    .filter((asset) => asset.locationId === location.id && asset.assetType === location.assetGroup && asset.unit === "ш")
    .reduce((sum, asset) => sum + asset.quantity, 0);
  return <main className={shellStyles.shell}><div className={shellStyles.contentWithMenu}>
    <aside className={shellStyles.menuColumn}><AppMenu active="green-registry" canCreateProject={hasCapability(session,"create_projects")} canCreateTasks={hasCapability(session,"create_tasks")} canWriteReports={hasCapability(session,"write_workspace_reports")} userName={session.name} userRole={session.role} roleLabel={getSessionRoleLabel(session)} groupFlags={session.groupFlags} departmentScopeName={departmentName}/></aside>
    <div className={shellStyles.pageContent}><WorkspaceHeader title="Байршлын бүртгэл засах" subtitle={location.name} userName={session.name} roleLabel={getSessionRoleLabel(session)}/><div className={styles.page}>
      <Link href="/green-registry" className={styles.backLink}>← Мэдээллийн сан руу буцах</Link>
      {query.error?<div className={`${styles.message} ${styles.error}`}>{query.error}</div>:null}
      <form action={updateGreenLocationAction} className={styles.panel}><input type="hidden" name="id" value={location.id}/><div className={styles.formGrid}>
        <label className={styles.field}><span>Байршлын нэр *</span><input name="name" required defaultValue={location.name}/></label><label className={styles.field}><span>Тоо ширхэг</span><input name="itemCount" type="number" min="0" step="1" defaultValue={itemCount || ""}/></label><label className={styles.field}><span>Код</span><input name="code" defaultValue={location.code}/></label>
        <label className={styles.field}><span>Төрөл</span><select name="locationType" defaultValue={location.locationType}><option value="park">Цэцэрлэгт хүрээлэн</option><option value="street">Зам дагуух ногоон зурвас</option><option value="square">Талбай</option><option value="yard">Байгууллагын орчин</option><option value="median">Тусгаарлах зурвас</option><option value="other">Бусад</option></select></label><label className={styles.field}><span>Дүүрэг</span><input name="district" defaultValue={location.district}/></label>
        <label className={styles.field}><span>Дэд бүлэг</span><select name="assetGroup" defaultValue={location.assetGroup}><option value="grass">Зүлэг</option><option value="tree">Мод</option><option value="flower">Цэцэг</option><option value="bush">Бут сөөг</option><option value="other">Бусад</option></select></label>
        <label className={styles.field}><span>Хороо</span><input name="khoroo" defaultValue={location.khoroo}/></label><label className={styles.field}><span>Талбай /м²/</span><input name="areaSize" type="number" min="0" step="0.01" defaultValue={location.areaSize}/></label>
        <label className={`${styles.field} ${styles.wide}`}><span>Хариуцсан ажилтан</span><select name="responsibleEmployeeId" defaultValue={location.responsibleEmployeeId || ""}><option value="">Сонгохгүй</option>{data.employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className={`${styles.field} ${styles.wide}`}><span>Хаяг</span><textarea name="address" defaultValue={location.address}/></label>
        <div className={`${styles.field} ${styles.wide}`}><span>GPS байршил — өөрчлөх бол зураг дээр шинэ цэг сонгоно</span><GreenLocationPicker initialLatitude={location.latitude} initialLongitude={location.longitude}/></div>
        <button className={styles.submit}>Өөрчлөлт хадгалах</button>
      </div></form>
    </div></div>
  </div></main>;
}
