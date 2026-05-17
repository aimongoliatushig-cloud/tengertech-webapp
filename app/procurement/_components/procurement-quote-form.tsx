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
  id?: number;
  supplier: SupplierOption;
  amount_total: number;
  attachments?: Array<{ id: number; name: string; mimetype: string }>;
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
  suppliers,
  quotations,
}: {
  requestId: number;
  packageId: number;
  suppliers: SupplierOption[];
  quotations: QuoteValue[];
}) {
  const [supplierOptions, setSupplierOptions] = useState(() => sortSuppliers(uniqueSuppliers(suppliers)));
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Array<number | "">>(() =>
    [0, 1, 2].map((index) => quotations[index]?.supplier.id || ""),
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
    const selected = selectedSupplierIds.filter((id): id is number => typeof id === "number" && id > 0);
    if (selected.length !== 3) {
      event.preventDefault();
      setFormError("3 нийлүүлэгчийг бүгдийг нь сонгоно уу.");
      return;
    }

    if (new Set(selected).size !== selected.length) {
      event.preventDefault();
      setFormError("3 өөр нийлүүлэгч сонгоно уу.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const missingAmounts = [1, 2, 3].some((index) => Number(String(formData.get(`amount_total_${index}`) || "0")) <= 0);
    if (missingAmounts) {
      event.preventDefault();
      setFormError("Санал бүрийн үнийн дүн 0-ээс их байх ёстой.");
      return;
    }

    const missingInvoices = [1, 2, 3].some((index) => {
      const existing = quotations[index - 1];
      const hasExistingAttachment = Boolean(existing?.attachments?.length);
      const file = formData.get(`quote_file_${index}`);
      const hasNewFile = file instanceof File && file.size > 0;
      return !hasExistingAttachment && !hasNewFile;
    });
    if (missingInvoices) {
      event.preventDefault();
      setFormError("Санал бүрийн invoice файлыг хавсаргана уу.");
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
        <input type="hidden" name="package_id" value={packageId} />
        <div className={styles.quoteGrid}>
          {[1, 2, 3].map((index) => {
            const existing = quotations[index - 1];
            return (
              <article key={index} className={styles.quoteCard}>
                <input type="hidden" name={`quotation_id_${index}`} value={existing?.id || ""} />
                <h3>{index}-р нийлүүлэгч</h3>
                <SupplierCombobox
                  key={`${index}-${selectedSupplierIds[index - 1] || "empty"}`}
                  index={index}
                  suppliers={supplierOptions}
                  selectedId={selectedSupplierIds[index - 1]}
                  onSelect={(supplierId) => updateSelectedSupplier(index, supplierId)}
                  onRequestAdd={(suggestedName) => openSupplierModal(index, suggestedName)}
                />
                <label className={styles.fieldLabel}>
                  Нийт үнийн дүн
                  <input type="number" name={`amount_total_${index}`} defaultValue={existing?.amount_total || ""} min="0" required />
                </label>
                <label className={styles.fieldLabel}>
                  Invoice файл
                  <input type="file" name={`quote_file_${index}`} required={!existing?.attachments?.length} />
                </label>
                {existing?.attachments?.length ? (
                  <p className={styles.helperText}>{existing.attachments.length} invoice хадгалагдсан.</p>
                ) : null}
              </article>
            );
          })}
        </div>
        {formError ? <p className={styles.formError}>{formError}</p> : null}
        <p className={styles.helperText}>Хамгийн бага үнийн санал автоматаар сонгогдоно.</p>
        <button type="submit" className={styles.primaryButton}>Санал хадгалах</button>
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
