"use client";

import { useRef } from "react";

import { runProcurementWorkflowAction } from "@/app/procurement/actions";

import styles from "../procurement.module.css";

type ProcurementPaymentConfirmationProps = {
  requestId: number;
  packageId?: number;
  selectedQuotationId?: number;
  supplierName: string;
  amount: number;
  bankAccount?: string | null;
  paymentReference?: string | null;
  paymentDate?: string | null;
  note?: string | null;
};

function formatAmount(value: number) {
  return new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value || 0)));
}

export function ProcurementPaymentConfirmation({
  requestId,
  packageId,
  selectedQuotationId,
  supplierName,
  amount,
  bankAccount,
  paymentReference,
  paymentDate,
  note,
}: ProcurementPaymentConfirmationProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  return (
    <div className={styles.paymentConfirm}>
      <button
        type="button"
        className={styles.primaryButton}
        onClick={() => dialogRef.current?.showModal()}
      >
        Төлбөр төлөгдсөнийг баталгаажуулах
      </button>
      <dialog ref={dialogRef} className={styles.paymentDialog}>
        <form method="dialog" className={styles.modalHeader}>
          <div>
            <span className={styles.badgeWarning}>Ерөнхий ня-бо</span>
            <h3>Төлбөр баталгаажуулах</h3>
          </div>
          <button type="submit" className={styles.secondaryButton}>
            Хаах
          </button>
        </form>
        <form action={runProcurementWorkflowAction} className={styles.inlineForm}>
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="workflow_action" value="mark_paid" />
          {packageId ? <input type="hidden" name="package_id" value={packageId} /> : null}
          {selectedQuotationId ? (
            <input type="hidden" name="selected_quotation_id" value={selectedQuotationId} />
          ) : null}
          <label className={styles.fieldLabel}>
            Нийлүүлэгч
            <input value={supplierName} readOnly />
          </label>
          <label className={styles.fieldLabel}>
            Дүн
            <input name="paid_amount" value={Math.max(1, Math.round(amount || 0))} readOnly />
          </label>
          <label className={styles.fieldLabel}>
            Банкны данс
            <input value={bankAccount || "Бүртгэлгүй"} readOnly />
          </label>
          <label className={styles.fieldLabel}>
            Гүйлгээний дугаар
            <input name="payment_reference" defaultValue={paymentReference || ""} required />
          </label>
          <label className={styles.fieldLabel}>
            Төлсөн огноо
            <input type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} name="payment_date" defaultValue={paymentDate || ""} required />
          </label>
          <label className={styles.fieldLabel}>
            Тайлбар
            <textarea name="note" defaultValue={note || ""} />
          </label>
          <label className={styles.fieldLabel}>
            Төлбөрийн баримт upload
            <input type="file" name="document_files" multiple required />
          </label>
          <p className={styles.subtleText}>
            Баталгаажуулах дүн: {formatAmount(amount)} MNT. Энэ үйлдэл төлбөрийг “Төлбөр төлөгдсөн”
            төлөвт шилжүүлнэ.
          </p>
          <button type="submit" className={styles.primaryButton}>
            Төлбөр төлөгдсөнийг баталгаажуулах
          </button>
        </form>
      </dialog>
    </div>
  );
}
