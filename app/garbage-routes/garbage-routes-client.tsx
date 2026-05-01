"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  Route,
  Save,
  Send,
} from "lucide-react";

import styles from "./garbage-routes.module.css";
import { GarbageWeeklyTemplatePanel } from "./weekly-template-panel";

type Permissions = Record<string, boolean>;
type Option = { id: number; label: string; meta?: string; pointIds?: number[]; pointNames?: string[] };
type OptionsData = {
  permissions: Permissions;
  roleLabel: string;
  vehicles: Option[];
  drivers: Option[];
  collectors: Option[];
  inspectors: Option[];
  teams: Option[];
  routes: Option[];
  points: Option[];
  departments: Option[];
  weekdays: Option[];
  issueTypes: string[];
  changeReasons: string[];
};
type Stop = {
  id: number;
  sequence: number;
  pointName: string;
  status: string;
  statusLabel: string;
  proofCount: number;
  issueCount: number;
  skipReason: string;
  arrivedAt: string;
  completedAt: string;
};
type RouteTask = {
  id: number;
  name: string;
  dateLabel: string;
  vehicleName: string;
  driverName: string;
  collectorNames: string[];
  teamName: string;
  routeName: string;
  statusLabel: string;
  progress: number;
  stopCount: number;
  completedStopCount: number;
  skippedStopCount: number;
  issueCount: number;
  nextPointName: string;
  changed: boolean;
  lastChangeReason: string;
  href: string;
  stops: Stop[];
};
type AssignmentDraft = {
  weekday: string;
  vehicleId: string;
  driverId: string;
  collector1Id: string;
  collector2Id: string;
  teamId: string;
  routeId: string;
  pointIds: number[];
};

type WeeklyPlanLine = {
  id: number;
  weekdayLabel: string;
  vehicleName: string;
  driverName: string;
  collectorNames: string[];
  routeName: string;
  pointNames: string[];
};

type WeeklyPlanDetail = {
  id: number;
  name: string;
  lines: WeeklyPlanLine[];
};

type ProofItem = {
  id: number;
  typeLabel: string;
  name: string;
  uploadedAt: string;
};

type IssueItem = {
  id: number;
  title: string;
  description: string;
};

type InspectionItem = {
  id: number;
  title: string;
  routeName: string;
  inspector: string;
  date: string;
  severity: string;
};

type DashboardRow = {
  label: string;
  value: number;
  total: number;
  status: string;
  route?: string;
};

type DashboardData = {
  kpis: Array<{ label: string; value: string }>;
  byVehicle: DashboardRow[];
  byDriver: DashboardRow[];
  byPoint: DashboardRow[];
};

const emptyAssignment: AssignmentDraft = {
  weekday: "0",
  vehicleId: "",
  driverId: "",
  collector1Id: "",
  collector2Id: "",
  teamId: "",
  routeId: "",
  pointIds: [],
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Мэдээлэл ачаалж чадсангүй.");
  }
  return payload as T;
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchJson<T>(url));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Мэдээлэл ачаалж чадсангүй.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

function numberOrNull(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function ShellHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}>Хог тээврийн маршрут</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function GarbageNav() {
  return (
    <nav className={styles.subnav} aria-label="Хог тээврийн маршрутын цэс">
      <Link href="/garbage-routes/weekly-plan">
        <ListChecks aria-hidden /> Долоо хоног
      </Link>
      <Link href="/garbage-routes/today">
        <Route aria-hidden /> Өнөөдрийн маршрут
      </Link>
      <Link href="/garbage-routes/inspections">
        <ClipboardCheck aria-hidden /> Хяналтын тайлан
      </Link>
      <Link href="/garbage-routes/dashboard">
        <LayoutDashboard aria-hidden /> Самбар
      </Link>
    </nav>
  );
}

function StatusPanel({ loading, error }: { loading: boolean; error: string }) {
  if (loading) {
    return <div className={styles.notice}>Мэдээлэл ачаалж байна...</div>;
  }
  if (error) {
    return <div className={styles.error}>{error}</div>;
  }
  return null;
}

