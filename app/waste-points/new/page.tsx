import { MapPin, PlusCircle } from "lucide-react";

import { WASTE_TYPE_LABELS, type WastePointType } from "@/lib/waste-points/types";
import { createWastePointAction } from "../actions";
import { requireWasteAccess } from "../access";
import { WasteShell } from "../waste-shell";
import { WasteSubNav } from "../waste-sub-nav";
import styles from "../waste-points.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function NewWastePointPage({ searchParams }: PageProps) {
  const { session, scopedDepartmentName } = await requireWasteAccess();
  const params = (await searchParams) ?? {};
  const error = first(params.error);
  const notice = first(params.notice);

  return (
    <WasteShell
      session={session}
      scopedDepartmentName={scopedDepartmentName}
      title="Хогийн цэг нэмэх"
      subtitle="Авто бааз, хог тээвэрлэлтийн хэлтсийн хогийн цэгийн бүртгэл"
    >
      <div className={styles.page}>
        <WasteSubNav active="new" />
        {error ? <div className={`${styles.toast} ${styles.toastError}`}>{error}</div> : null}
        {notice ? <div className={`${styles.toast} ${styles.toastOk}`}>{notice}</div> : null}

        <form action={createWastePointAction} className={`${styles.card} ${styles.createPointForm}`}>
          <div className={styles.cardHead}>
            <h2><PlusCircle size={18} aria-hidden /> Шинэ хогийн цэгийн мэдээлэл</h2>
            <small>Одтой талбарыг заавал бөглөнө</small>
          </div>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>Код *</span><input name="code" required placeholder="Жишээ: ХЦ-001" /></label>
            <label className={styles.field}><span>Нэр *</span><input name="name" required placeholder="Хогийн цэгийн нэр" /></label>
            <label className={styles.field}><span>Төрөл *</span><select name="type" required>{(Object.keys(WASTE_TYPE_LABELS) as WastePointType[]).map((type) => <option key={type} value={type}>{WASTE_TYPE_LABELS[type]}</option>)}</select></label>
            <label className={styles.field}><span>Дүүрэг</span><input name="districtName" defaultValue="Баянзүрх дүүрэг" /></label>
            <label className={styles.field}><span>Хороо</span><input name="khorooName" placeholder="Жишээ: 7-р хороо" /></label>
            <label className={`${styles.field} ${styles.fieldWide}`}><span>Хаяг</span><input name="address" placeholder="Дэлгэрэнгүй хаяг, байршлын тайлбар" /></label>
            <label className={styles.field}><span>GPS өргөрөг *</span><input name="latitude" type="number" step="any" required placeholder="47.91880" /></label>
            <label className={styles.field}><span>GPS уртраг *</span><input name="longitude" type="number" step="any" required placeholder="106.91760" /></label>
            <label className={styles.field}><span>Савны төрөл</span><input name="containerType" placeholder="Жишээ: 1.1 м³ контейнер" /></label>
            <label className={styles.field}><span>Савны тоо</span><input name="containerCount" type="number" min="0" step="1" defaultValue="0" /></label>
            <label className={styles.field}><span>Нийт багтаамж (литр)</span><input name="capacity" type="number" min="0" step="1" defaultValue="0" /></label>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}><PlusCircle size={16} aria-hidden /> Хогийн цэг хадгалах</button>
            <span><MapPin size={15} aria-hidden /> GPS утгыг газрын зураг эсвэл төхөөрөмжөөс хуулж оруулна.</span>
          </div>
        </form>
      </div>
    </WasteShell>
  );
}
