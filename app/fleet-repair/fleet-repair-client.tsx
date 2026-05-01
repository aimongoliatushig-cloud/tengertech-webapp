"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  FileCheck2,
  PackageCheck,
  PlusCircle,
  ReceiptText,
  Scale,
  WalletCards,
  Wrench,
} from "lucide-react";

import styles from "./fleet-repair.module.css";

const LOAD_ERROR_MESSAGE = "Мэдээлэл ачаалж чадсангүй.";
const REQUEST_TIMEOUT_MS = 20_000;

type PermissionKey =
  | "request"
  | "quote"
  | "finance"
  | "contract"
  | "director"
  | "order"
  | "repair";

type Permissions = Record<PermissionKey, boolean>;

type RepairSummary = {
  id: number;
  name: string;
  vehicle: string;
  state: string;
  stateLabel: string;
  totalAmount: number;
  contractRequired: boolean;
  createdAt: string;
  href: string;
};

type RepairQuote = {
  id: number | string;
  supplierName: string;
  amount: number;
  fileIds: number[];
  contractRequired: boolean;
  isSelected: boolean;
};

type RepairDetail = RepairSummary & {
  description: string;
  partsNote: string;
  requester: string;
  selectedSupplier: string;
  paymentState: string;
  contractState: string;
  orderState: string;
  repairNote: string;
  quotes: RepairQuote[];
  attachmentIds: number[];
};

type DashboardData = {
  todayGarbageTons: number;
  repairingVehicles: number;
  waitingParts: number;
  waitingPayment: number;
  contractRequired: number;
  recentRequests: RepairSummary[];
  vehicleOptions: { id: number; label: string }[];
  repairLoadError?: string;
};

type VehicleOptionsData = {
  vehicleOptions: { id: number; label: string }[];
  canCreateRequest?: boolean;
  createDeniedMessage?: string;
};

type RequestListData = {
  permissions: Permissions;
  requests: RepairSummary[];
  repairLoadError?: string;
};

type DetailData = {
  request: RepairDetail;
  permissions: Permissions;
};

type GarbageData = {
  todayTons: number;
  byVehicle: { vehicle: string; tons: number; trips: number }[];
  week: { label: string; tons: number }[];
  monthTons: number;
};

const steps = [
  "Хүсэлт",
  "Санал",
  "Санхүү",
  "Гэрээ",
  "Захирал",
  "Тушаал",
  "Төлбөр",
  "Сэлбэг",
  "Засвар",
  "Дууссан",
];

function money(value: number) {
  return new Intl.NumberFormat("mn-MN", {
    style: "currency",
    currency: "MNT",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function tons(value: number) {
  return `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 1 }).format(value || 0)} тн`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : LOAD_ERROR_MESSAGE);
  }
  return payload as T;
}

function useApiData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchJson<T>(url));
    } catch {
      setError(LOAD_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, error, loading, refresh };
}

function FleetNav() {
  return (
    <nav className={styles.subnav} aria-label="Засварын цэс">
      <Link href="/fleet-repair/dashboard">Самбар</Link>
      <Link href="/fleet-repair/requests">Хүсэлтүүд</Link>
      <Link href="/fleet-repair/requests/new">Шинэ хүсэлт</Link>
      <Link href="/fleet-repair/garbage-daily">Хогийн мэдээлэл</Link>
    </nav>
  );
}

function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}>Машинууд</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function StateBadge({ request }: { request: RepairSummary }) {
  return (
    <span className={styles.stateBadge}>
      {request.stateLabel}
      {request.contractRequired ? " · Гэрээтэй" : ""}
    </span>
  );
}

function StatusPanel({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry?: () => void;
}) {
  if (loading) {
    return <div className={styles.statusPanel}>Мэдээлэл ачаалж байна...</div>;
  }
  if (error) {
    return (
      <div className={styles.errorPanel}>
        <p>{error}</p>
        {onRetry ? (
          <button type="button" className={styles.secondaryAction} onClick={onRetry}>
            Дахин оролдох
          </button>
        ) : null}
      </div>
    );
  }
  return null;
}

