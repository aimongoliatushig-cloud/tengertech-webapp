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
      <option value="submitted">Хүсэлт илгээгдсэн</option>
      <option value="quotation_waiting">Үнийн санал бүртгэгдсэн</option>
      <option value="decision_waiting">Тушаал батлуулах шатанд</option>
      <option value="finance_review">Төлбөрийн хяналтанд</option>
      <option value="admin_review">Хуулийн мэргэжилтэнд илгээсэн</option>
      <option value="ceo_decision">Тушаал батлуулах шатанд</option>
      <option value="legal_contract_draft">Хуулийн мэргэжилтэнд илгээсэн</option>
      <option value="contract_draft_started">Гэрээний төсөл эхэлсэн</option>
      <option value="order_draft_started">Тушаалын төсөл эхэлсэн</option>
      <option value="order_draft_uploaded">Тушаалын төсөл гарсан</option>
      <option value="ceo_order_uploaded">Тушаал гарсан</option>
      <option value="legal_final_contract">Гэрээний төсөл батлагдсан</option>
      <option value="payment_pending">Төлбөрийн хяналтанд</option>
      <option value="payment_recorded">Төлбөр төлөгдсөн</option>
      <option value="received">Хүлээн авалт хүлээгдэж байна</option>
      <option value="done">Дууссан</option>
    </select>
  );
}
