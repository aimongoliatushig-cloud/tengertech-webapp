import Link from "next/link";
import { MapPin, Truck } from "lucide-react";
import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { getSessionRoleLabel, hasCapability, requireSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { loadGreenRegistry } from "@/lib/green-registry";
import { createGreenActivityAction, createGreenAssetAction, createGreenLocationAction } from "./actions";
import { GreenLocationPicker, GreenRegistryMap } from "./green-map";
import styles from "./green-registry.module.css";

export const dynamic = "force-dynamic";
const typeLabels: Record<string,string> = { tree:"Мод", bush:"Бут сөөг", grass:"Зүлэг", flower:"Цэцэг", other:"Бусад" };
const conditionLabels: Record<string,string> = { healthy:"Хэвийн", needs_care:"Арчилгаа шаардлагатай", damaged:"Гэмтсэн", dead:"Хатсан", removed:"Устгасан" };
const activityLabels: Record<string,string> = { watering:"Усалгаа", pruning:"Тайралт", care:"Арчилгаа", replanting:"Нөхөн тарилт", street_cleaning:"Цэвэрлэгээ", inspection:"Үзлэг", other:"Бусад" };
const activityStateLabels: Record<string,string> = { draft:"Ноорог", planned:"Төлөвлөсөн", assigned:"Оноогдсон", in_progress:"Хийгдэж буй", submitted:"Тайлан илгээсэн", under_review:"Хяналтад", returned:"Буцаагдсан", approved:"Баталгаажсан", done:"Дууссан", cancelled:"Цуцлагдсан" };
const greenSections = ["Чингисийн өргөн чөлөө", "Б.Шаравын гудамж", "Эрчим хүчний гудамж", "Ажилчны гудамж"];
const locationGroups = ["grass", "tree", "flower", "bush", "other"];
function normalized(value:string) { return value.toLocaleLowerCase("mn-MN").replace(/[.\s-]/g, ""); }
function locationSectionIndex(location:{name:string;code:string}) {
  if (location.code.toLocaleUpperCase().startsWith("GL-")) return 0;
  const name = normalized(location.name);
  return greenSections.findIndex((section) => name.includes(normalized(section)) || normalized(section).includes(name));
}
function isStreetTotal(location:{code:string}) {
  return /^GREEN-0[1-4]$/i.test(location.code.trim());
}
function message(value?: string|string[]) { return Array.isArray(value) ? value[0] || "" : value || ""; }
function today() { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ulaanbaatar"}).format(new Date()); }
function time(value:string) { return value ? value.slice(11,16) : "—"; }

export default async function GreenRegistryPage({searchParams}:{searchParams?:Promise<{notice?:string|string[];error?:string|string[];date?:string|string[]}>}) {
  const session = await requireSession();
  const params: {notice?: string|string[]; error?: string|string[]; date?:string|string[]} = searchParams ? await searchParams : {};
  const requestedDate=message(params.date)&&/^\d{4}-\d{2}-\d{2}$/.test(message(params.date))?message(params.date):today();
  const [data, departmentName] = await Promise.all([loadGreenRegistry(session,requestedDate), loadSessionDepartmentName(session)]);
  const vehicleGroups=Array.from(new Map(data.vehicleVisits.map(visit=>[visit.vehiclePlate,true])).keys()).map(plate=>({plate,visits:data.vehicleVisits.filter(visit=>visit.vehiclePlate===plate)}));
  const totals = data.assets.reduce((sum,row)=>{sum[row.assetType]=(sum[row.assetType]||0)+row.quantity;return sum;},{} as Record<string,number>);
  const detailedLocations = data.locations.filter((location)=>!isStreetTotal(location));
  const totalArea = greenSections.reduce((sum,_sectionName,index)=>{
    const sectionLocations=data.locations.filter((location)=>locationSectionIndex(location)===index);
    const streetTotal=sectionLocations.find(isStreetTotal);
    return sum+(streetTotal?.areaSize??sectionLocations.reduce((area,location)=>area+location.areaSize,0));
  },0);
  return <main className={shellStyles.shell}><div className={shellStyles.contentWithMenu}>
    <aside className={shellStyles.menuColumn}><AppMenu active="green-registry" canCreateProject={hasCapability(session,"create_projects")} canCreateTasks={hasCapability(session,"create_tasks")} canWriteReports={hasCapability(session,"write_workspace_reports")} userName={session.name} userRole={session.role} roleLabel={getSessionRoleLabel(session)} groupFlags={session.groupFlags} departmentScopeName={departmentName}/></aside>
    <div className={shellStyles.pageContent}><WorkspaceHeader title="Ногоон байгууламжийн мэдээллийн сан" subtitle="Байршил, талбайн хэмжээ, мод бут сөөг болон ургамлын нэгдсэн тооллого" userName={session.name} roleLabel={getSessionRoleLabel(session)}/>
      <div className={styles.page}>
        <section className={styles.stats}><article className={styles.stat}><b>{detailedLocations.length}</b><span>Байршил</span></article><article className={styles.stat}><b>{totalArea.toLocaleString("mn-MN")} м²</b><span>Нийт ногоон байгууламж</span></article><article className={styles.stat}><b>{(totals.tree||0).toLocaleString("mn-MN")}</b><span>Мод</span></article><article className={styles.stat}><b>{(totals.bush||0).toLocaleString("mn-MN")}</b><span>Бут сөөг</span></article><article className={styles.stat}><b>{(totals.grass||0).toLocaleString("mn-MN")} м²</b><span>Зүлэг</span></article></section>
        {message(params.notice)?<div className={styles.message}>{message(params.notice)}</div>:null}{message(params.error)?<div className={`${styles.message} ${styles.error}`}>{message(params.error)}</div>:null}
        <section className={styles.mapPanel}><div className={styles.tableHead}><h2>Ногоон байгууламжийн байршлын зураг</h2><span>Тэмдэглэгээ дээр дарж мэдээлэл харна</span></div><GreenRegistryMap locations={detailedLocations}/></section>
        <section className={styles.routePanel}><header className={styles.routeHeader}><div><h2>Усалгааны машины GPS маршрут</h2><p>Gaiham GPS-ийн хөдөлгөөнийг ногоон байгууламжийн 20 метрийн бүстэй автоматаар тулгав.</p></div><form method="get"><label>Огноо<input name="date" type="date" defaultValue={requestedDate}/></label><button type="submit">Харах</button></form></header><div className={styles.routeMetrics}><article><Truck/><span>Хөдөлгөөнтэй машин</span><strong>{vehicleGroups.length}</strong><small>4 усалгааны машинаас</small></article><article><MapPin/><span>Нийт очилт</span><strong>{data.vehicleVisits.length}</strong><small>{requestedDate}</small></article></div><div className={styles.routeList}>{vehicleGroups.length?vehicleGroups.map(vehicle=><details key={vehicle.plate} className={styles.routeVehicle}><summary><span className={styles.routeIcon}><Truck/></span><div><h3>{vehicle.plate}</h3><small>Усалгааны машин · Gaiham GPS</small></div><dl><div><dt>Очсон байршил</dt><dd>{vehicle.visits.length}</dd></div><div><dt>Хөдөлгөөн</dt><dd>{time(vehicle.visits.at(-1)?.enteredAt||"")}–{time(vehicle.visits[0]?.exitedAt||"")}</dd></div></dl><em>Дэлгэрэнгүй</em></summary><ol>{vehicle.visits.slice().reverse().map((visit,index)=><li key={visit.id}><span>{index+1}</span><div><strong>{visit.locationName}</strong><small>{Math.round(visit.closestMeters)} метр дотор · GPS баталгаатай</small></div><time>{time(visit.enteredAt)}–{time(visit.exitedAt)}</time></li>)}</ol></details>):<p className={styles.visitEmpty}>Энэ өдөр ногоон байгууламжийн GPS бүсэд очсон бүртгэл алга.</p>}</div></section>
        <section className={styles.sectionGrid}>
          {greenSections.map((sectionName,index)=>{
            const sectionLocations=data.locations.filter(x=>locationSectionIndex(x)===index);
            const streetTotal=sectionLocations.find(isStreetTotal);
            const locations=sectionLocations.filter(x=>!isStreetTotal(x));
            const ids=new Set(locations.map(x=>x.id));
            const assets=data.assets.filter(x=>x.locationId!==null&&ids.has(x.locationId));
            const activities=data.activities.filter(x=>x.locationId!==null&&ids.has(x.locationId));
            const area=streetTotal?.areaSize??locations.reduce((sum,x)=>sum+x.areaSize,0);
            return <details className={styles.streetSection} key={sectionName} open={index===0}><summary><span className={styles.sectionNumber}>{index+1}</span><span><b>{sectionName}</b><small>Нийт ногоон байгууламж {area.toLocaleString("mn-MN")} м² · {assets.length} ургамлын бүртгэл · {activities.length} ажил</small></span></summary>
              <div className={styles.sectionBody}>
                <div className={styles.groupList}>{locationGroups.map(group=>{
                  const groupLocations=locations.filter(x=>x.assetGroup===group);
                  const groupIds=new Set(groupLocations.map(x=>x.id));
                  const groupAssets=assets.filter(x=>x.locationId!==null&&groupIds.has(x.locationId));
                  const groupArea=groupLocations.reduce((sum,x)=>sum+x.areaSize,0);
                  return <details className={styles.assetGroup} key={group} open={group==="grass"&&groupLocations.length>0}><summary><b>{typeLabels[group]}</b><small>{groupLocations.length} байршил · {groupArea.toLocaleString("mn-MN")} м²</small></summary><div className={styles.assetGroupBody}>
                    {groupLocations.length?<div className={styles.compactList}>{groupLocations.map(x=>{
                      const itemCount=groupAssets.filter(asset=>asset.locationId===x.id&&asset.unit==="ш").reduce((sum,asset)=>sum+asset.quantity,0);
                      return <div key={x.id}><span><b>{x.code||"Кодгүй"} · {x.name}</b><small>{x.khoroo||"Хороо оруулаагүй"}{x.latitude&&x.longitude?` · GPS: ${x.latitude}, ${x.longitude}`:""}</small></span><span className={styles.locationActions}>{itemCount>0?<strong>{itemCount.toLocaleString("mn-MN")} ш</strong>:null}<strong>{x.areaSize.toLocaleString("mn-MN")} {x.areaUnit}</strong><Link href={`/green-registry/${x.id}`} className={styles.editLink}>Засах</Link></span></div>;
                    })}</div>:<p className={styles.empty}>Энэ бүлэгт байршлын бүртгэлгүй.</p>}
                    {groupAssets.length?<div className={styles.groupAssets}>{groupAssets.map(x=><div key={x.id}><span>{typeLabels[x.assetType]||x.assetType} — <b>{x.name}</b>{x.species?` / ${x.species}`:""}</span><strong>{x.quantity.toLocaleString("mn-MN")} {x.unit}</strong></div>)}</div>:null}
                  </div></details>;
                })}</div>
                <div><h3>Хийгдсэн ажлын байдал</h3>{activities.length?<div className={styles.compactList}>{activities.slice(0,20).map(x=><div key={x.id}><span><b>{x.name}</b><small>{activityLabels[x.activityType]||x.activityType} · {(x.doneDate||x.plannedDate).slice(0,10)||"Огноогүй"}</small></span><strong>{activityStateLabels[x.state]||x.state}</strong></div>)}</div>:<p className={styles.empty}>Одоогоор хийгдсэн ажлын бүртгэлгүй.</p>}</div>
              </div>
            </details>;
          })}
        </section>
        <section className={styles.forms}>
          <form action={createGreenLocationAction} className={styles.panel}><h2>Байршил нэмэх</h2><p>Хариуцдаг ногоон байгууламжийн талбайг нэг удаа бүртгэнэ.</p><div className={styles.formGrid}>
            <label className={styles.field}><span>Байршлын нэр *</span><input name="name" required/></label><label className={styles.field}><span>Тоо ширхэг</span><input name="itemCount" type="number" min="0" step="1" placeholder="Ж: 64000"/></label><label className={styles.field}><span>Код</span><input name="code"/></label>
            <label className={styles.field}><span>Төрөл</span><select name="locationType"><option value="park">Цэцэрлэгт хүрээлэн</option><option value="street">Зам дагуух ногоон зурвас</option><option value="square">Талбай</option><option value="yard">Байгууллагын орчин</option><option value="median">Тусгаарлах зурвас</option><option value="other">Бусад</option></select></label><label className={styles.field}><span>Дэд бүлэг</span><select name="assetGroup" defaultValue="grass">{locationGroups.map(group=><option key={group} value={group}>{typeLabels[group]}</option>)}</select></label><label className={styles.field}><span>Хороо</span><input name="khoroo" placeholder="Ж: 15-р хороо"/></label>
            <label className={styles.field}><span>Талбай /м²/</span><input name="areaSize" type="number" min="0" step="0.01"/></label><label className={styles.field}><span>Хариуцсан ажилтан</span><select name="responsibleEmployeeId"><option value="">Сонгохгүй</option>{data.employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className={`${styles.field} ${styles.wide}`}><span>Хаяг</span><textarea name="address"/></label><div className={`${styles.field} ${styles.wide}`}><span>GPS байршил</span><GreenLocationPicker/></div><button className={styles.submit}>Байршил хадгалах</button>
          </div></form>
          <form action={createGreenAssetAction} className={styles.panel}><h2>Ургамлын тооллого нэмэх</h2><p>Мод, бут сөөг, зүлэг, цэцгийг байршилтай холбоно.</p><div className={styles.formGrid}>
            <label className={`${styles.field} ${styles.wide}`}><span>Байршил *</span><select name="locationId" required><option value="">Сонгох</option>{detailedLocations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className={styles.field}><span>Ангилал *</span><select name="assetType"><option value="tree">Мод</option><option value="bush">Бут сөөг</option><option value="grass">Зүлэг</option><option value="flower">Цэцэг</option><option value="other">Бусад</option></select></label><label className={styles.field}><span>Нэр *</span><input name="name" required placeholder="Ж: Улиас"/></label>
            <label className={styles.field}><span>Төрөл, сорт</span><input name="species"/></label><label className={styles.field}><span>Тоо хэмжээ *</span><input name="quantity" type="number" min="0.01" step="0.01" required/></label>
            <label className={styles.field}><span>Нэгж</span><select name="unit"><option value="ш">ш</option><option value="м²">м²</option><option value="м">м</option></select></label><label className={styles.field}><span>Төлөв</span><select name="condition"><option value="healthy">Хэвийн</option><option value="needs_care">Арчилгаа шаардлагатай</option><option value="damaged">Гэмтсэн</option><option value="dead">Хатсан</option></select></label>
            <label className={styles.field}><span>Тарьсан огноо</span><input name="plantedDate" type="date"/></label><label className={styles.field}><span>Хариуцсан ажилтан</span><select name="responsibleEmployeeId"><option value="">Сонгохгүй</option>{data.employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button className={styles.submit}>Тооллого хадгалах</button>
          </div></form>
          <form action={createGreenActivityAction} className={styles.panel}><h2>Хийгдсэн ажил бүртгэх</h2><p>Дөрвөн хэсгийн аль нэг байршилд хийсэн ажлын гүйцэтгэлийг хадгална.</p><div className={styles.formGrid}>
            <label className={`${styles.field} ${styles.wide}`}><span>Байршил *</span><select name="locationId" required><option value="">Сонгох</option>{detailedLocations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className={styles.field}><span>Ажлын төрөл</span><select name="activityType"><option value="watering">Усалгаа</option><option value="pruning">Тайралт</option><option value="care">Арчилгаа</option><option value="replanting">Нөхөн тарилт</option><option value="street_cleaning">Цэвэрлэгээ</option><option value="inspection">Үзлэг</option><option value="other">Бусад</option></select></label>
            <label className={styles.field}><span>Ажлын нэр *</span><input name="name" required/></label><label className={styles.field}><span>Хийгдсэн огноо</span><input name="performedDate" type="datetime-local"/></label><label className={styles.field}><span>Гүйцэтгэсэн хэмжээ</span><input name="actualQuantity" type="number" min="0" step="0.01"/></label>
            <label className={styles.field}><span>Нэгж</span><select name="unit"><option value="м²">м²</option><option value="ш">ш</option><option value="м">м</option><option value="удаа">удаа</option></select></label><label className={styles.field}><span>Гүйцэтгэсэн ажилтан</span><select name="assignedEmployeeId"><option value="">Сонгохгүй</option>{data.employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className={`${styles.field} ${styles.wide}`}><span>Тайлан, тайлбар</span><textarea name="reportNote"/></label><button className={styles.submit}>Хийгдсэн ажил хадгалах</button>
          </div></form>
        </section>
        <section className={styles.tablePanel}><div className={styles.tableHead}><h2>Ургамлын нэгдсэн тооллого</h2><span>{data.assets.length} бүртгэл</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Байршил</th><th>Ангилал</th><th>Нэр / сорт</th><th>Тоо хэмжээ</th><th>Төлөв</th><th>Тарьсан огноо</th></tr></thead><tbody>{data.assets.map(x=><tr key={x.id}><td><b>{x.locationName}</b></td><td>{typeLabels[x.assetType]||x.assetType}</td><td>{x.name}{x.species?` / ${x.species}`:""}</td><td>{x.quantity.toLocaleString("mn-MN")} {x.unit}</td><td><span className={styles.pill}>{conditionLabels[x.condition]||x.condition}</span></td><td>{x.plantedDate||"—"}</td></tr>)}</tbody></table></div></section>
      </div>
    </div>
  </div></main>;
}
