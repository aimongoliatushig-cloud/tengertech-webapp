"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, Repeat2, Route, Truck, Users, X } from "lucide-react";

import styles from "./garbage-routes.module.css";

type TemplateDays = {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
};

type Option = {
  id: number;
  label: string;
  meta?: string;
};

export interface GarbageWeeklyTemplate {
  id: string;
  routeId: string;
  vehicleId: string;
  teamId: string;
  days: TemplateDays;
  active: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

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
  day: keyof TemplateDays;
  templateId?: string;
};

const STORAGE_KEY = "garbage-weekly-templates:v1";

const EMPTY_DAYS: TemplateDays = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
};

const WEEKDAYS: Array<{ key: keyof TemplateDays; label: string }> = [
  { key: "monday", label: "Даваа" },
  { key: "tuesday", label: "Мягмар" },
  { key: "wednesday", label: "Лхагва" },
  { key: "thursday", label: "Пүрэв" },
  { key: "friday", label: "Баасан" },
  { key: "saturday", label: "Бямба" },
  { key: "sunday", label: "Ням" },
];

const EMPTY_FORM: FormState = {
  routeId: "",
  vehicleId: "",
  teamId: "",
  active: true,
  note: "",
};

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `weekly-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dayOnly(day: keyof TemplateDays): TemplateDays {
  return { ...EMPTY_DAYS, [day]: true };
}

function selectedDayLabels(days: TemplateDays) {
  return WEEKDAYS.filter(({ key }) => days[key]).map(({ label }) => label);
}

function sharedDays(left: TemplateDays, right: TemplateDays) {
  return WEEKDAYS.some(({ key }) => left[key] && right[key]);
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

export function GarbageWeeklyTemplatePanel({ routes, vehicles, teams }: WeeklyTemplatePanelProps) {
  const [templates, setTemplates] = useState<GarbageWeeklyTemplate[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editor, setEditor] = useState<ActiveEditor | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
      setTemplates(Array.isArray(saved) ? saved.filter(isWeeklyTemplate) : []);
    } catch {
      setTemplates([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    }
  }, [loaded, templates]);

  const activeCount = templates.filter((template) => template.active).length;
  const assignmentCount = templates.reduce((total, template) => total + selectedDayLabels(template.days).length, 0);
  const busiestDayCount = Math.max(...WEEKDAYS.map(({ key }) => templates.filter((template) => template.days[key]).length));
  const rowCount = Math.max(
    4,
    busiestDayCount + 1,
  );
  const rows = Array.from({ length: rowCount }, (_, index) => index);

  const templatesByDay = useMemo(() => {
    return WEEKDAYS.reduce(
      (accumulator, { key }) => ({
        ...accumulator,
        [key]: templates.filter((template) => template.days[key]),
      }),
      {} as Record<keyof TemplateDays, GarbageWeeklyTemplate[]>,
    );
  }, [templates]);

  function openEditor(day: keyof TemplateDays, template?: GarbageWeeklyTemplate) {
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

  function validate(day: keyof TemplateDays) {
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
      (template) => template.vehicleId === form.vehicleId && sharedDays(template.days, nextDays),
    );
    if (hasVehicleConflict) {
      return "Энэ машин сонгосон өдөр аль хэдийн өөр загварт оноогдсон байна.";
    }

    const hasTeamConflict = comparableTemplates.some(
      (template) => template.teamId === form.teamId && sharedDays(template.days, nextDays),
    );
    if (hasTeamConflict) {
      return "Энэ баг сонгосон өдөр аль хэдийн өөр загварт оноогдсон байна.";
    }

    return "";
  }

  function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) {
      return;
    }

    const validationMessage = validate(editor.day);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    const now = new Date().toISOString();
    if (editor.templateId) {
      setTemplates((current) =>
        current.map((template) =>
          template.id === editor.templateId
            ? {
                ...template,
                routeId: form.routeId,
                vehicleId: form.vehicleId,
                teamId: form.teamId,
                days: dayOnly(editor.day),
                active: form.active,
                note: form.note.trim(),
                updatedAt: now,
              }
            : template,
        ),
      );
    } else {
      setTemplates((current) => [
        ...current,
        {
          id: makeId(),
          routeId: form.routeId,
          vehicleId: form.vehicleId,
          teamId: form.teamId,
          days: dayOnly(editor.day),
          active: form.active,
          note: form.note.trim(),
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    closeEditor();
  }

  function deleteTemplate(templateId: string) {
    setTemplates((current) => current.filter((template) => template.id !== templateId));
    if (editor?.templateId === templateId) {
      closeEditor();
    }
  }

  function renderTemplateCard(template: GarbageWeeklyTemplate) {
    const routeName = optionLabel(routes, template.routeId, `#${template.routeId}`);
    const vehicleName = optionLabel(vehicles, template.vehicleId, `#${template.vehicleId}`);
    const teamName = optionLabel(teams, template.teamId, `#${template.teamId}`);
    const dayKey = WEEKDAYS.find((day) => template.days[day.key])?.key ?? "monday";

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

      <div className={styles.weekMatrix}>
        <div className={styles.weekMatrixTopCell}>№</div>
        {WEEKDAYS.map((day) => (
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
            {WEEKDAYS.map((day) => {
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
                        <button type="submit" className={styles.primaryButton}>
                          Хадгалах
                        </button>
                        <button type="button" onClick={closeEditor}>
                          Болих
                        </button>
                        {editor.templateId ? (
                          <button type="button" className={styles.dangerButton} onClick={() => deleteTemplate(editor.templateId!)}>
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