function StatusBadge({ label }: { label: string }) {
  const tone = label.includes("Асуудал") || label.includes("Дутуу") ? styles.badgeWarn : label.includes("Дуус") ? styles.badgeDone : "";
  return <span className={`${styles.badge} ${tone}`}>{label}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.meta ? ` - ${option.meta}` : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function WeeklyPlanListClient() {
  const { data: options, loading, error } = useApi<OptionsData>("/api/garbage-routes/options");

  return (
    <div className={styles.page}>
      <StatusPanel loading={loading} error={error} />
      {options ? (
        <GarbageWeeklyTemplatePanel
          routes={options.routes}
          vehicles={options.vehicles}
          teams={options.teams}
        />
      ) : null}
    </div>
  );
}

function RoutePointPicker({
  options,
  assignment,
  onChange,
}: {
  options: OptionsData;
  assignment: AssignmentDraft;
  onChange: (next: AssignmentDraft) => void;
}) {
  const pointById = new Map(options.points.map((point) => [point.id, point]));
  const selectedRoute = options.routes.find((route) => String(route.id) === assignment.routeId);

  function addPoint(value: string) {
    const id = numberOrNull(value);
    if (!id || assignment.pointIds.includes(id)) {
      return;
    }
    onChange({ ...assignment, pointIds: [...assignment.pointIds, id] });
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...assignment.pointIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) {
      return;
    }
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...assignment, pointIds: next });
  }

  function remove(id: number) {
    onChange({ ...assignment, pointIds: assignment.pointIds.filter((item) => item !== id) });
  }

  function setRoute(routeId: string) {
    const route = options.routes.find((item) => String(item.id) === routeId);
    onChange({ ...assignment, routeId, pointIds: route?.pointIds ?? [] });
  }

  function onDrop(sourceIndex: number, targetIndex: number) {
    const next = [...assignment.pointIds];
    const [item] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, item);
    onChange({ ...assignment, pointIds: next });
  }

  return (
    <div className={styles.routeBuilder}>
      <SelectField
        label="Маршрут"
        value={assignment.routeId}
        options={options.routes}
        placeholder="Маршрут сонгох"
        onChange={setRoute}
      />
      <Field label="Хогийн цэг нэмэх">
        <select value="" onChange={(event) => addPoint(event.target.value)}>
          <option value="">Хогийн цэг нэмэх</option>
          {options.points.map((point) => (
            <option key={point.id} value={point.id}>
              {point.label}
            </option>
          ))}
        </select>
      </Field>
      <div className={styles.sequenceHeader}>
        <strong>Маршрутын дараалал</strong>
        <span>{selectedRoute?.label || "Гараар сонгосон цэгүүд"}</span>
      </div>
      <ol className={styles.pointList}>
        {assignment.pointIds.map((id, index) => (
          <li
            key={`${id}-${index}`}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(Number(event.dataTransfer.getData("text/plain")), index)}
          >
            <span>
              {index + 1}. {pointById.get(id)?.label ?? `Цэг #${id}`}
            </span>
            <div>
              <button type="button" onClick={() => move(index, -1)}>Дээш</button>
              <button type="button" onClick={() => move(index, 1)}>Доош</button>
              <button type="button" onClick={() => remove(id)}>Хасах</button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function WeeklyPlanFormClient({ planId }: { planId?: number }) {
  const { data: options, loading, error } = useApi<OptionsData>("/api/garbage-routes/options");
  const [name, setName] = useState("");
  const [referenceDate, setReferenceDate] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([{ ...emptyAssignment }]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("Хадгалж байна...");
    const payload = {
      name,
      referenceDate,
      departmentId: numberOrNull(departmentId),
      assignments: assignments.map((item) => ({
        weekday: item.weekday,
        vehicleId: numberOrNull(item.vehicleId),
        driverId: numberOrNull(item.driverId),
        collectorIds: [numberOrNull(item.collector1Id), numberOrNull(item.collector2Id)].filter((id): id is number => Boolean(id)),
        teamId: numberOrNull(item.teamId),
        routeId: numberOrNull(item.routeId),
        pointIds: item.pointIds,
      })),
    };
    try {
      const result = await fetchJson<{ id: number }>(planId ? `/api/garbage-routes/weekly-plans/${planId}` : "/api/garbage-routes/weekly-plans", {
        method: planId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      window.location.href = `/garbage-routes/weekly-plan/${result.id}`;
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Хадгалах үед алдаа гарлаа.");
      setSubmitting(false);
    }
  }

  function updateAssignment(index: number, next: AssignmentDraft) {
    setAssignments((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)));
  }

  return (
    <div className={styles.page}>
      <ShellHeader title="Шинэ төлөвлөгөө" subtitle="Өдөр, машин, жолооч, 2 ачигч болон цэгийн дарааллыг оруулна." />
      <GarbageNav />
      <StatusPanel loading={loading} error={error} />
      {options ? (
        <form className={styles.formPanel} onSubmit={submit}>
          {message ? <div className={message.includes("алдаа") || message.includes("эрх") ? styles.error : styles.notice}>{message}</div> : null}
          <div className={styles.formGrid}>
            <Field label="Төлөвлөгөөний нэр">
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Долоо хоног сонгох">
              <input
                value={referenceDate}
                onChange={(event) => setReferenceDate(event.target.value)}
                placeholder="Жишээ: 2026-05-04"
                inputMode="numeric"
                required
              />
            </Field>
            <SelectField label="Хэлтэс" value={departmentId} options={options.departments} placeholder="Хэлтэс сонгох" onChange={setDepartmentId} />
          </div>
          {assignments.map((assignment, index) => (
            <section className={styles.assignmentCard} key={index}>
              <div className={styles.panelHeader}>
                <h2>Баг оноох</h2>
                <button type="button" onClick={() => setAssignments((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                  Хасах
                </button>
              </div>
              <div className={styles.formGrid}>
                <SelectField label="Өдөр сонгох" value={assignment.weekday} options={options.weekdays} placeholder="Өдөр сонгох" onChange={(value) => updateAssignment(index, { ...assignment, weekday: value })} />
                <SelectField label="Машин сонгох" value={assignment.vehicleId} options={options.vehicles} placeholder="Машин сонгох" onChange={(value) => updateAssignment(index, { ...assignment, vehicleId: value })} />
                <SelectField label="Жолооч сонгох" value={assignment.driverId} options={options.drivers} placeholder="Жолооч сонгох" onChange={(value) => updateAssignment(index, { ...assignment, driverId: value })} />
                <SelectField label="Хог ачигч 1" value={assignment.collector1Id} options={options.collectors} placeholder="Ачигч сонгох" onChange={(value) => updateAssignment(index, { ...assignment, collector1Id: value })} />
                <SelectField label="Хог ачигч 2" value={assignment.collector2Id} options={options.collectors} placeholder="Ачигч сонгох" onChange={(value) => updateAssignment(index, { ...assignment, collector2Id: value })} />
                <SelectField label="Экипаж" value={assignment.teamId} options={options.teams} placeholder="Баг сонгох" onChange={(value) => updateAssignment(index, { ...assignment, teamId: value })} />
              </div>
              <RoutePointPicker options={options} assignment={assignment} onChange={(next) => updateAssignment(index, next)} />
            </section>
          ))}
          <div className={styles.formActions}>
            <button type="button" onClick={() => setAssignments((items) => [...items, { ...emptyAssignment }])}>
              <PlusCircle aria-hidden /> Өдөр нэмэх
            </button>
            <button type="submit" disabled={submitting}>
              <Save aria-hidden /> Хадгалах
            </button>
            <button type="submit" className={styles.primaryButton} disabled={submitting}>
              <Send aria-hidden /> Илгээх
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function WeeklyPlanDetailClient({ planId }: { planId: number }) {
  const { data, loading, error } = useApi<{ permissions: Permissions; plan: WeeklyPlanDetail }>(`/api/garbage-routes/weekly-plans/${planId}`);
  const plan = data?.plan;
  return (
    <div className={styles.page}>
      <ShellHeader
        title={plan?.name ?? "Маршрутын мэдээлэл"}
        subtitle="Хэлтсийн дарга машин, жолооч, ачигч болон цэгийн дарааллыг хянана."
        action={data?.permissions.weekly_edit ? <Link className={styles.primaryAction} href="/garbage-routes/weekly-plan/new">Засах</Link> : null}
      />
      <GarbageNav />
      <StatusPanel loading={loading} error={error} />
      {plan ? (
        <section className={styles.detailGrid}>
          {plan.lines.map((line) => (
            <article className={styles.panel} key={line.id}>
              <div className={styles.panelHeader}>
                <h2>{line.weekdayLabel}</h2>
                <StatusBadge label={`${line.pointNames.length} хогийн цэг`} />
              </div>
              <div className={styles.metaGrid}>
                <span>Машин<strong>{line.vehicleName}</strong></span>
                <span>Жолооч<strong>{line.driverName}</strong></span>
                <span>Ачигчид<strong>{line.collectorNames.join(", ") || "Оноогоогүй"}</strong></span>
                <span>Маршрут<strong>{line.routeName}</strong></span>
              </div>
              <ol className={styles.compactList}>
                {line.pointNames.map((point: string, index: number) => <li key={`${point}-${index}`}>{index + 1}. {point}</li>)}
              </ol>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function TodayRouteClient() {
  const { data, loading, error } = useApi<{ permissions: Permissions; dateLabel: string; routes: RouteTask[] }>("/api/garbage-routes/today");
  return (
    <div className={styles.page}>
      <ShellHeader title="Өнөөдрийн маршрут" subtitle="Жолооч болон хог ачигч өөрийн багийн өнөөдрийн дараалалтай маршрутыг харна." />
      <GarbageNav />
      <StatusPanel loading={loading} error={error} />
      <section className={styles.mobileRouteGrid}>
        {(data?.routes ?? []).map((route) => (
          <article className={styles.driverCard} key={route.id}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{route.vehicleName}</h2>
                <p>{route.dateLabel}</p>
              </div>
              <StatusBadge label={route.statusLabel} />
            </div>
            <div className={styles.progressLine}><span style={{ width: `${Math.min(100, route.progress || (route.stopCount ? route.completedStopCount / route.stopCount * 100 : 0))}%` }} /></div>
            <div className={styles.metaGrid}>
              <span>Баг<strong>{[route.driverName, ...route.collectorNames].join(", ")}</strong></span>
              <span>Нийт хогийн цэг<strong>{route.stopCount}</strong></span>
              <span>Дууссан цэг<strong>{route.completedStopCount}</strong></span>
              <span>Дараагийн очих цэг<strong>{route.nextPointName}</strong></span>
            </div>
            <ol className={styles.stopList}>
              {route.stops.map((stop) => (
                <li key={stop.id}>
                  <span>{stop.sequence}. {stop.pointName}</span>
                  <StatusBadge label={stop.statusLabel} />
                </li>
              ))}
            </ol>
            <Link className={styles.primaryAction} href={`/garbage-routes/execution/${route.id}`}>
              Маршрут гүйцэтгэх
            </Link>
          </article>
        ))}
        {!loading && !(data?.routes ?? []).length ? <div className={styles.empty}>Өнөөдрийн маршрут олдсонгүй.</div> : null}
      </section>
    </div>
  );
}

function StopActionPanel({ stop, refresh }: { stop: Stop; refresh: () => void }) {
  const [message, setMessage] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [issueType, setIssueType] = useState("Бусад");
  const [note, setNote] = useState("");

  async function postJson(path: string, body: unknown) {
    setMessage("Хадгалж байна...");
    try {
      await fetchJson(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setMessage("Амжилттай хадгаллаа.");
      refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Хадгалах үед алдаа гарлаа.");
    }
  }

  async function upload(path: string, file?: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    setMessage("Зураг байршуулж байна...");
    try {
      await fetchJson(path, { method: "POST", body: formData });
      setMessage("Зураг хавсарлаа.");
      refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Зураг хавсаргах үед алдаа гарлаа.");
    }
  }

  async function sendIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("issueType", issueType);
    form.set("note", note);
    setMessage("Хадгалж байна...");
    try {
      await fetchJson(`/api/garbage-routes/points/${stop.id}/issue`, { method: "POST", body: form });
      setMessage("Асуудал тэмдэглэгдлээ.");
      refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Хадгалах үед алдаа гарлаа.");
    }
  }

  return (
    <article className={styles.stopCard}>
      <div className={styles.panelHeader}>
        <h2>{stop.sequence}. {stop.pointName}</h2>
        <StatusBadge label={stop.statusLabel} />
      </div>
      {message ? <div className={message.includes("алдаа") || message.includes("дуусгаагүй") ? styles.error : styles.notice}>{message}</div> : null}
      <div className={styles.actionGrid}>
        <Field label="Алгасах шалтгаан">
          <input value={skipReason} onChange={(event) => setSkipReason(event.target.value)} placeholder="Шаардлагатай үед оруулна" />
        </Field>
        <button type="button" onClick={() => postJson(`/api/garbage-routes/points/${stop.id}/arrived`, { skipReason })}>Очсон</button>
        <label className={styles.fileButton}>
          <Camera aria-hidden /> Өмнөх зураг авах
          <input type="file" accept="image/*" capture="environment" onChange={(event) => upload(`/api/garbage-routes/points/${stop.id}/upload-before`, event.target.files?.[0])} />
        </label>
        <label className={styles.fileButton}>
          <Camera aria-hidden /> Дараах зураг авах
          <input type="file" accept="image/*" capture="environment" onChange={(event) => upload(`/api/garbage-routes/points/${stop.id}/upload-after`, event.target.files?.[0])} />
        </label>
        <button type="button" className={styles.primaryButton} onClick={() => postJson(`/api/garbage-routes/points/${stop.id}/complete`, { note })}>
          <CheckCircle2 aria-hidden /> Дууссан
        </button>
      </div>
      <form className={styles.issueForm} onSubmit={sendIssue}>
        <select value={issueType} onChange={(event) => setIssueType(event.target.value)}>
          {["Хог байхгүй", "Зам хаалттай", "Машин эвдэрсэн", "Иргэн саад болсон", "Цэг олдоогүй", "Бусад"].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Тайлбар" />
        <input name="file" type="file" accept="image/*" capture="environment" />
        <button type="submit"><AlertTriangle aria-hidden /> Асуудалтай</button>
      </form>
    </article>
  );
}

export function ExecutionClient({ routeId }: { routeId: number }) {
  const { data, loading, error, refresh } = useApi<{ permissions: Permissions; route: RouteTask; proofs: ProofItem[]; issues: IssueItem[] }>(`/api/garbage-routes/daily/${routeId}`);
  const route = data?.route;
  return (
    <div className={styles.page}>
      <ShellHeader title={route?.vehicleName ?? "Маршрут гүйцэтгэл"} subtitle="Цэг бүр дээр очсон, өмнөх зураг, дараах зураг, дууссан төлөвийг дарааллаар бүртгэнэ." />
      <GarbageNav />
      <StatusPanel loading={loading} error={error} />
      {route ? (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Маршрутын мэдээлэл</h2>
              <StatusBadge label={route.changed ? "Өдрийн явцад өөрчлөгдсөн" : route.statusLabel} />
            </div>
            <div className={styles.metaGrid}>
              <span>Машин<strong>{route.vehicleName}</strong></span>
              <span>Жолооч<strong>{route.driverName}</strong></span>
              <span>Баг<strong>{route.collectorNames.join(", ") || "Оноогоогүй"}</strong></span>
              <span>Явц<strong>{route.completedStopCount}/{route.stopCount}</strong></span>
            </div>
          </section>
          <section className={styles.executionGrid}>
            {route.stops.map((stop) => <StopActionPanel key={stop.id} stop={stop} refresh={refresh} />)}
          </section>
          <section className={styles.detailGrid}>
            <article className={styles.panel}><h2>Гүйцэтгэлийн зураг</h2>{data.proofs.map((proof) => <p key={proof.id}>{proof.typeLabel}: {proof.name} · {proof.uploadedAt}</p>)}</article>
            <article className={styles.panel}><h2>Асуудал / тайлбар</h2>{data.issues.map((issue) => <p key={issue.id}>{issue.title}: {issue.description}</p>)}</article>
          </section>
        </>
      ) : null}
    </div>
  );
}

export function InspectionsClient() {
  const { data: options } = useApi<{ routes: RouteTask[] }>("/api/garbage-routes/today");
  const { data, loading, error, refresh } = useApi<{ permissions: Permissions; inspections: InspectionItem[] }>("/api/garbage-routes/inspections");
  const [message, setMessage] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  const stops = useMemo(() => options?.routes.find((route) => String(route.id) === selectedTask)?.stops ?? [], [options, selectedTask]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Хадгалж байна...");
    try {
      await fetchJson("/api/garbage-routes/inspections", { method: "POST", body: new FormData(event.currentTarget) });
      setMessage("Хяналтын тайлан хадгалагдлаа.");
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Хадгалах үед алдаа гарлаа.");
    }
  }

  return (
    <div className={styles.page}>
      <ShellHeader title="Хяналтын тайлан" subtitle="Хяналтын байцаагч маршрут, машин, хогийн цэг сонгож тайлан, зураг, зөрчил болон үнэлгээ оруулна." />
      <GarbageNav />
      <StatusPanel loading={loading} error={error} />
      <form className={styles.formPanel} onSubmit={submit}>
        {message ? <div className={message.includes("алдаа") ? styles.error : styles.notice}>{message}</div> : null}
        <div className={styles.formGrid}>
          <Field label="Огноо"><input name="date" placeholder="Жишээ: 2026-05-01" inputMode="numeric" /></Field>
          <Field label="Машин / маршрут">
            <select name="taskId" value={selectedTask} onChange={(event) => setSelectedTask(event.target.value)} required>
              <option value="">Маршрут сонгох</option>
              {(options?.routes ?? []).map((route) => <option key={route.id} value={route.id}>{route.vehicleName} - {route.routeName}</option>)}
            </select>
          </Field>
          <Field label="Хогийн цэг">
            <select name="stopLineId">
              <option value="">Бүх цэг</option>
              {stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.pointName}</option>)}
            </select>
          </Field>
          <Field label="Зөрчлийн төрөл"><input name="violationType" placeholder="Зөрчлийн төрөл" /></Field>
          <Field label="Үнэлгээ"><input name="rating" placeholder="Үнэлгээ" /></Field>
          <Field label="Зураг хавсаргах"><input name="file" type="file" accept="image/*" capture="environment" /></Field>
        </div>
        <Field label="Хяналтын тайлбар"><textarea name="comment" rows={5} required /></Field>
        <label className={styles.checkRow}><input name="hasViolation" type="checkbox" /> Зөрчил илэрсэн</label>
        <button className={styles.primaryButton} type="submit">Хадгалах</button>
      </form>
      <section className={styles.table}>
        {(data?.inspections ?? []).map((item) => (
          <article className={styles.tableRow} key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.routeName || "Маршрут"}</span>
            <span>{item.inspector}</span>
            <span>{item.date}</span>
            <StatusBadge label={item.severity || "Тайлбар"} />
          </article>
        ))}
      </section>
    </div>
  );
}

export function GarbageDashboardClient() {
  const { data, loading, error } = useApi<DashboardData>("/api/garbage-routes/dashboard");
  return (
    <div className={styles.page}>
      <ShellHeader title="Хог тээврийн явцын самбар" subtitle="Удирдлага өнөөдрийн нийт явц, хоцорсон/дуусаагүй маршрут болон хяналтын тайланг харна." />
      <GarbageNav />
      <StatusPanel loading={loading} error={error} />
      <section className={styles.kpiGrid}>
        {(data?.kpis ?? []).map((kpi) => (
          <article className={styles.kpiCard} key={kpi.label}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
          </article>
        ))}
      </section>
      <section className={styles.detailGrid}>
        <article className={styles.panel}>
          <h2>Машинаар гүйцэтгэл</h2>
          {(data?.byVehicle ?? []).map((item) => <p key={`${item.label}-${item.status}`}>{item.label}: {item.value}/{item.total} · {item.status}</p>)}
        </article>
        <article className={styles.panel}>
          <h2>Жолоочоор гүйцэтгэл</h2>
          {(data?.byDriver ?? []).map((item) => <p key={`${item.label}-${item.status}`}>{item.label}: {item.value}/{item.total} · {item.status}</p>)}
        </article>
        <article className={styles.panel}>
          <h2>Хогийн цэгээр гүйцэтгэл</h2>
          {(data?.byPoint ?? []).slice(0, 12).map((item) => <p key={`${item.label}-${item.route}`}>{item.label}: {item.status}</p>)}
        </article>
      </section>
    </div>
  );
}
