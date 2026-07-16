"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import {
  EVAL_CRITERIA,
  EVAL_MAX_TOTAL,
  emptyScores,
  type EvalRow,
} from "@/lib/road-cleaning-evaluation";
import { saveEvaluationAction } from "./actions";
import styles from "./evaluation.module.css";

type Props = {
  month: string;
  department: string;
  initialRows: EvalRow[];
  evaluatorOrg: string;
  evaluatorName: string;
  canEdit: boolean;
};

function emptyRow(): EvalRow {
  return { location: "", segment: "", areaM2: 0, scores: emptyScores() };
}

export function EvaluationEntryClient({
  month,
  department,
  initialRows,
  evaluatorOrg,
  evaluatorName,
  canEdit,
}: Props) {
  const [rows, setRows] = useState<EvalRow[]>(initialRows.length ? initialRows : [emptyRow()]);
  const [org, setOrg] = useState(evaluatorOrg);
  const [name, setName] = useState(evaluatorName);

  const rowTotals = useMemo(
    () => rows.map((row) => EVAL_CRITERIA.reduce((sum, c) => sum + (Number(row.scores[c.key]) || 0), 0)),
    [rows],
  );

  const updateRow = (index: number, patch: Partial<EvalRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const updateScore = (index: number, key: string, max: number, value: string) => {
    let num = Number(value);
    if (!Number.isFinite(num) || num < 0) num = 0;
    if (num > max) num = max;
    setRows((current) =>
      current.map((row, i) =>
        i === index ? { ...row, scores: { ...row.scores, [key]: num } } : row,
      ),
    );
  };

  const addRow = () => setRows((current) => [...current, emptyRow()]);
  const removeRow = (index: number) =>
    setRows((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));

  const serialized = JSON.stringify(rows);

  return (
    <form action={saveEvaluationAction} className={styles.entryForm}>
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="department" value={department} />
      <input type="hidden" name="rows_json" value={serialized} />
      <input type="hidden" name="evaluator_org" value={org} />
      <input type="hidden" name="evaluator_name" value={name} />

      <div className={styles.tableScroll}>
        <table className={styles.evalTable}>
          <thead>
            <tr>
              <th className={styles.colIndex}>№</th>
              <th className={styles.colLocation}>Гудамж, талбайн нэршил</th>
              <th className={styles.colSegment}>Эхлэл, төгсгөлийн цэгийн байршил</th>
              <th className={styles.colArea}>Талбай /м²/</th>
              {EVAL_CRITERIA.map((c) => (
                <th key={c.key} className={styles.colScore} title={c.label}>
                  <span className={styles.criterionLabel}>{c.label}</span>
                  <span className={styles.criterionMax}>/{c.max}/</span>
                </th>
              ))}
              <th className={styles.colTotal}>Нийт оноо /{EVAL_MAX_TOTAL}/</th>
              {canEdit ? <th className={styles.colRemove} aria-label="Устгах" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className={styles.colIndex}>{index + 1}</td>
                <td className={styles.colLocation}>
                  <textarea
                    rows={2}
                    value={row.location}
                    placeholder="Байршлын нэр"
                    disabled={!canEdit}
                    onChange={(e) => updateRow(index, { location: e.target.value })}
                  />
                </td>
                <td className={styles.colSegment}>
                  <textarea
                    rows={2}
                    value={row.segment}
                    placeholder="Эхлэл — төгсгөл"
                    disabled={!canEdit}
                    onChange={(e) => updateRow(index, { segment: e.target.value })}
                  />
                </td>
                <td className={styles.colArea}>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={row.areaM2 ? String(row.areaM2) : ""}
                    placeholder="0"
                    disabled={!canEdit}
                    onChange={(e) => updateRow(index, { areaM2: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  />
                </td>
                {EVAL_CRITERIA.map((c) => (
                  <td key={c.key} className={styles.colScore}>
                    <input
                      type="number"
                      min={0}
                      max={c.max}
                      step={0.01}
                      inputMode="decimal"
                      value={row.scores[c.key] ? String(row.scores[c.key]) : ""}
                      placeholder="0"
                      disabled={!canEdit}
                      onChange={(e) => updateScore(index, c.key, c.max, e.target.value)}
                    />
                  </td>
                ))}
                <td className={styles.colTotal}>
                  <strong>{rowTotals[index].toFixed(2)}</strong>
                </td>
                {canEdit ? (
                  <td className={styles.colRemove}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label={`${index + 1}-р мөр устгах`}
                      onClick={() => removeRow(index)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.signatureFields}>
        <label className={styles.signatureField}>
          <span>Үнэлгээ өгсөн байгууллага</span>
          <input
            type="text"
            value={org}
            disabled={!canEdit}
            onChange={(e) => setOrg(e.target.value)}
          />
        </label>
        <label className={styles.signatureField}>
          <span>ТББ-ын тэргүүн</span>
          <input
            type="text"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      {canEdit ? (
        <div className={styles.entryActions}>
          <button type="button" className={styles.addButton} onClick={addRow}>
            <Plus size={16} aria-hidden /> Байршил нэмэх
          </button>
          <button type="submit" className={styles.saveButton}>
            <Save size={16} aria-hidden /> Хадгалах
          </button>
        </div>
      ) : (
        <p className={styles.readOnlyNote}>Танд зөвхөн харах эрх байна.</p>
      )}
    </form>
  );
}