function RequestCards({ requests }: { requests: RepairSummary[] }) {
  if (!requests.length) {
    return <div className={styles.emptyPanel}>Одоогоор засварын хүсэлт алга.</div>;
  }

  return (
    <div className={styles.requestList}>
      {requests.map((request) => (
        <Link key={request.id} href={request.href} className={styles.requestCard}>
          <div>
            <strong>{request.vehicle}</strong>
            <span>{request.name}</span>
          </div>
          <StateBadge request={request} />
          <span>{money(request.totalAmount)}</span>
          <small>{request.createdAt || "Огноо бүртгээгүй"}</small>
        </Link>
      ))}
    </div>
  );
}

export function FleetRepairDashboardClient() {
  const { data, error, loading, refresh } = useApiData<DashboardData>("/api/fleet-repair/dashboard");
  const metrics = [
    { label: "Өнөөдрийн нийт хог", value: tons(data?.todayGarbageTons ?? 0), icon: Scale },
    { label: "Засварт байгаа машин", value: String(data?.repairingVehicles ?? 0), icon: Wrench },
    { label: "Сэлбэг хүлээгдэж байна", value: String(data?.waitingParts ?? 0), icon: PackageCheck },
    { label: "Төлбөр хүлээгдэж байна", value: String(data?.waitingPayment ?? 0), icon: WalletCards },
    { label: "Гэрээ шаардлагатай", value: String(data?.contractRequired ?? 0), icon: FileCheck2 },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Машины засварын хяналтын самбар"
        subtitle="Засвар, сэлбэг, санхүү, гэрээ болон хог тээврийн өнөөдрийн гол үзүүлэлт."
        action={
          <Link href="/fleet-repair/requests/new" className={styles.primaryAction}>
            <PlusCircle aria-hidden />
            Шинэ хүсэлт
          </Link>
        }
      />
      <FleetNav />
      <StatusPanel loading={loading} error={error} onRetry={refresh} />
      {data?.repairLoadError ? <div className={styles.noticePanel}>{data.repairLoadError}</div> : null}
      <section className={styles.metricGrid}>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className={styles.metricCard}>
              <Icon aria-hidden />
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          );
        })}
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Сүүлийн хүсэлтүүд</h2>
          <Link href="/fleet-repair/requests">Бүгдийг харах</Link>
        </div>
        <RequestCards requests={data?.recentRequests ?? []} />
      </section>
    </div>
  );
}

export function FleetRepairRequestsClient() {
  const { data, error, loading, refresh } = useApiData<RequestListData>("/api/fleet-repair/requests");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) {
      return data?.requests ?? [];
    }
    return (data?.requests ?? []).filter((request) =>
      [request.vehicle, request.name, request.stateLabel].join(" ").toLowerCase().includes(value),
    );
  }, [data?.requests, query]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Засварын хүсэлтүүд"
        subtitle="Машин, төлөв, нийт дүн, гэрээний шаардлага болон огноогоор хянах жагсаалт."
        action={
          <Link href="/fleet-repair/requests/new" className={styles.primaryAction}>
            <PlusCircle aria-hidden />
            Үүсгэх
          </Link>
        }
      />
      <FleetNav />
      <div className={styles.filterBar}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Машин, төлөвөөр хайх"
        />
      </div>
      <StatusPanel loading={loading} error={error} onRetry={refresh} />
      {data?.repairLoadError ? <div className={styles.noticePanel}>{data.repairLoadError}</div> : null}
      <div className={styles.tableShell}>
        <div className={styles.tableHeader}>
          <span>Машин</span>
          <span>Төлөв</span>
          <span>Нийт дүн</span>
          <span>Гэрээ шаардлагатай</span>
          <span>Огноо</span>
        </div>
        {filtered.map((request) => (
          <Link key={request.id} href={request.href} className={styles.tableRow}>
            <strong>{request.vehicle}</strong>
            <span>{request.stateLabel}</span>
            <span>{money(request.totalAmount)}</span>
            <span>{request.contractRequired ? "Тийм" : "Үгүй"}</span>
            <span>{request.createdAt || "Бүртгээгүй"}</span>
          </Link>
        ))}
        {!filtered.length && !loading ? <div className={styles.emptyPanel}>Хүсэлт олдсонгүй.</div> : null}
      </div>
    </div>
  );
}

