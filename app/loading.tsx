import styles from "./loading.module.css";

export default function Loading() {
  return (
    <main className={styles.screen} aria-busy="true">
      <div className={styles.panel} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden />
        <strong>Уншиж байна...</strong>
      </div>
    </main>
  );
}
