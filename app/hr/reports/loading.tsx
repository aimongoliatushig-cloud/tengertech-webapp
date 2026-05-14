import styles from "../hr.module.css";

export default function HrReportsLoading() {
  return (
    <section className={styles.panel}>
      <div className={styles.inlineLoading} role="status" aria-live="polite">
        <span className={styles.loadingSpinner} aria-hidden />
        <strong>HR тайлангийн мэдээлэл уншиж байна</strong>
        <p>Тайлангийн жагсаалт болон үзүүлэлтүүдийг Odoo-оос авч байна.</p>
      </div>
    </section>
  );
}
