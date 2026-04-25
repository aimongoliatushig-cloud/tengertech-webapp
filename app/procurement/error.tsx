"use client";

import Link from "next/link";
import { useEffect } from "react";

import styles from "./procurement.module.css";

type ProcurementErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProcurementError({ error, reset }: ProcurementErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.errorShell}>
      <section className={styles.errorCard}>
        <p className={styles.eyebrow}>Худалдан авалт</p>
        <h1>Хуудас ачаалж чадсангүй</h1>
        <p className={styles.errorMessage}>
          {error.message || "Худалдан авалтын өгөгдөл дуудахад алдаа гарлаа."}
        </p>
        <p className={styles.errorHint}>
          Odoo талын API route, module install, эсвэл local тохиргоо дутуу үед ийм алдаа гарч болно.
        </p>
        <div className={styles.buttonRow}>
          <button type="button" onClick={reset} className={styles.primaryButton}>
            Дахин оролдох
          </button>
          <Link href="/" className={styles.secondaryButton}>
            Нүүр хуудас руу буцах
          </Link>
        </div>
      </section>
    </div>
  );
}