export function FleetRepairNewRequestClient() {
  const { data, error, loading, refresh } =
    useApiData<VehicleOptionsData>("/api/fleet-repair/vehicles");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canCreateRequest = data?.canCreateRequest ?? true;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateRequest) {
      setMessage(data?.createDeniedMessage || "Засварын хүсэлт үүсгэх эрх хүрэхгүй байна.");
      return;
    }
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(form);
    formData.set("mode", submitter?.value === "submit" ? "submit" : "draft");
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/fleet-repair/requests", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Хүсэлт хадгалж чадсангүй.");
      }
      window.location.href = `/fleet-repair/requests/${payload.id}`;
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Хүсэлт хадгалж чадсангүй.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Засварын хүсэлт үүсгэх"
        subtitle="Машин, эвдрэлийн тайлбар, шаардлагатай сэлбэг болон зураг хавсаргана."
      />
      <FleetNav />
      {loading ? <div className={styles.statusPanel}>Машины жагсаалт ачаалж байна...</div> : null}
      {error ? (
        <div className={styles.noticePanel}>
          Машины жагсаалтыг одоогоор уншиж чадсангүй. Хүсэлтийг тайлбартай нь хадгалаад
          дараа нь машинтай холбож болно.
          <button type="button" className={styles.secondaryAction} onClick={refresh}>
            Дахин оролдох
          </button>
        </div>
      ) : null}
      {!loading && !canCreateRequest ? (
        <div className={styles.noticePanel}>
          {data?.createDeniedMessage || "Засварын хүсэлт үүсгэх эрх хүрэхгүй байна."}
        </div>
      ) : null}
      <form className={styles.formPanel} onSubmit={submit}>
        {message ? <div className={styles.errorPanel}>{message}</div> : null}
        <label>
          <span>Машин</span>
          <select name="vehicle_id">
            <option value="">
              {loading
                ? "Машины жагсаалт ачаалж байна"
                : error
                  ? "Машин сонгох боломжгүй"
                  : "Машин сонгох"}
            </option>
            {(data?.vehicleOptions ?? []).map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Асуудлын товч</span>
          <input name="issue_summary" required placeholder="Жишээ: Хөдөлгүүр асахгүй байна" />
        </label>
        <label>
          <span>Тайлбар</span>
          <textarea name="description" rows={5} required />
        </label>
        <label>
          <span>Сэлбэг</span>
          <textarea name="parts_note" rows={4} />
        </label>
        <label>
          <span>Зураг</span>
          <input name="files" type="file" accept="image/*" multiple capture="environment" />
        </label>
        <div className={styles.formActions}>
          <button type="submit" value="draft" disabled={submitting || !canCreateRequest}>
            Хадгалах
          </button>
          <button
            type="submit"
            value="submit"
            className={styles.primaryButton}
            disabled={submitting || !canCreateRequest}
          >
            Илгээх
          </button>
        </div>
      </form>
    </div>
  );
}

function Stepper({ state }: { state: string }) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => state.toLowerCase().includes(step.toLowerCase())),
  );
  return (
    <ol className={styles.stepper}>
      {steps.map((step, index) => (
        <li key={step} className={index <= activeIndex ? styles.stepActive : ""}>
          {step}
        </li>
      ))}
    </ol>
  );
}

