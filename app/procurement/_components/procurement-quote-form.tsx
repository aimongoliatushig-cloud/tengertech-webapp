"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";

import {
  createProcurementSupplierInlineAction,
  submitProcurementQuotationsAction,
} from "@/app/procurement/actions";

import styles from "../procurement.module.css";

type SupplierOption = {
  id: number;
  name: string;
};

type QuoteValue = {
  supplier: SupplierOption;
  amount_total: number;
};

type RequestLineOption = {
  id: number;
  product_name?: string | null;
  specification?: string | null;
  quantity: number;
};

type AddModalState = {
  quoteIndex: number;
  suggestedName: string;
} | null;

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("mn-MN");
}

function sortSuppliers(items: SupplierOption[]) {
  return [...items].sort((first, second) => first.name.localeCompare(second.name, "mn-MN"));
}

function uniqueSuppliers(items: SupplierOption[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function SupplierCombobox({
  index,
  suppliers,
  selectedId,
  onSelect,
  onRequestAdd,
}: {
  index: number;
  suppliers: SupplierOption[];
  selectedId: number | "";
  onSelect: (id: number | "") => void;
  onRequestAdd: (suggestedName: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedId) || null;
  const [query, setQuery] = useState(selectedSupplier?.name || "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const filteredSuppliers = useMemo(() => {
    const needle = normalizeName(query);
    if (!needle) return suppliers;
    return suppliers.filter((supplier) => normalizeName(supplier.name).includes(needle));
  }, [query, suppliers]);

  function selectSupplier(supplier: SupplierOption) {
    onSelect(supplier.id);
    setQuery(supplier.name);
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const optionCount = filteredSuppliers.length + 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (current + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (current - 1 + optionCount) % optionCount);
    } else if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      const supplier = filteredSuppliers[activeIndex];
      if (supplier) {
        selectSupplier(supplier);
      } else {
        onRequestAdd(query);
        setIsOpen(false);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className={styles.vendorCombobox} ref={wrapperRef}>
      <label className={styles.fieldLabel} htmlFor={`supplier-search-${index}`}>
        Нийлүүлэгч
        <input
          id={`supplier-search-${index}`}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`supplier-list-${index}`}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder="Нэрээр хайх"
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setIsOpen(true);
            setActiveIndex(0);
            if (selectedSupplier && normalizeName(nextValue) !== normalizeName(selectedSupplier.name)) {
              onSelect("");
            }
          }}
        />
      </label>
      <input type="hidden" name={`supplier_id_${index}`} value={selectedId} readOnly />
      {selectedSupplier ? <div className={styles.vendorSelectedText}>Сонгосон: {selectedSupplier.name}</div> : null}

      {isOpen ? (
        <div className={styles.vendorDropdown} id={`supplier-list-${index}`} role="listbox">
          {filteredSuppliers.length ? (
            filteredSuppliers.map((supplier, optionIndex) => (
              <button
                key={supplier.id}
                type="button"
                className={`${styles.vendorOption} ${optionIndex === activeIndex ? styles.vendorOptionActive : ""}`}
                role="option"
                aria-selected={supplier.id === selectedId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSupplier(supplier)}
              >
                {supplier.name}
              </button>
            ))
          ) : (
            <div className={styles.vendorEmptyOption}>Нийлүүлэгч олдсонгүй.</div>
          )}
          <button
            type="button"
            className={`${styles.vendorOption} ${styles.vendorAddOption} ${
              activeIndex === filteredSuppliers.length ? styles.vendorOptionActive : ""
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onRequestAdd(query);
              setIsOpen(false);
            }}
          >
            + Шинэ нийлүүлэгч нэмэх
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ProcurementQuoteForm({
  requestId,
  packageId,
  packageName,
  lines = [],
  editableLines = [],
  suppliers,
  quotations,
  redirectPath,
}: {
  requestId: number;
  packageId?: number;
  packageName?: string;
  lines?: RequestLineOption[];
  editableLines?: RequestLineOption[];
  suppliers: SupplierOption[];
  quotations: QuoteValue[];
  redirectPath?: string;
}) {
  const [supplierOptions, setSupplierOptions] = useState(() => sortSuppliers(uniqueSuppliers(suppliers)));
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Array<number | "">>(() =>
    [quotations[0]?.supplier.id || ""],
  );
  const [formError, setFormError] = useState("");
  const [modalState, setModalState] = useState<AddModalState>(null);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [modalError, setModalError] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateSelectedSupplier(index: number, supplierId: number | "") {
    setSelectedSupplierIds((current) => current.map((value, itemIndex) => (itemIndex === index - 1 ? supplierId : value)));
    setFormError("");
  }

  function openSupplierModal(quoteIndex: number, suggestedName: string) {
    setModalState({ quoteIndex, suggestedName });
    setNewSupplierName(suggestedName.trim());
    setModalError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const selected = selectedSupplierIds.filter((id): id is number => typeof id === "number" && id > 0);
    if (selected.length !== 1) {
      event.preventDefault();
      setFormError("Нийлүүлэгчийн нэрийг сонгоно уу.");
      return;
    }
    const invoiceAmount = Number(String(formData.get("amount_total_1") || "0"));
    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
      event.preventDefault();
      setFormError("Багц бүрийн үнийн санал / нэхэмжлэхийн дүнг 0-ээс ихээр оруулна уу.");
      return;
    }
    if ((!packageId && lines.length > 1) || editableLines.length > 1) {
      const selectedLineIds = formData.getAll("line_ids").filter(Boolean);
      if (!selectedLineIds.length) {
        event.preventDefault();
        setFormError("Энэ багцад оруулах бараагаа сонгоно уу.");
        return;
      }
    }
  }

  function handleCreateSupplier() {
    const name = newSupplierName.trim();
    if (!name) {
      setModalError("Нийлүүлэгчийн нэр оруулна уу.");
      return;
    }

    const duplicate = supplierOptions.find((supplier) => normalizeName(supplier.name) === normalizeName(name));
    if (duplicate) {
      setModalError("Ийм нэртэй нийлүүлэгч байна.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await createProcurementSupplierInlineAction({ name });
        if (!result.ok || !result.supplier) {
          setModalError(result.error || "Нийлүүлэгч нэмэх үед алдаа гарлаа.");
          return;
        }

        const supplier = { id: result.supplier.id, name: result.supplier.name };
        setSupplierOptions((current) => sortSuppliers(uniqueSuppliers([...current, supplier])));
        if (modalState) {
          updateSelectedSupplier(modalState.quoteIndex, supplier.id);
        }
        setModalState(null);
        setNewSupplierName("");
        setModalError("");
      })();
    });
  }

  return (
    <>
      <form action={submitProcurementQuotationsAction} className={styles.quoteForm} onSubmit={handleSubmit}>
        <input type="hidden" name="request_id" value={requestId} />
        {packageId ? <input type="hidden" name="package_id" value={packageId} /> : null}
        {redirectPath ? <input type="hidden" name="redirect_path" value={redirectPath} /> : null}
        {packageId && editableLines.length ? (
          <section className={styles.inlineDetails}>
            <h4>Энэ багцад оруулах бараа</h4>
            <label className={styles.fieldLabel}>
              Багцын нэр
              <input name="package_name" defaultValue={packageName || "Нэг багц"} required />
            </label>
            <div className={styles.selectableList}>
              {editableLines.map((line) => (
                <label key={line.id} className={styles.selectableItem}>
                  <input type="checkbox" name="line_ids" value={line.id} defaultChecked />
                  <span>
                    <strong>{line.product_name || line.specification || `Бараа #${line.id}`}</strong>
                    <small>Тоо хэмжээ: {line.quantity}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}
        {!packageId ? (
          <section className={styles.inlineDetails}>
            <h4>Багцлах бараа</h4>
            {lines.length === 1 ? (
              <>
                <input type="hidden" name="package_name" value={lines[0].product_name || "Нэг багц"} />
                <input type="hidden" name="line_ids" value={lines[0].id} />
                <div className={styles.selectableList}>
                  <div className={styles.selectableItem}>
                    <span>
                      <strong>{lines[0].product_name || lines[0].specification || `Бараа #${lines[0].id}`}</strong>
                      <small>Тоо хэмжээ: {lines[0].quantity}</small>
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <label className={styles.fieldLabel}>
                Багцын нэр
                <input name="package_name" placeholder="Жишээ: Сэлбэгийн багц 1" required />
              </label>
            )}
            {lines.length > 1 ? (
              <div className={styles.selectableList}>
                {lines.map((line) => (
                  <label key={line.id} className={styles.selectableItem}>
                    <input type="checkbox" name="line_ids" value={line.id} defaultChecked />
                    <span>
                      <strong>{line.product_name || line.specification || `Бараа #${line.id}`}</strong>
                      <small>Тоо хэмжээ: {line.quantity}</small>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        <div className={styles.quoteGrid}>
          {[1].map((index) => {
            const existing = quotations[index - 1];
            return (
              <article key={index} className={styles.quoteCard}>
                <h3>Үнийн санал бүртгэх</h3>
                <SupplierCombobox
                  key={`${index}-${selectedSupplierIds[index - 1] || "empty"}`}
                  index={index}
                  suppliers={supplierOptions}
                  selectedId={selectedSupplierIds[index - 1]}
                  onSelect={(supplierId) => updateSelectedSupplier(index, supplierId)}
                  onRequestAdd={(suggestedName) => openSupplierModal(index, suggestedName)}
                />
                <label className={styles.fieldLabel}>
                  Үнийн санал / нэхэмжлэхийн дүн
                  <input
                    type="number"
                    name={`amount_total_${index}`}
                    min="1"
                    step="1"
                    defaultValue={existing?.amount_total ? Math.round(existing.amount_total) : ""}
                    placeholder="Жишээ: 1200000"
                    required
                  />
                </label>
                <p className={styles.helperText}>1,000,000₮-өөс их бол тушаал болон гэрээний шат руу орно.</p>
                <label className={styles.fieldLabel}>
                  Хавсралт файл оруулах
                  <input type="file" name={`quote_file_${index}`} required />
                </label>
              </article>
            );
          })}
        </div>
        {formError ? <p className={styles.formError}>{formError}</p> : null}
        <p className={styles.helperText}>Нийлүүлэгчийн мэдээлэл болон үнийн санал / нэхэмжлэхийн хавсралтыг оруулна.</p>
        <button type="submit" className={styles.primaryButton}>Үнийн санал бүртгэх</button>
      </form>

      {modalState ? (
        <div className={styles.vendorModalOverlay} role="presentation">
          <div className={styles.vendorModal} role="dialog" aria-modal="true" aria-labelledby="vendor-modal-title">
            <h3 id="vendor-modal-title">Шинэ нийлүүлэгч нэмэх</h3>
            <label className={styles.fieldLabel}>
              Нийлүүлэгчийн нэр
              <input
                value={newSupplierName}
                autoFocus
                onChange={(event) => {
                  setNewSupplierName(event.target.value);
                  setModalError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCreateSupplier();
                  } else if (event.key === "Escape") {
                    setModalState(null);
                  }
                }}
              />
            </label>
            {modalError ? <p className={styles.formError}>{modalError}</p> : null}
            <div className={styles.vendorModalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setModalState(null)}>
                Болих
              </button>
              <button type="button" className={styles.primaryButton} onClick={handleCreateSupplier} disabled={isPending}>
                {isPending ? "Нэмж байна..." : "Нэмэх"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
