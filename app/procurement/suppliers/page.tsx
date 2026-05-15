import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createProcurementSupplierDirectoryAction,
  deleteProcurementSupplierAction,
  updateProcurementSupplierAction,
} from "@/app/procurement/actions";
import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { canAccessProcurementModule, requireSession } from "@/lib/auth";
import {
  createFallbackProcurementUser,
  isProcurementSetupError,
  loadProcurementMe,
  loadProcurementSuppliers,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getProcurementLoadWarning(error: unknown) {
  return isProcurementSetupError(error)
    ? "Худалдан авалтын backend API хараахан идэвхжээгүй байна. Нийлүүлэгчийн жагсаалт түр хоосон харагдана."
    : "Нийлүүлэгчийн мэдээлэл дуудагдсангүй. Odoo холболт болон эрхийн тохиргоог шалгана уу.";
}

export default async function ProcurementSuppliersPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (!canAccessProcurementModule(session)) {
    redirect("/");
  }

  const params = (await searchParams) || {};
  const search = getValue(params.search);
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  const [procurementUser, suppliers, setupWarning] = await Promise.all([
    loadProcurementMe(connectionOverrides).catch(() => createFallbackProcurementUser(session)),
    loadProcurementSuppliers({ search }, connectionOverrides).catch(() => []),
    loadProcurementSuppliers({}, connectionOverrides)
      .then(() => "")
      .catch((loadError) => getProcurementLoadWarning(loadError)),
  ]);

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Нийлүүлэгчид"
      description="Үнийн санал авах нийлүүлэгчийн бүртгэлийг нэмэх, засах, идэвхгүй болгох."
      activeTab="list"
    >
      {setupWarning ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{setupWarning}</section> : null}
      {notice ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{notice}</section> : null}
      {error ? <section className={`${styles.statusBanner} ${styles.errorBanner}`}>{error}</section> : null}

      <section className={styles.listLayout}>
        <div className={styles.mainStack}>
          <section className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Нийлүүлэгчийн жагсаалт</h2>
                <p>{suppliers.length} нийлүүлэгч харагдаж байна.</p>
              </div>
              <Link href="/procurement/assigned" className={styles.secondaryButton}>Х.Авалтууд</Link>
            </div>

            <form className={styles.filterRow}>
              <label className={styles.fieldLabel}>
                Хайх
                <input name="search" type="search" defaultValue={search} placeholder="Нэр, регистр, утас, и-мэйл" />
              </label>
              <div className={styles.buttonRow}>
                <button type="submit" className={styles.primaryButton}>Шүүх</button>
                <Link href="/procurement/suppliers" className={styles.secondaryButton}>Цэвэрлэх</Link>
              </div>
            </form>

            <div className={styles.supplierGrid}>
              {suppliers.length ? (
                suppliers.map((supplier) => (
                  <article key={supplier.id} className={styles.supplierCard}>
                    <form action={updateProcurementSupplierAction} className={styles.supplierForm}>
                      <input type="hidden" name="supplier_id" value={supplier.id} />
                      <label className={styles.fieldLabel}>Нэр<input name="supplier_name" defaultValue={supplier.name} required /></label>
                      <label className={styles.fieldLabel}>Регистр<input name="supplier_vat" defaultValue={supplier.vat || ""} /></label>
                      <label className={styles.fieldLabel}>Утас<input name="supplier_phone" defaultValue={supplier.phone || ""} /></label>
                      <label className={styles.fieldLabel}>И-мэйл<input name="supplier_email" type="email" defaultValue={supplier.email || ""} /></label>
                      <label className={`${styles.fieldLabel} ${styles.fieldSpanFull}`}>Хаяг<input name="supplier_street" defaultValue={supplier.street || ""} /></label>
                      <div className={`${styles.buttonRow} ${styles.fieldSpanFull}`}>
                        <button type="submit" className={styles.primaryButton}>Хадгалах</button>
                      </div>
                    </form>
                    <form action={deleteProcurementSupplierAction}>
                      <input type="hidden" name="supplier_id" value={supplier.id} />
                      <button type="submit" className={styles.dangerButton}>Устгах</button>
                    </form>
                  </article>
                ))
              ) : (
                <div className={styles.emptyPanel}>
                  <strong>Нийлүүлэгч олдсонгүй.</strong>
                  <span>Шүүлтээ өөрчлөх эсвэл шинэ нийлүүлэгч нэмнэ үү.</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className={styles.sideStack}>
          <section className={styles.sidePanel}>
            <h3>Шинэ нийлүүлэгч</h3>
            <form action={createProcurementSupplierDirectoryAction} className={styles.compactFilters}>
              <label className={styles.fieldLabel}>Нэр<input name="supplier_name" required /></label>
              <label className={styles.fieldLabel}>Регистр<input name="supplier_vat" /></label>
              <label className={styles.fieldLabel}>Утас<input name="supplier_phone" /></label>
              <label className={styles.fieldLabel}>И-мэйл<input name="supplier_email" type="email" /></label>
              <label className={styles.fieldLabel}>Хаяг<textarea name="supplier_street" /></label>
              <button type="submit" className={styles.primaryButton}>Нэмэх</button>
            </form>
          </section>

          <section className={styles.sidePanel}>
            <h3>Тайлбар</h3>
            <div className={styles.statusGuide}>
              <div className={styles.statusGuideItem}><span>Нийлүүлэгчийг үнийн саналын form дээр шууд сонгоно.</span></div>
              <div className={styles.statusGuideItem}><span>Устгах үйлдэл нь хуучин саналын түүхийг эвдэхгүйгээр идэвхгүй болгоно.</span></div>
            </div>
          </section>
        </aside>
      </section>
    </ProcurementShell>
  );
}
