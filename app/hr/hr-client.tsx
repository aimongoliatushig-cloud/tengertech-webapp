"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, FilePlus2, Search } from "lucide-react";

import type { HrLeaveItem, HrOption, HrSelectionOption, HrTimeoffRequest } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import styles from "./hr.module.css";

const ALL = "__all__";

type RegistryOption = HrSelectionOption | { id: number | string; name: string };

export type RegistryField =
  | string
  | {
      label: string;
      name?: string;
      type?: string;
      defaultValue?: string;
      readOnly?: boolean;
      required?: boolean;
      options?: RegistryOption[];
    };

function statusLabel(employee: HrEmployeeDirectoryItem) {
  if (!employee.active || employee.statusKey === "archived") {
    return "Архивлагдсан";
  }
  if (employee.statusKey === "resigned" || employee.statusKey === "terminated") {
    return "Ажлаас гарсан";
  }
  if (employee.statusKey === "leave") {
    return "Чөлөөтэй";
  }
  if (employee.statusKey === "sick") {
    return "Өвчтэй";
  }
  if (employee.statusKey === "business_trip") {
    return "Томилолттой";
  }
  return "Идэвхтэй";
}

export function EmployeeTable({
  employees,
  mode = "hr",
}: {
  employees: HrEmployeeDirectoryItem[];
  mode?: "hr" | "department";
}) {
  const searchParams = useSearchParams();
  const departments = useMemo(
    () => Array.from(new Set(employees.map((employee) => employee.departmentName).filter(Boolean))).sort(),
    [employees],
  );
  const [query, setQuery] = useState("");
  const initialDepartment = searchParams.get("department") || ALL;
  const [department, setDepartment] = useState(initialDepartment);
  const [status, setStatus] = useState(ALL);

  const visibleEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("mn-MN");
    return employees.filter((employee) => {
      const matchesQuery = normalizedQuery
        ? [
            employee.name,
            employee.departmentName,
            employee.jobTitle,
            employee.workPhone,
            employee.mobilePhone,
            employee.workEmail,
          ]
            .filter(Boolean)
            .some((value) => value.toLocaleLowerCase("mn-MN").includes(normalizedQuery))
        : true;
      const matchesDepartment = department === ALL || employee.departmentName === department;
      const matchesStatus = status === ALL || statusLabel(employee) === status;
      return matchesQuery && matchesDepartment && matchesStatus;
    });
  }, [department, employees, query, status]);

  return (
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Нэр, алба нэгж, албан тушаал, утсаар хайх"
          />
        </label>
        <select value={department} onChange={(event) => setDepartment(event.target.value)}>
          <option value={ALL}>Бүх алба нэгж</option>
          {departments.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value={ALL}>Бүх төлөв</option>
          <option value="Идэвхтэй">Идэвхтэй</option>
          <option value="Чөлөөтэй">Чөлөөтэй</option>
          <option value="Өвчтэй">Өвчтэй</option>
          <option value="Томилолттой">Томилолттой</option>
          <option value="Ажлаас гарсан">Ажлаас гарсан</option>
          <option value="Архивлагдсан">Архивлагдсан</option>
        </select>
        {mode === "hr" ? (
          <Link href="/hr/employees/new" className={styles.primaryLink}>
            Шинэ ажилтан
          </Link>
        ) : null}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Нэр</th>
              <th>Алба нэгж</th>
              <th>Албан тушаал</th>
              <th>Ажлын нэр</th>
              <th>Утас</th>
              <th>Төлөв</th>
              <th>Ажилд орсон</th>
              {mode === "department" ? <th>Үйлдэл</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <Link href={`/hr/employees/${employee.id}`}>{employee.name}</Link>
                </td>
                <td>{employee.departmentName || "Бүртгээгүй"}</td>
                <td>{employee.jobTitle || "Бүртгээгүй"}</td>
                <td>{employee.gradeRank || employee.jobTitle || "Бүртгээгүй"}</td>
                <td>{employee.workPhone || employee.mobilePhone || "Бүртгээгүй"}</td>
                <td>
                  <span className={styles.statusPill}>{statusLabel(employee)}</span>
                </td>
                <td>{employee.startDate || "Бүртгээгүй"}</td>
                {mode === "department" ? (
                  <td>
                    <div className={styles.checklist}>
                      <Link href={`/hr/sick?employeeId=${employee.id}&type=time_off`}>Чөлөө хүсэх</Link>
                      <Link href={`/hr/sick?employeeId=${employee.id}&type=sick`}>Өвчтэй бүртгэх</Link>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!visibleEmployees.length ? (
        <div className={styles.emptyState}>
          <strong>Одоогоор бүртгэл алга.</strong>
          <span>Шинэ бүртгэл үүсгэж эхлээрэй.</span>
        </div>
      ) : null}
    </section>
  );
}

export function EmployeeCreateForm({
  departments,
  jobs,
  managers,
}: {
  departments: HrOption[];
  jobs: HrOption[];
  managers: HrOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/hr/employees", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Ажилтан бүртгэхэд алдаа гарлаа.");
      }
      router.push(`/hr/employees/${payload.employee?.id ?? ""}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ажилтан бүртгэхэд алдаа гарлаа.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.formPanel} onSubmit={submit} noValidate>
      {message ? <p className={styles.errorText}>{message}</p> : null}
      <div className={styles.formGrid}>
        <Field name="lastName" label="Овог" required />
        <Field name="firstName" label="Нэр" required />
        <Field name="registerNumber" label="Регистрийн дугаар" required />
        <label className={styles.field}>
          <span>Хүйс</span>
          <select name="gender" defaultValue="">
            <option value="">Сонгох</option>
            <option value="male">Эрэгтэй</option>
            <option value="female">Эмэгтэй</option>
            <option value="other">Бусад</option>
          </select>
        </label>
        <Field name="birthDate" label="Төрсөн огноо" type="date" />
        <Field name="phone" label="Утас" />
        <Field name="email" label="Имэйл" type="email" />
        <Select name="departmentId" label="Хэлтэс / алба" options={departments} required />
        <Select name="jobId" label="Албан тушаал" options={jobs} required />
        <Field name="jobTitle" label="Ажлын нэр" />
        <Select name="managerId" label="Удирдлага" options={managers} />
        <Field name="startDate" label="Ажилд орсон огноо" type="date" />
        <label className={styles.field}>
          <span>Ажиллах төрөл</span>
          <select name="workType" defaultValue="Үндсэн">
            <option>Үндсэн</option>
            <option>Түр</option>
            <option>Гэрээт</option>
            <option>Улирлын</option>
          </select>
        </label>
        <label className={styles.checkField}>
          <input name="isFieldEmployee" type="checkbox" />
          <span>Талбайн ажилтан эсэх</span>
        </label>
        <label className={styles.field}>
          <span>Талбайн үүрэг</span>
          <select name="fieldRole" defaultValue="">
            <option value="">Сонгохгүй</option>
            <option>Жолооч</option>
            <option>Ачигч</option>
            <option>Хянагч</option>
            <option>Мастер</option>
            <option>Бусад</option>
          </select>
        </label>
        <Field name="workLocation" label="Ажиллах байршил" />
        <Field name="emergencyContact" label="Яаралтай холбоо барих хүн" />
        <Field name="emergencyPhone" label="Яаралтай холбоо барих утас" />
        <Field name="homeAddress" label="Гэрийн хаяг" />
      </div>
      <label className={styles.field}>
        <span>Тэмдэглэл</span>
        <textarea name="note" rows={4} />
      </label>
      <button className={styles.primaryButton} disabled={pending}>
        {pending ? "Хадгалж байна..." : "Ажилтан бүртгэх"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
  readOnly = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  readOnly?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} readOnly={readOnly} />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  required = false,
}: {
  label: string;
  name: string;
  options: HrOption[];
  required?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select name={name} defaultValue="" required={required}>
        <option value="">Сонгох</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const detailTabs = [
  "Үндсэн мэдээлэл",
  "Ажлын мэдээлэл",
  "Чөлөө / өвчтэй / томилолт",
  "Сахилгын бүртгэл",
  "Оноогдсон ажил",
  "Тушаал / гэрээ",
  "Хавсралт",
  "Түүх / өөрчлөлт",
];

export function EmployeeDetailTabs({ employee }: { employee: HrEmployeeDirectoryItem }) {
  const [tab, setTab] = useState(detailTabs[0]);
  const tabContent: Record<string, { label: string; value: string }[]> = {
    "Үндсэн мэдээлэл": [
      { label: "Нэр", value: employee.name },
      { label: "Ажилтны код", value: employee.employeeCode },
      { label: "Хүйс", value: employee.genderLabel },
      { label: "Утас", value: employee.workPhone || employee.mobilePhone },
      { label: "И-мэйл", value: employee.workEmail },
      { label: "Төлөв", value: employee.statusLabel },
    ],
    "Ажлын мэдээлэл": [
      { label: "Хэлтэс / алба", value: employee.departmentName },
      { label: "Албан тушаал", value: employee.jobTitle },
      { label: "Шууд удирдлага", value: employee.managerName },
      { label: "Ажилд орсон огноо", value: employee.startDate },
      { label: "Гэрээ дуусах огноо", value: employee.contractEndDate },
      { label: "Зэрэг / дэв", value: employee.gradeRank },
    ],
    "Чөлөө / өвчтэй / томилолт": [
      { label: "Чөлөө бүртгэх", value: "Дээд талын Чөлөө бүртгэх үйлдлээр энэ ажилтанд бүртгэл үүсгэнэ." },
      { label: "Өвчтэй бүртгэх", value: "Өвчтэй бүртгэл дээр эмнэлгийн магадлагаа, хавсралт оруулна." },
      { label: "Томилолт бүртгэх", value: "Томилолтын газар, хугацаа, зорилго, баталсан хүн бүртгэнэ." },
    ],
    "Сахилгын бүртгэл": [
      { label: "Сахилгын оноо", value: `${Math.round(employee.disciplineScore)}%` },
      { label: "Ажилтны тайлбар", value: "Сахилгын бүртгэл дээр ажилтан web/mobile-оор тайлбар өгнө." },
    ],
    "Оноогдсон ажил": [
      { label: "Даалгаврын биелэлт", value: `${Math.round(employee.taskCompletionPercent)}%` },
      { label: "Ажлын төлөв", value: "Ажлаас гарсан ажилтанд шинэ ажил оноох үед анхааруулга гаргана." },
    ],
    "Тушаал / гэрээ": [
      { label: "Гэрээ дуусах", value: employee.contractEndDate },
      { label: "Тушаал / гэрээ", value: "Ажилд авах, чөлөөлөх, шилжилт, сахилга, нэмэлт гэрээний хавсралт хадгална." },
    ],
    Хавсралт: [
      { label: "Дутуу хавсралт", value: `${employee.missingDocumentCount}` },
      { label: "Хавсралт нэмэх", value: "Иргэний үнэмлэх, диплом, гэрээ, тушаал болон бусад файлыг profile дээр хадгална." },
    ],
    "Түүх / өөрчлөлт": [
      { label: "Ажилтны түүх", value: "Хэлтэс, албан тушаал, удирдлага, төлөвийн өөрчлөлт бүртгэгдэнэ." },
      { label: "KPI", value: `${Math.round(employee.kpiScore)}%` },
    ],
  };

  return (
    <section id="profile-info" className={styles.panel}>
      <div className={styles.tabList}>
        {detailTabs.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? styles.activeTab : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className={styles.detailGrid}>
        {(tabContent[tab] ?? []).map((item) => (
          <Info key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className={styles.infoCard}>
      <span>{label}</span>
      <strong>{value || "Бүртгээгүй"}</strong>
    </div>
  );
}

export function TimeoffRequestsClient({
  employees,
  requests,
  mode = "department",
}: {
  employees: HrEmployeeDirectoryItem[];
  requests: HrTimeoffRequest[];
  mode?: "hr" | "department";
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaultType = searchParams.get("type") === "sick" ? "sick" : "time_off";
  const defaultEmployeeId = searchParams.get("employeeId") || "";
  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee.id) === defaultEmployeeId) ?? null,
    [defaultEmployeeId, employees],
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState(ALL);
  const [editingRequest, setEditingRequest] = useState<HrTimeoffRequest | null>(null);

  const visibleRequests = useMemo(() => {
    if (filter === ALL) return requests;
    return requests.filter((request) => request.state === filter || request.requestType === filter);
  }, [filter, requests]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        editingRequest ? `/api/hr/timeoff-requests/${editingRequest.id}` : "/api/hr/timeoff-requests",
        { method: editingRequest ? "PATCH" : "POST", body: formData },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Хүсэлт илгээхэд алдаа гарлаа.");
      }
      setMessage(editingRequest ? "Хүсэлт шинэчлэгдлээ." : formData.get("intent") === "draft" ? "Ноорог хадгалагдлаа." : "Хүсэлт HR-д илгээгдлээ.");
      setEditingRequest(null);
      router.refresh();
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Хүсэлт илгээхэд алдаа гарлаа.");
    } finally {
      setPending(false);
    }
  }

  async function runAction(requestId: number, action: "hr_review" | "approve" | "reject" | "cancel") {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/hr/timeoff-requests/${requestId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Үйлдэл хийхэд алдаа гарлаа.");
      }
      setMessage("Хүсэлтийн төлөв шинэчлэгдлээ.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Үйлдэл хийхэд алдаа гарлаа.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.twoColumn}>
      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>{mode === "hr" ? "HR review" : "Department Head"}</span>
            <h2>{mode === "hr" ? "Ирсэн хүсэлтүүд" : "Миний илгээсэн хүсэлтүүд"}</h2>
          </div>
          <span>{visibleRequests.length}</span>
        </div>

        <div className={styles.toolbar}>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value={ALL}>Бүх хүсэлт</option>
            <option value="submitted">Хүлээгдэж буй</option>
            <option value="hr_review">HR шалгаж байна</option>
            <option value="approved">Батлагдсан</option>
            <option value="rejected">Татгалзсан</option>
            <option value="time_off">Чөлөө</option>
            <option value="sick">Өвчтэй</option>
          </select>
        </div>

        {message ? <p className={message.includes("алдаа") || message.includes("эрх") ? styles.errorText : styles.successText}>{message}</p> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ажилтан</th>
                <th>Хэлтэс</th>
                <th>Төрөл</th>
                <th>Хугацаа</th>
                <th>Илгээсэн</th>
                <th>Төлөв</th>
                <th>Хавсралт</th>
                <th>Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {visibleRequests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <Link href={`/hr/employees/${request.employeeId}`}>{request.employeeName}</Link>
                  </td>
                  <td>{request.departmentName}</td>
                  <td>{request.requestTypeLabel}</td>
                  <td>
                    {request.dateFrom} - {request.dateTo}
                  </td>
                  <td>{request.submittedBy || "Бүртгээгүй"}</td>
                  <td>
                    <span className={styles.statusPill}>{request.stateLabel}</span>
                  </td>
                  <td>{request.hasAttachment ? "Байгаа" : "Байхгүй"}</td>
                  <td>
                    <div className={styles.checklist}>
                      {mode === "hr" && request.state === "submitted" ? (
                        <button type="button" onClick={() => runAction(request.id, "hr_review")} disabled={pending}>
                          HR шалгах
                        </button>
                      ) : null}
                      {mode === "hr" && ["submitted", "hr_review"].includes(request.state) ? (
                        <>
                          <button type="button" onClick={() => runAction(request.id, "approve")} disabled={pending}>
                            Батлах
                          </button>
                          <button type="button" onClick={() => runAction(request.id, "reject")} disabled={pending}>
                            Татгалзах
                          </button>
                        </>
                      ) : null}
                      {mode === "department" && !["approved", "rejected", "cancelled"].includes(request.state) ? (
                        <>
                          <button type="button" onClick={() => setEditingRequest(request)} disabled={pending}>
                            Засах
                          </button>
                          <button type="button" onClick={() => runAction(request.id, "cancel")} disabled={pending}>
                            Цуцлах
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!visibleRequests.length ? (
          <div className={styles.emptyState}>
            <strong>Одоогоор хүсэлт алга.</strong>
            <span>{mode === "hr" ? "Хэлтсийн даргаас илгээсэн хүсэлт энд харагдана." : "Өөрийн хэлтсийн ажилтанд хүсэлт үүсгэнэ үү."}</span>
          </div>
        ) : null}
      </section>

      <form key={editingRequest?.id ?? "new"} className={styles.formPanel} onSubmit={submit} noValidate>
        <h2>{editingRequest ? "Хүсэлт засах" : "Чөлөө / өвчтэй хүсэлт"}</h2>
        {!editingRequest && selectedEmployee ? (
          <div className={styles.selectedEmployeeContext}>
            <span>Сонгосон ажилтан</span>
            <strong>{selectedEmployee.name}</strong>
            <small>
              {selectedEmployee.departmentName || "Хэлтэс бүртгээгүй"} ·{" "}
              {selectedEmployee.jobTitle || "Албан тушаал бүртгээгүй"}
            </small>
          </div>
        ) : null}
        <label className={styles.field}>
          <span>Ажилтан</span>
          <select name="employeeId" defaultValue={editingRequest?.employeeId || defaultEmployeeId} required disabled={Boolean(editingRequest)}>
            <option value="">Сонгох</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Төрөл</span>
          <select name="requestType" defaultValue={editingRequest?.requestType || defaultType} required>
            <option value="time_off">Чөлөө</option>
            <option value="sick">Өвчтэй</option>
          </select>
        </label>
        <div className={styles.formGridTwo}>
          <Field name="dateFrom" label="Эхлэх огноо" type="date" required defaultValue={editingRequest?.dateFrom} />
          <Field name="dateTo" label="Дуусах огноо" type="date" required defaultValue={editingRequest?.dateTo} />
        </div>
        <label className={styles.field}>
          <span>Шалтгаан</span>
          <textarea name="reason" rows={4} defaultValue={editingRequest?.reason || ""} required />
        </label>
        <label className={styles.field}>
          <span>Хавсралтын зураг</span>
          <input name="files" type="file" accept="image/*,.pdf" multiple required={!editingRequest?.hasAttachment} />
        </label>
        <label className={styles.field}>
          <span>Тайлбар</span>
          <textarea name="note" rows={3} defaultValue={editingRequest?.note || ""} />
        </label>
        <div className={styles.actionGrid}>
          <button className={styles.primaryButton} name="intent" value="submit" disabled={pending}>
            {pending ? "Илгээж байна..." : "Илгээх"}
          </button>
          <button className={styles.primaryButton} name="intent" value="draft" disabled={pending}>
            Ноорог хадгалах
          </button>
          {editingRequest ? (
            <button className={styles.primaryButton} type="button" onClick={() => setEditingRequest(null)} disabled={pending}>
              Болих
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

export function LeavesClient({
  employees,
  leaveTypes,
  leaves,
  defaultKind = "leave",
}: {
  employees: HrEmployeeDirectoryItem[];
  leaveTypes: HrOption[];
  leaves: HrLeaveItem[];
  defaultKind?: "leave" | "sick";
}) {
  const searchParams = useSearchParams();
  const defaultSick = defaultKind === "sick" || searchParams.get("type") === "sick";
  const defaultEmployeeId = searchParams.get("employeeId") || "";
  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee.id) === defaultEmployeeId) ?? null,
    [defaultEmployeeId, employees],
  );
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/hr/leaves", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Чөлөө бүртгэхэд алдаа гарлаа.");
      setMessage("Бүртгэл хадгалагдлаа.");
      router.refresh();
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Чөлөө бүртгэхэд алдаа гарлаа.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.twoColumn}>
      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2>Чөлөө / өвчтэй бүртгэл</h2>
          <span>{leaves.length}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ажилтан</th>
                <th>Төрөл</th>
                <th>Эхлэх</th>
                <th>Дуусах</th>
                <th>Нийт өдөр</th>
                <th>Төлөв</th>
                <th>Хавсралт</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((leave) => (
                <tr key={leave.id}>
                  <td>{leave.employeeName}</td>
                  <td>{leave.typeName}</td>
                  <td>{leave.dateFrom}</td>
                  <td>{leave.dateTo}</td>
                  <td>{leave.dayCount}</td>
                  <td>{leave.stateLabel}</td>
                  <td>{leave.hasAttachment ? "Байгаа" : "Байхгүй"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!leaves.length ? (
          <div className={styles.emptyState}>
            <strong>Одоогоор бүртгэл алга.</strong>
            <span>Шинэ бүртгэл үүсгэж эхлээрэй.</span>
          </div>
        ) : null}
      </section>

      <form className={styles.formPanel} onSubmit={submit} noValidate>
        <h2>{defaultSick ? "Өвчтэй чөлөө бүртгэх" : "Чөлөө бүртгэх"}</h2>
        {message ? <p className={message.includes("хадгалагд") ? styles.successText : styles.errorText}>{message}</p> : null}
        {selectedEmployee ? (
          <div className={styles.selectedEmployeeContext}>
            <span>Сонгосон ажилтан</span>
            <strong>{selectedEmployee.name}</strong>
            <small>
              {selectedEmployee.departmentName || "Хэлтэс бүртгээгүй"} ·{" "}
              {selectedEmployee.jobTitle || "Албан тушаал бүртгээгүй"}
            </small>
          </div>
        ) : null}
        <input name="leaveTypeName" type="hidden" value={defaultSick ? "Өвчтэй" : ""} />
        <label className={styles.field}>
          <span>Ажилтан</span>
          <select name="employeeId" defaultValue={defaultEmployeeId} required>
            <option value="">Сонгох</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Чөлөөний төрөл</span>
          <select name="leaveTypeId" defaultValue="">
            <option value="">{defaultSick ? "Өвчтэй" : "Сонгох"}</option>
            {leaveTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.formGridTwo}>
          <Field name="dateFrom" label="Эхлэх огноо" type="date" required />
          <Field name="dateTo" label="Дуусах огноо" type="date" required />
        </div>
        <label className={styles.field}>
          <span>Тайлбар</span>
          <textarea name="note" rows={4} defaultValue={defaultSick ? "Өвчтэй чөлөө" : ""} />
        </label>
        <label className={styles.field}>
          <span>Эмнэлгийн магадлагаа / файл</span>
          <input name="files" type="file" multiple />
        </label>
        <label className={styles.checkField}>
          <input name="confirm" type="checkbox" />
          <span>Баталгаажуулах</span>
        </label>
        <button className={styles.primaryButton} disabled={pending}>
          {pending ? "Хадгалж байна..." : defaultSick ? "Өвчтэй чөлөө бүртгэх" : "Чөлөө бүртгэх"}
        </button>
      </form>
    </div>
  );
}

export function RegistryPage({
  title,
  description,
  fields,
  checklist,
  selectedEmployee,
  submitEndpoint,
  submitLabel = "Бүртгэл үүсгэх",
  successMessage = "Бүртгэл үүсгэгдлээ.",
}: {
  title: string;
  description: string;
  fields: RegistryField[];
  checklist?: string[];
  selectedEmployee?: HrEmployeeDirectoryItem | null;
  submitEndpoint?: string;
  submitLabel?: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitEndpoint) {
      return;
    }

    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch(submitEndpoint, { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Бүртгэл үүсгэхэд алдаа гарлаа.");
      }
      setMessage(successMessage);
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Бүртгэл үүсгэхэд алдаа гарлаа.");
    } finally {
      setPending(false);
    }
  }

  function normalizeField(field: RegistryField) {
    return typeof field === "string" ? { label: field, name: field } : { name: field.label, ...field };
  }

  function renderSelectedEmployeeField(field: ReturnType<typeof normalizeField>) {
    if (!selectedEmployee) {
      return null;
    }

    if (field.label === "Ажилтан") {
      return (
        <label key={field.label} className={styles.field}>
          <span>Ажилтан</span>
          <input value={selectedEmployee.name} readOnly />
          <input name="employeeId" type="hidden" value={selectedEmployee.id} />
        </label>
      );
    }

    if (field.label === "Хэлтэс") {
      return (
        <label key={field.label} className={styles.field}>
          <span>Хэлтэс</span>
          <input value={selectedEmployee.departmentName || "Хэлтэс бүртгээгүй"} readOnly />
          {selectedEmployee.departmentId ? <input name="departmentId" type="hidden" value={selectedEmployee.departmentId} /> : null}
        </label>
      );
    }

    if (field.label === "Албан тушаал") {
      return (
        <label key={field.label} className={styles.field}>
          <span>Албан тушаал</span>
          <input value={selectedEmployee.jobTitle || "Албан тушаал бүртгээгүй"} readOnly />
        </label>
      );
    }

    return null;
  }

  return (
    <div className={styles.twoColumn}>
      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2>{title}</h2>
          <span>0</span>
        </div>
        <div className={styles.emptyState}>
          <strong>Одоогоор бүртгэл алга.</strong>
          <span>Шинэ бүртгэл үүсгэж эхлээрэй.</span>
        </div>
        {checklist ? (
          <div className={styles.checklist}>
            {checklist.map((item) => (
              <span key={item}>
                <Check aria-hidden />
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </section>
      <form className={styles.formPanel} onSubmit={submit} noValidate>
        <h2>Шинэ бүртгэл</h2>
        <p className={styles.mutedText}>{description}</p>
        {message ? <p className={message.includes("алдаа") ? styles.errorText : styles.successText}>{message}</p> : null}
        {selectedEmployee ? (
          <div className={styles.selectedEmployeeContext}>
            <span>Сонгосон ажилтан</span>
            <strong>{selectedEmployee.name}</strong>
            <small>
              {selectedEmployee.departmentName || "Хэлтэс бүртгээгүй"} ·{" "}
              {selectedEmployee.jobTitle || "Албан тушаал бүртгээгүй"}
            </small>
          </div>
        ) : null}
        <div className={styles.formGrid}>
          {fields.map((field) => {
            const fieldConfig = normalizeField(field);
            const selectedField = renderSelectedEmployeeField(fieldConfig);
            if (selectedField) {
              return selectedField;
            }

            if (fieldConfig.options?.length) {
              return (
                <label key={fieldConfig.label} className={styles.field}>
                  <span>{fieldConfig.label}</span>
                  <select name={fieldConfig.name} defaultValue={fieldConfig.defaultValue || ""} required={fieldConfig.required}>
                    <option value="">Сонгох</option>
                    {fieldConfig.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            return (
              <Field
                key={fieldConfig.label}
                name={fieldConfig.name}
                label={fieldConfig.label}
                type={fieldConfig.type}
                defaultValue={fieldConfig.defaultValue}
                readOnly={fieldConfig.readOnly}
                required={fieldConfig.required}
              />
            );
          })}
        </div>
        <label className={styles.field}>
          <span>Хавсралт</span>
          <input name="files" type="file" multiple />
        </label>
        <button className={styles.primaryButton} type={submitEndpoint ? "submit" : "button"} disabled={pending}>
          <FilePlus2 aria-hidden />
          {pending ? "Үүсгэж байна..." : submitLabel}
        </button>
      </form>
    </div>
  );
}
