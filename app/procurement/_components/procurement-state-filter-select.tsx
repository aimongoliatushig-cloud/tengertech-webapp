"use client";

type ProcurementStateFilterSelectProps = {
  defaultValue: string;
};

export function ProcurementStateFilterSelect({ defaultValue }: ProcurementStateFilterSelectProps) {
  return (
    <select
      name="state"
      defaultValue={defaultValue}
      onChange={(event) => {
        event.currentTarget.form?.requestSubmit();
      }}
    >
      <option value="">Бүгд</option>
      <option value="draft">Ноорог</option>
      <option value="submitted">Илгээсэн</option>
      <option value="quotation_waiting">Санал цуглуулж байна</option>
      <option value="decision_waiting">Шийдвэр хүлээгдэж байна</option>
      <option value="finance_review">Санхүүгийн хяналт</option>
      <option value="admin_review">Захиргааны хяналт</option>
      <option value="ceo_decision">Захирлын шийдвэр</option>
      <option value="legal_contract_draft">Гэрээ боловсруулж байна</option>
      <option value="payment_pending">Төлбөр хүлээгдэж байна</option>
      <option value="payment_recorded">Хүлээн авалт хүлээгдэж байна</option>
      <option value="received">Хүлээн авалт хүлээгдэж байна</option>
      <option value="done">Дууссан</option>
    </select>
  );
}
