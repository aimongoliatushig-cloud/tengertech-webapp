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
              <th>Үйлдэл</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
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
          <strong>Барааны мөрүүд</strong>
          <span>Хэлтсийн дарга зөвхөн хэрэгцээтэй бараа, тоо хэмжээ, зураг/тайлбарыг оруулна.</span>
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
