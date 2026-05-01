"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, Repeat2, Route, Truck, Users, X } from "lucide-react";

import type {
  GarbageWeeklyTemplate,
  GarbageWeeklyTemplateDay,
  GarbageWeeklyTemplateDays,
  GarbageWeeklyTemplateInput,
} from "@/lib/garbage-weekly-template-types";
import {
  EMPTY_GARBAGE_WEEKLY_TEMPLATE_DAYS,
  GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS,
  selectedGarbageWeeklyTemplateDayLabels,
  shareGarbageWeeklyTemplateDays,
} from "@/lib/garbage-weekly-template-types";

import styles from "./garbage-routes.module.css";

type Option = {
  id: number;
  label: string;
  meta?: string;
};

type WeeklyTemplatePanelProps = {
  routes: Option[];
  vehicles: Option[];
  teams: Option[];
};

type FormState = {
  routeId: string;
  vehicleId: string;
  teamId: string;
  active: boolean;
  note: string;
};

type ActiveEditor = {
  day: GarbageWeeklyTemplateDay;
  templateId?: string;
};

type WeeklyTemplateResponse = {
  templates?: GarbageWeeklyTemplate[];
  error?: string;
};

const STORAGE_KEY = "garbage-weekly-templates:v1";

const EMPTY_FORM: FormState = {
  routeId: "",
  vehicleId: "",
  teamId: "",
  active: true,
  note: "",
};

function dayOnly(day: GarbageWeeklyTemplateDay): GarbageWeeklyTemplateDays {
  return { ...EMPTY_GARBAGE_WEEKLY_TEMPLATE_DAYS, [day]: true };
}

function optionLabel(options: Option[], id: string, fallback: string) {
  return options.find((option) => String(option.id) === id)?.label || fallback;
}

function vehicleCode(label: string) {
  return label.split(" - ")[0]?.trim() || label;
}

function isWeeklyTemplate(value: unknown): value is GarbageWeeklyTemplate {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<GarbageWeeklyTemplate>;
  return Boolean(record.id && record.routeId && record.vehicleId && record.teamId && record.days);
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Мэдээлэл ачаалж чадсангүй.");
  }
  return payload as WeeklyTemplateResponse;
}