function ActionForm({
  title,
  action,
  children,
  onDone,
}: {
  title: string;
  action: string;
  children: ReactNode;
  onDone: () => void;
}) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    formData.set("action", action);
    try {
      const response = await fetch("/api/fleet-repair/action", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Үйлдэл амжилтгүй боллоо.");
      }
      setMessage("Амжилттай хадгаллаа.");
      onDone();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Үйлдэл амжилтгүй боллоо.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.actionForm} onSubmit={submit}>
      <h3>{title}</h3>
      {message ? <div className={message.includes("Амжилттай") ? styles.noticePanel : styles.errorPanel}>{message}</div> : null}
      {children}
      <button type="submit" className={styles.primaryButton} disabled={submitting}>
        Баталгаажуулах
      </button>
    </form>
  );
}

export function FleetRepairDetailClient({ requestId }: { requestId: number }) {
  const { data, error, loading, refresh } = useApiData<DetailData>(
    `/api/fleet-repair/requests/${requestId}`,
  );
  const request = data?.request;
  const permissions = data?.permissions;

  return (
    <div className={styles.page}>
      <PageHeader
        title={request?.vehicle ?? "Засварын дэлгэрэнгүй"}
        subtitle={request?.name ?? "Засварын хүсэлтийн workflow болон хавсралтууд."}
        action={<Link href="/fleet-repair/requests" className={styles.secondaryAction}>Жагсаалт</Link>}
      />
      <FleetNav />
      <StatusPanel loading={loading} error={error} onRetry={refresh} />
      {request ? (
        <>
          <Stepper state={request.stateLabel} />
          <section className={styles.detailGrid}>
            <article className={styles.panel}>
              <h2>Машин</h2>
              <p>{request.vehicle}</p>
              <StateBadge request={request} />
            </article>
            <article className={styles.panel}>
              <h2>Эвдрэл</h2>
              <p>{request.description || "Тайлбар бүртгээгүй"}</p>
            </article>
            <article className={styles.panel}>
              <h2>Сэлбэг</h2>
              <p>{request.partsNote || "Сэлбэгийн мэдээлэл бүртгээгүй"}</p>
            </article>
            <article className={styles.panel}>
              <h2>Санхүү</h2>
              <p>{money(request.totalAmount)}</p>
              <small>{request.paymentState || "Төлөв бүртгээгүй"}</small>
            </article>
            <article className={styles.panel}>
              <h2>Гэрээ</h2>
              <p>{request.contractRequired ? "Гэрээ шаардлагатай" : "Гэрээ шаардлагагүй"}</p>
              <small>{request.contractState || "Төлөв бүртгээгүй"}</small>
            </article>
            <article className={styles.panel}>
              <h2>Тушаал</h2>
              <p>{request.orderState || "Тушаал бүртгээгүй"}</p>
            </article>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>3 санал</h2>
              <span>Гэрээний босго нийлүүлэгч тус бүрийн нийт дүнгээр тооцогдоно.</span>
            </div>
            <div className={styles.quoteGrid}>
              {request.quotes.map((quote) => (
                <article key={quote.id} className={quote.isSelected ? styles.quoteSelected : styles.quoteCard}>
                  <strong>{quote.supplierName}</strong>
                  <span>{money(quote.amount)}</span>
                  <small>{quote.contractRequired ? "Гэрээ хэрэгтэй" : "Гэрээ хэрэггүй"}</small>
                </article>
              ))}
              {!request.quotes.length ? <div className={styles.emptyPanel}>Санал бүртгээгүй байна.</div> : null}
            </div>
          </section>

          <section className={styles.workflowGrid}>
            {permissions?.quote ? (
              <ActionForm title="Үнийн санал оруулах" action="add_quotes" onDone={refresh}>
                <input type="hidden" name="request_id" value={request.id} />
                {[1, 2, 3].map((index) => (
                  <div key={index} className={styles.inlineFields}>
                    <input name="suppliers[]" placeholder={`Нийлүүлэгч ${index}`} />
                    <input name="amounts[]" inputMode="numeric" placeholder="Дүн" />
                    <input name="files" type="file" />
                  </div>
                ))}
              </ActionForm>
            ) : null}
            {permissions?.finance ? (
              <>
                <ActionForm title="Нийлүүлэгч сонгох" action="select_supplier" onDone={refresh}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <select name="supplier_quote_id">
                    {request.quotes.map((quote) => (
                      <option key={quote.id} value={quote.id}>
                        {quote.supplierName} - {money(quote.amount)}
                      </option>
                    ))}
                  </select>
                </ActionForm>
                <ActionForm title="Төлбөр хийх" action="make_payment" onDone={refresh}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input name="payment_reference" placeholder="Гүйлгээний дугаар" />
                  <input name="files" type="file" accept=".pdf,image/*" />
                </ActionForm>
              </>
            ) : null}
            {permissions?.contract ? (
              <>
                <ActionForm title="Гэрээний төсөл" action="upload_contract_draft" onDone={refresh}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input name="files" type="file" accept=".pdf,.doc,.docx" />
                </ActionForm>
                <ActionForm title="Эцсийн гэрээ" action="upload_contract_final" onDone={refresh}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input name="files" type="file" accept=".pdf,.doc,.docx" />
                </ActionForm>
              </>
            ) : null}
            {permissions?.director ? (
              <>
                <ActionForm title="Захирал батлах" action="director_approve" onDone={refresh}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <textarea name="note" placeholder="Тайлбар" rows={3} />
                </ActionForm>
                <ActionForm title="Захирал буцаах" action="director_return" onDone={refresh}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <textarea name="note" placeholder="Буцаах шалтгаан" rows={3} />
                </ActionForm>
              </>
            ) : null}
            {permissions?.order ? (
              <ActionForm title="Тушаал" action="upload_order" onDone={refresh}>
                <input type="hidden" name="request_id" value={request.id} />
                <input name="files" type="file" accept="application/pdf" />
              </ActionForm>
            ) : null}
            {permissions?.quote ? (
              <ActionForm title="Сэлбэг хүлээн авах" action="receive_parts" onDone={refresh}>
                <input type="hidden" name="request_id" value={request.id} />
                <textarea name="note" placeholder="Хүлээн авсан тэмдэглэл" rows={3} />
                <input name="files" type="file" accept=".pdf,image/*" multiple />
              </ActionForm>
            ) : null}
            {permissions?.repair ? (
              <ActionForm title="Засвар дуусгах" action="complete_repair" onDone={refresh}>
                <input type="hidden" name="request_id" value={request.id} />
                <textarea name="repair_note" placeholder="Гүйцэтгэлийн тайлбар" rows={3} />
                <input name="files" type="file" accept="image/*" multiple capture="environment" />
              </ActionForm>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function FleetRepairGarbageClient() {
  const { data, error, loading, refresh } = useApiData<GarbageData>("/api/fleet-repair/garbage");

  return (
    <div className={styles.page}>
      <PageHeader
        title="Өдөр тутмын хог тээврийн мэдээлэл"
        subtitle="Өнөөдөр, машинаар, 7 хоног болон сарын дүнг нэг дор харна."
      />
      <FleetNav />
      <StatusPanel loading={loading} error={error} onRetry={refresh} />
      <section className={styles.metricGrid}>
        <article className={styles.metricCard}>
          <Scale aria-hidden />
          <span>Өнөөдрийн тонн</span>
          <strong>{tons(data?.todayTons ?? 0)}</strong>
        </article>
        <article className={styles.metricCard}>
          <ReceiptText aria-hidden />
          <span>Сарын дүн</span>
          <strong>{tons(data?.monthTons ?? 0)}</strong>
        </article>
      </section>
      <section className={styles.panel}>
        <h2>Машинаар</h2>
        <div className={styles.requestList}>
          {(data?.byVehicle ?? []).map((item) => (
            <article key={item.vehicle} className={styles.requestCard}>
              <div>
                <strong>{item.vehicle}</strong>
                <span>{item.trips} рейс</span>
              </div>
              <span>{tons(item.tons)}</span>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.panel}>
        <h2>7 хоног</h2>
        <div className={styles.weekGrid}>
          {(data?.week ?? []).map((day) => (
            <article key={day.label}>
              <span>{day.label}</span>
              <strong>{tons(day.tons)}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
