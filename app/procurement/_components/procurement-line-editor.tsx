"use client";

import { useMemo, useState } from "react";
import { ImagePlus, PlusCircle, Trash2 } from "lucide-react";

import type { ProcurementParty } from "@/lib/procurement";

import styles from "../procurement.module.css";

type LineRow = {
  key: number;
};

type UnitOption = {
  key: string;
  id?: number;
  name: string;
};

type ProcurementLineEditorProps = {
  uoms: ProcurementParty[];
};

const DEFAULT_UNIT_OPTIONS: UnitOption[] = [
  { key: "default-piece", name: "ширхэг" },
  { key: "default-kg", name: "кг" },
  { key: "default-liter", name: "литер" },
];

function normalizeUnitName(value: string) {
  return value.trim().toLocaleLowerCase("mn-MN");
}

export function ProcurementLineEditor({ uoms }: ProcurementLineEditorProps) {
  const [rows, setRows] = useState<LineRow[]>([{ key: 1 }, { key: 2 }, { key: 3 }]);
  const [totals, setTotals] = useState<Record<number, { quantity: number; price: number }>>({});
  const [selectedUnits, setSelectedUnits] = useState<Record<number, string>>({});
  const [customUnits, setCustomUnits] = useState<UnitOption[]>([]);
  const [newUnitName, setNewUnitName] = useState("");
  const unitOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: UnitOption[] = [];

    for (const option of [
      ...DEFAULT_UNIT_OPTIONS,
      ...uoms.map((uom) => ({ key: `uom-${uom.id}`, id: uom.id, name: uom.name })),
      ...customUnits,
    ]) {
      const normalized = normalizeUnitName(option.name);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      options.push(option);
    }

    return options;
  }, [customUnits, uoms]);
  const totalAmount = useMemo(
    () => Object.values(totals).reduce((sum, item) => sum + item.quantity * item.price, 0),
    [totals],
  );

  function updateTotal(rowKey: number, field: "quantity" | "price", value: string) {
    setTotals((current) => ({
      ...current,
      [rowKey]: {
        quantity: field === "quantity" ? Number(value || 0) : current[rowKey]?.quantity || 0,
        price: field === "price" ? Number(value || 0) : current[rowKey]?.price || 0,
      },
    }));
  }

  function addRow() {
    setRows((current) => [...current, { key: Math.max(...current.map((row) => row.key), 0) + 1 }]);
  }

  function addUnit() {
    const trimmed = newUnitName.trim();
    if (!trimmed) {
      return;
    }

    const exists = unitOptions.some((option) => normalizeUnitName(option.name) === normalizeUnitName(trimmed));
    if (!exists) {
      setCustomUnits((current) => [
        ...current,
        {
          key: `custom-${Date.now()}`,
          name: trimmed,
        },
      ]);
    }
    setNewUnitName("");
  }

  function removeRow(rowKey: number) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== rowKey) : current));
    setTotals((current) => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
    setSelectedUnits((current) => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
  }

  return (
    <div className={styles.formStack}>
      <div className={styles.itemTable}>
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Нэр</th>
              <th>Тодорхойлолт</th>
              <th>Тоо хэмжээ</th>
              <th>Нэгж</th>
              <th>Зураг</th>
              <th>Тооцоот нэгж үнэ</th>
              <th>Нийт дүн</th>
              <th>Үйлдэл</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const quantity = totals[row.key]?.quantity || 0;
              const price = totals[row.key]?.price || 0;
              const selectedUnitKey = selectedUnits[row.key] || unitOptions[0]?.key || "";
              const selectedUnit = unitOptions.find((option) => option.key === selectedUnitKey);

              return (
                <tr key={row.key}>
                  <td>{index + 1}</td>
                  <td>
                    <input name="line_name" placeholder="Бараа / үйлчилгээ" />
                  </td>
                  <td>
                    <input name="line_specification" placeholder="Үзүүлэлт, тайлбар" />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="line_quantity"
                      onChange={(event) => updateTotal(row.key, "quantity", event.currentTarget.value)}
                    />
                  </td>
                  <td>
                    <select
                      value={selectedUnitKey}
                      onChange={(event) => {
                        const nextUnitKey = event.currentTarget.value;
                        setSelectedUnits((current) => ({
                          ...current,
                          [row.key]: nextUnitKey,
                        }));
                      }}
                    >
                      {unitOptions.map((unit) => (
                        <option key={unit.key} value={unit.key}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                    <input type="hidden" name="line_uom_id" value={selectedUnit?.id || ""} />
                    <input type="hidden" name="line_uom_name" value={selectedUnit?.name || ""} />
                  </td>
                  <td>
                    <label className={styles.lineImageUpload}>
                      <ImagePlus aria-hidden />
                      <span>Зураг</span>
                      <input type="file" name={`line_image_${index + 1}`} accept="image/*" multiple />
                    </label>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="line_approx_unit_price"
                      onChange={(event) => updateTotal(row.key, "price", event.currentTarget.value)}
                    />
                  </td>
                  <td>{new Intl.NumberFormat("mn-MN").format(quantity * price)} ₮</td>
                  <td>
                    <button className={styles.iconButton} type="button" onClick={() => removeRow(row.key)} aria-label="Мөр устгах">
                      <Trash2 aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.formActionsCard}>
        <div className={styles.formActionsCopy}>
          <strong>Нийт дүн: {new Intl.NumberFormat("mn-MN").format(totalAmount)} ₮</strong>
          <span>Дүн нь оруулсан мөрүүдийн тоо хэмжээ, нэгж үнээр урьдчилан тооцоологдоно.</span>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={addRow}>
          <PlusCircle aria-hidden />
          Мөр нэмэх
        </button>
      </div>
      <div className={styles.formActionsCard}>
        <label className={styles.fieldLabel}>
          Шинэ нэгж нэмэх
          <input
            value={newUnitName}
            onChange={(event) => setNewUnitName(event.currentTarget.value)}
            placeholder="Жишээ: хайрцаг"
          />
        </label>
        <button className={styles.secondaryButton} type="button" onClick={addUnit}>
          <PlusCircle aria-hidden />
          Нэгж нэмэх
        </button>
      </div>
    </div>
  );
}