export function GarbageWeeklyTemplatePanel({ routes, vehicles, teams }: WeeklyTemplatePanelProps) {
  const [templates, setTemplates] = useState<GarbageWeeklyTemplate[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editor, setEditor] = useState<ActiveEditor | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const toPayload = useCallback(
    (template: GarbageWeeklyTemplate | FormState, day?: GarbageWeeklyTemplateDay): GarbageWeeklyTemplateInput => {
      const days = "days" in template ? template.days : dayOnly(day ?? "monday");
      const routeId = template.routeId;
      const vehicleId = template.vehicleId;
      const teamId = template.teamId;

      return {
        routeId,
        routeName: "routeName" in template
          ? template.routeName
          : optionLabel(routes, routeId, `#${routeId}`),
        vehicleId,
        vehicleName: "vehicleName" in template
          ? template.vehicleName
          : optionLabel(vehicles, vehicleId, `#${vehicleId}`),
        teamId,
        teamName: "teamName" in template
          ? template.teamName
          : optionLabel(teams, teamId, `#${teamId}`),
        days,
        active: template.active,
        note: template.note?.trim(),
      };
    },
    [routes, teams, vehicles],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      setLoading(true);
      try {
        const response = await fetch("/api/garbage-routes/weekly-templates", { cache: "no-store" });
        const payload = await readJson(response);
        const serverTemplates = Array.isArray(payload.templates) ? payload.templates.filter(isWeeklyTemplate) : [];

        if (!cancelled) {
          setTemplates(serverTemplates);
        }

        if (serverTemplates.length === 0) {
          await migrateLocalTemplates();
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Мэдээлэл ачаалж чадсангүй.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function migrateLocalTemplates() {
      let saved: unknown = [];
      try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch {
        saved = [];
      }

      const localTemplates = Array.isArray(saved) ? saved.filter(isWeeklyTemplate) : [];
      if (localTemplates.length === 0) {
        return;
      }

      let latestTemplates: GarbageWeeklyTemplate[] = [];
      for (const template of localTemplates) {
        try {
          const response = await fetch("/api/garbage-routes/weekly-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toPayload(template)),
          });
          const payload = await readJson(response);
          latestTemplates = Array.isArray(payload.templates) ? payload.templates.filter(isWeeklyTemplate) : latestTemplates;
        } catch {
          // Duplicate local samples should not block the page from loading.
        }
      }

      if (!cancelled && latestTemplates.length) {
        setTemplates(latestTemplates);
      }
    }

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [toPayload]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  const activeCount = templates.filter((template) => template.active).length;
  const assignmentCount = templates.reduce(
    (total, template) => total + selectedGarbageWeeklyTemplateDayLabels(template.days).length,
    0,
  );
  const busiestDayCount = Math.max(
    0,
    ...GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS.map(({ key }) => templates.filter((template) => template.days[key]).length),
  );
  const rowCount = Math.max(4, busiestDayCount + 1);
  const rows = Array.from({ length: rowCount }, (_, index) => index);

  const templatesByDay = useMemo(() => {
    return GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS.reduce(
      (accumulator, { key }) => ({
        ...accumulator,
        [key]: templates.filter((template) => template.days[key]),
      }),
      {} as Record<GarbageWeeklyTemplateDay, GarbageWeeklyTemplate[]>,
    );
  }, [templates]);

  function openEditor(day: GarbageWeeklyTemplateDay, template?: GarbageWeeklyTemplate) {
    setEditor({ day, templateId: template?.id });
    setForm(
      template
        ? {
            routeId: template.routeId,
            vehicleId: template.vehicleId,
            teamId: template.teamId,
            active: template.active,
            note: template.note || "",
          }
        : EMPTY_FORM,
    );
    setError("");
  }

  function closeEditor() {
    setEditor(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function validate(day: GarbageWeeklyTemplateDay) {
    if (!form.routeId) {
      return "Маршрут сонгоно уу";
    }
    if (!form.vehicleId) {
      return "Машин сонгоно уу";
    }
    if (!form.teamId) {
      return "Баг сонгоно уу";
    }

    const nextDays = dayOnly(day);
    const comparableTemplates = templates.filter((template) => template.id !== editor?.templateId);
    const hasVehicleConflict = comparableTemplates.some(
      (template) => template.vehicleId === form.vehicleId && shareGarbageWeeklyTemplateDays(template.days, nextDays),
    );
    if (hasVehicleConflict) {
      return "Энэ машин сонгосон өдөр аль хэдийн өөр загварт оноогдсон байна.";
    }

    const hasTeamConflict = comparableTemplates.some(
      (template) => template.teamId === form.teamId && shareGarbageWeeklyTemplateDays(template.days, nextDays),
    );
    if (hasTeamConflict) {
      return "Энэ баг сонгосон өдөр аль хэдийн өөр загварт оноогдсон байна.";
    }

    return "";
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || saving) {
      return;
    }

    const validationMessage = validate(editor.day);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setSaving(true);
    try {
      const targetUrl = editor.templateId
        ? `/api/garbage-routes/weekly-templates/${encodeURIComponent(editor.templateId)}`
        : "/api/garbage-routes/weekly-templates";
      const response = await fetch(targetUrl, {
        method: editor.templateId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form, editor.day)),
      });
      const payload = await readJson(response);
      setTemplates(Array.isArray(payload.templates) ? payload.templates.filter(isWeeklyTemplate) : []);
      closeEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Хадгалах үед алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/garbage-routes/weekly-templates/${encodeURIComponent(templateId)}`, {
        method: "DELETE",
      });
      const payload = await readJson(response);
      setTemplates(Array.isArray(payload.templates) ? payload.templates.filter(isWeeklyTemplate) : []);
      if (editor?.templateId === templateId) {
        closeEditor();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Устгах үед алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  }

  function renderTemplateCard(template: GarbageWeeklyTemplate) {
    const routeName = optionLabel(routes, template.routeId, template.routeName || `#${template.routeId}`);
    const vehicleName = optionLabel(vehicles, template.vehicleId, template.vehicleName || `#${template.vehicleId}`);
    const teamName = optionLabel(teams, template.teamId, template.teamName || `#${template.teamId}`);
    const dayKey = GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS.find((day) => template.days[day.key])?.key ?? "monday";

    return (
      <button
        type="button"
        className={styles.weekMatrixCard}
        onClick={() => openEditor(dayKey, template)}
      >
        <span>
          <Route aria-hidden size={15} /> Маршрут: {routeName}
        </span>
        <span>
          <Truck aria-hidden size={15} /> Машин: {vehicleCode(vehicleName)}
        </span>
        <span>
          <Users aria-hidden size={15} /> Баг: {teamName}
        </span>
      </button>
    );
  }

  return (
    <section className={styles.weeklyTemplateShell}>
      <div className={styles.weekMatrixHeader}>
        <div>
          <span className={styles.eyebrow}>Долоо хоногийн тохиргоо</span>
          <h2>Долоо хоногийн загвар</h2>
        </div>
        <div className={styles.weekMatrixHeaderActions}>
          <span className={styles.badge}>{templates.length} загвар</span>
          <span className={styles.repeatBadge}>
            <Repeat2 aria-hidden size={18} /> 7 хоног бүр давтагдана
          </span>
        </div>
      </div>

      {loading ? <div className={styles.notice}>Мэдээлэл ачаалж байна...</div> : null}
      {error && !editor ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.weekMatrix}>
        <div className={styles.weekMatrixTopCell}>№</div>
        {GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS.map((day) => (
          <div key={day.key} className={styles.weekMatrixDayHead}>
            <strong>{day.label}</strong>
            <button type="button" onClick={() => openEditor(day.key)}>
              <Plus aria-hidden size={17} /> Нэмэх
            </button>
          </div>
        ))}

        {rows.map((rowIndex) => (
          <div className={styles.weekMatrixRow} key={rowIndex}>
            <div className={styles.weekMatrixNumber}>{rowIndex + 1}</div>
            {GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS.map((day) => {
              const template = templatesByDay[day.key][rowIndex];
              const isEditing = Boolean(editor?.templateId) && editor?.day === day.key && editor.templateId === template?.id;
              const isAdding = editor?.day === day.key && !editor.templateId && !template && rowIndex === templatesByDay[day.key].length;

              return (
                <div className={styles.weekMatrixCell} key={day.key}>
                  {template ? renderTemplateCard(template) : (
                    <button type="button" className={styles.weekMatrixEmpty} onClick={() => openEditor(day.key)}>
                      <Plus aria-hidden size={20} />
                      <span>Нэмэх</span>
                    </button>
                  )}

                  {(isEditing || isAdding) && editor ? (
                    <form className={styles.weekMatrixPopover} onSubmit={saveTemplate}>
                      <div className={styles.weekMatrixPopoverHeader}>
                        <strong>{day.label} гарагийн оноолт {editor.templateId ? "засах" : "нэмэх"}</strong>
                        <button type="button" aria-label="Хаах" onClick={closeEditor}>
                          <X aria-hidden size={16} />
                        </button>
                      </div>

                      {error ? <div className={styles.error}>{error}</div> : null}

                      <label className={styles.field}>
                        <span>Маршрут</span>
                        <select value={form.routeId} onChange={(event) => setField("routeId", event.target.value)}>
                          <option value="">Маршрут сонгох</option>
                          {routes.map((route) => (
                            <option key={route.id} value={route.id}>
                              {route.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field}>
                        <span>Машин</span>
                        <select value={form.vehicleId} onChange={(event) => setField("vehicleId", event.target.value)}>
                          <option value="">Машин сонгох</option>
                          {vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field}>
                        <span>Баг</span>
                        <select value={form.teamId} onChange={(event) => setField("teamId", event.target.value)}>
                          <option value="">Баг сонгох</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field}>
                        <span>Төлөв</span>
                        <select
                          value={form.active ? "active" : "inactive"}
                          onChange={(event) => setField("active", event.target.value === "active")}
                        >
                          <option value="active">Идэвхтэй</option>
                          <option value="inactive">Идэвхгүй</option>
                        </select>
                      </label>

                      <label className={styles.repeatNote}>
                        <Repeat2 aria-hidden size={16} /> Энэ тохиргоо долоо хоног бүр давтагдана
                      </label>

                      <label className={styles.field}>
                        <span>Тайлбар</span>
                        <textarea
                          value={form.note}
                          rows={2}
                          placeholder="Жишээ: Өглөөний ээлж"
                          onChange={(event) => setField("note", event.target.value)}
                        />
                      </label>

                      <div className={styles.weekMatrixFormActions}>
                        <button type="submit" className={styles.primaryButton} disabled={saving}>
                          {saving ? "Хадгалж байна..." : "Хадгалах"}
                        </button>
                        <button type="button" onClick={closeEditor} disabled={saving}>
                          Болих
                        </button>
                        {editor.templateId ? (
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() => deleteTemplate(editor.templateId!)}
                            disabled={saving}
                          >
                            Устгах
                          </button>
                        ) : null}
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.weekMatrixSummary}>
        <span>
          <CheckCircle2 aria-hidden size={22} /> Идэвхтэй: {activeCount}
        </span>
        <span>
          <Truck aria-hidden size={22} /> Машин оноолт: {assignmentCount}
        </span>
        <span>
          <Users aria-hidden size={22} /> Баг оноолт: {assignmentCount}
        </span>
        <span>
          <CalendarDays aria-hidden size={22} /> Загвар: {templates.length}
        </span>
      </div>
    </section>
  );
}
