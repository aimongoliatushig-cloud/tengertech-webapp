"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  FileCheck2,
  FilePlus2,
  HeartPulse,
  History,
  IdCard,
  Mail,
  Pencil,
  Plane,
  Phone,
  Plus,
  Repeat2,
  ScrollText,
  Search,
  Sparkles,
  Star,
  Trash2,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import { compareHrDepartmentNames } from "@/lib/hr-department-order";
import type { HrLeaveItem, HrOption, HrSelectionOption, HrTimeoffRequest, HrTimeoffRequestType } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import styles from "./hr.module.css";

const ALL = "__all__";

function isErrorMessage(message: string) {
  const normalized = message.toLocaleLowerCase("mn-MN");
  return (
    normalized.includes("алдаа") ||
    normalized.includes("эрх") ||
    normalized.includes("хүрэлцэхгүй") ||
    normalized.includes("зөвшөөрөгдөхгүй") ||
    normalized.includes("боломжгүй") ||
    normalized.includes("шаардлагатай") ||
    normalized.includes("заавал") ||
    normalized.includes("хавсралт")
  );
}

function AttachmentLinks({ hasAttachment, attachmentIds }: { hasAttachment: boolean; attachmentIds?: number[] }) {
  const validAttachmentIds = (attachmentIds || []).filter((attachmentId) => Number.isFinite(attachmentId) && attachmentId > 0);

  if (!hasAttachment) {
    return <span className={styles.attachmentEmpty}>Байхгүй</span>;
  }

  if (!validAttachmentIds.length) {
    return <span className={styles.attachmentMissing}>Файл олдсонгүй</span>;
  }

  return (
    <div className={styles.attachmentLinks}>
      {validAttachmentIds.map((attachmentId, index) => (
        <a
          key={attachmentId}
          className={styles.attachmentLink}
          href={`/api/odoo/attachments/${attachmentId}`}
          target="_blank"
          rel="noreferrer"
        >
          {validAttachmentIds.length > 1 ? `Файл ${index + 1}` : "Нээх"}
        </a>
      ))}
    </div>
  );
}

type RegistryOption = (HrSelectionOption | { id: number | string; name: string }) & {
  departmentId?: number | string | null;
  jobTitle?: string;
};

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
      placeholder?: string;
    };

type RegistryRecord = Record<string, string | number | boolean | null | undefined>;

export type RegistryColumn = {
  key: string;
  label: string;
  hrefKey?: string;
};

function statusLabel(employee: HrEmployeeDirectoryItem) {
  if (!employee.active || ["archived", "terminated", "resigned"].includes(employee.statusKey)) {
    return "Чөлөөлөгдсөн";
  }
  if (employee.statusKey === "leave") {
    return "Чөлөөтэй";
  }
  if (employee.statusKey === "annual_leave") {
    return "Ээлжийн амралттай";
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
  canCreateEmployee = mode === "hr",
}: {
  employees: HrEmployeeDirectoryItem[];
  mode?: "hr" | "department";
  canCreateEmployee?: boolean;
}) {
  const searchParams = useSearchParams();
  const departments = useMemo(
    () =>
      Array.from(new Set(employees.map((employee) => employee.departmentName).filter(Boolean))).sort(
        compareHrDepartmentNames,
      ),
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
          <option value="Ээлжийн амралттай">Ээлжийн амралттай</option>
          <option value="Өвчтэй">Өвчтэй</option>
          <option value="Томилолттой">Томилолттой</option>
          <option value="Чөлөөлөгдсөн">Чөлөөлөгдсөн</option>
        </select>
        {canCreateEmployee ? (
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
                      <Link href={`/hr/employees/${employee.id}?edit=profile#profile-info`}>Засах</Link>
                      <Link href={`/hr/sick?employeeId=${employee.id}&type=time_off`}>Чөлөө хүсэх</Link>
                      <Link href={`/hr/sick?employeeId=${employee.id}&type=annual_leave`}>Ээлжийн амралт</Link>
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
      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <h2>Үндсэн мэдээлэл</h2>
          <p>Овог, нэр, регистр, хэлтэс, албан тушаал нь үндсэн бүртгэлд шаардлагатай.</p>
        </div>
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
        <Field name="workLocation" label="Ажиллах байршил" />
        <Field name="emergencyContact" label="Яаралтай холбоо барих хүн" />
        <Field name="emergencyPhone" label="Яаралтай холбоо барих утас" />
        <Field name="homeAddress" label="Гэрийн хаяг" />
      </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <h2>Нэмэлт хувийн мэдээлэл</h2>
          <p>Эдгээр мэдээлэл заавал биш. Бөглөсөн бол ажилтны profile дээр харагдана.</p>
        </div>
        <div className={styles.formGrid}>
          <Field name="birthPlace" label="Төрсөн аймаг / сум / хот" />
          <Field name="addressProvince" label="Аймаг / Хот" />
          <Field name="addressDistrict" label="Сум / Дүүрэг" />
          <Field name="addressSubdistrict" label="Баг / Хороо" />
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <h2>Цалин, банк, НД</h2>
          <p>Санхүүгийн дэлгэрэнгүй мэдээлэл. Заавал бөглөхгүй.</p>
        </div>
        <div className={styles.formGrid}>
          <Field name="bankName" label="Банк" />
          <Field name="bankAccountNumber" label="Дансны дугаар" />
          <Field name="baseSalary" label="Үндсэн цалин" type="number" />
          <Field name="taxNumber" label="ТТД дугаар" />
          <Field name="socialInsuranceStartDate" label="НД төлж эхэлсэн огноо" type="date" />
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <h2>Ур чадвар, ажлын түүх</h2>
          <p>Авьяас, ур чадвар, өмнөх ажил, туршилтын хугацааны мэдээлэл. Заавал бөглөхгүй.</p>
        </div>
        <div className={styles.formGrid}>
          <Field name="talent" label="Авьяас / спорт / урлаг" />
          <Field name="skillLevel" label="Ур чадвар ба зэрэглэл" />
          <Field name="previousEmployment" label="Ажиллаж байсан байгууллагууд" />
          <Field name="additionalDuty" label="Хавсран ажиллаж буй / нэмэлт ажил" />
          <Field name="trialEndDate" label="Туршилтын хугацаа дуусах" type="date" />
        </div>
      </section>

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

type SearchableOption = {
  id: number | string;
  name: string;
  description?: string;
};

function SearchableSelect({
  label,
  name,
  options,
  required = false,
  defaultValue = "",
  placeholder = "Сонгох",
  disabled = false,
}: {
  label: string;
  name: string;
  options: SearchableOption[];
  required?: boolean;
  defaultValue?: string | number | null;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedValue, setSelectedValue] = useState(String(defaultValue ?? ""));
  const selectedOption = useMemo(
    () => options.find((option) => String(option.id) === selectedValue) ?? null,
    [options, selectedValue],
  );
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("mn-MN");
    if (!normalizedQuery) {
      return options;
    }
    return options.filter((option) =>
      [option.name, option.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("mn-MN").includes(normalizedQuery)),
    );
  }, [options, query]);

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input name={name} type="hidden" value={selectedValue} required={required} disabled={disabled} />
      <div className={styles.searchableSelect}>
        <button
          type="button"
          className={styles.searchableSelectButton}
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current);
            }
          }}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
        >
          <strong>{selectedOption?.name || placeholder}</strong>
          {selectedOption?.description ? <small>{selectedOption.description}</small> : null}
        </button>
        {open ? (
          <div className={styles.searchableSelectPanel}>
            <div className={styles.searchableSelectSearch}>
              <Search aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Нэрээр хайх"
                autoFocus
              />
            </div>
            <div className={styles.searchableSelectList} role="listbox">
              {!required ? (
                <button
                  type="button"
                  className={styles.searchableSelectOption}
                  onClick={() => {
                    setSelectedValue("");
                    setQuery("");
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={!selectedValue}
                >
                  <strong>{placeholder}</strong>
                </button>
              ) : null}
              {visibleOptions.map((option) => {
                const optionValue = String(option.id);
                const selected = optionValue === selectedValue;
                return (
                  <button
                    key={optionValue}
                    type="button"
                    className={`${styles.searchableSelectOption} ${selected ? styles.searchableSelectOptionSelected : ""}`}
                    onClick={() => {
                      setSelectedValue(optionValue);
                      setQuery("");
                      setOpen(false);
                    }}
                    role="option"
                    aria-selected={selected}
                  >
                    <strong>{option.name}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </button>
                );
              })}
              {!visibleOptions.length ? (
                <div className={styles.searchableSelectEmpty}>Сонголт олдсонгүй</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea name={name} defaultValue={defaultValue || ""} rows={rows} />
    </label>
  );
}

function EmployeeSelect({
  employees,
  defaultValue = "",
  disabled = false,
}: {
  employees: HrEmployeeDirectoryItem[];
  defaultValue?: string | number | null;
  disabled?: boolean;
}) {
  const options = useMemo(
    () =>
      employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        description: [employee.departmentName, employee.jobTitle].filter(Boolean).join(" · "),
      })),
    [employees],
  );

  return (
    <SearchableSelect
      name="employeeId"
      label="Ажилтан"
      options={options}
      defaultValue={defaultValue}
      required
      disabled={disabled}
      placeholder="Ажилтан сонгох"
    />
  );
}

function Select({
  label,
  name,
  options,
  required = false,
  defaultValue = "",
}: {
  label: string;
  name: string;
  options: HrOption[];
  required?: boolean;
  defaultValue?: string | number | null;
}) {
  return (
    <SearchableSelect
      label={label}
      name={name}
      options={options}
      required={required}
      defaultValue={defaultValue}
    />
  );
}

const detailTabs = [
  "Ерөнхий мэдээлэл",
  "Ажлын мэдээлэл",
  "Гэр бүл",
  "Яаралтай холбоо",
  "Чөлөө",
  "Цалин",
  "Шагнал, нэмэгдэл",
  "Авьяас, чадвар",
  "Баримт бичиг",
  "Өөрчлөлтийн түүх",
];

const editableDetailTabs = new Set(detailTabs);

const detailTabIcons: Record<string, LucideIcon> = {
  "Ерөнхий мэдээлэл": User,
  "Ажлын мэдээлэл": BriefcaseBusiness,
  "Гэр бүл": Users,
  "Яаралтай холбоо": Phone,
  "Чөлөө": CalendarDays,
  "Цалин": BadgeDollarSign,
  "Шагнал, нэмэгдэл": Award,
  "Авьяас, чадвар": Sparkles,
  "Баримт бичиг": FileText,
  "Өөрчлөлтийн түүх": History,
};

function employeeGenderValue(employee: HrEmployeeDirectoryItem) {
  if (employee.genderKey) {
    return employee.genderKey;
  }
  if (employee.genderLabel === "Эрэгтэй") {
    return "male";
  }
  if (employee.genderLabel === "Эмэгтэй") {
    return "female";
  }
  if (employee.genderLabel === "Бусад") {
    return "other";
  }
  return "";
}

function employeeMaritalValue(employee: HrEmployeeDirectoryItem) {
  const labels: Record<string, string> = {
    "Ганц бие": "single",
    "Гэрлэсэн": "married",
    "Хамтран амьдрагчтай": "cohabitant",
    "Бэлэвсэн": "widower",
    "Салсан": "divorced",
  };
  return labels[employee.maritalStatus || ""] || "";
}

function editableTextValue(value?: string) {
  const normalized = String(value || "").toLocaleLowerCase("mn-MN");
  return normalized.includes("бүртгээгүй") || normalized.includes("хэлтэсгүй") ? "" : value || "";
}

function formatMoney(value?: number) {
  if (!value) {
    return "";
  }
  return `${new Intl.NumberFormat("mn-MN").format(value)} ₮`;
}

function formatPercent(value?: number) {
  return `${Math.round(Number(value || 0))}%`;
}

function countLabel(value?: number) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function formatDateValue(value?: string) {
  if (!value) {
    return "";
  }
  return value;
}

function compactValue(...values: Array<string | number | null | undefined>) {
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function calculateWorkedDuration(startDate?: string) {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return "";
  }
  const start = new Date(`${startDate}T00:00:00`);
  const now = new Date();
  if (Number.isNaN(start.getTime()) || start > now) {
    return "";
  }
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return [years > 0 ? `${years} жил` : "", months > 0 ? `${months} сар` : ""]
    .filter(Boolean)
    .join(" ") || "1 сараас бага";
}

type DetailPair = {
  label: string;
  value?: string;
};

type TableColumn = {
  key: string;
  label: string;
};

type TableRow = Record<string, string>;

function compactRows(rows: Array<TableRow | null | false | undefined>) {
  return rows.filter((row): row is TableRow => Boolean(row));
}

export function EmployeeDetailTabs({
  employee,
  canEdit = false,
  mode = "hr",
  departments = [],
  jobs = [],
  managers = [],
}: {
  employee: HrEmployeeDirectoryItem;
  canEdit?: boolean;
  mode?: "hr" | "department";
  departments?: HrOption[];
  jobs?: HrOption[];
  managers?: HrOption[];
}) {
  const [tab, setTab] = useState(detailTabs[0]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(canEdit && searchParams.get("edit") === "profile");
  const [addingFamilyMember, setAddingFamilyMember] = useState(canEdit && searchParams.get("edit") === "family-member");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [photoErrorUrl, setPhotoErrorUrl] = useState("");
  const initials = employee.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("mn-MN");
  const showPhoto = Boolean(employee.photoUrl && photoErrorUrl !== employee.photoUrl);
  const employeeQuery = `employeeId=${employee.id}`;
  const canEditCurrentTab = canEdit && editableDetailTabs.has(tab);
  const tabActions = getEmployeeDetailTabActions(tab, employeeQuery, mode);

  function selectTab(nextTab: string) {
    setTab(nextTab);
    setMessage("");
    if (nextTab !== "Гэр бүл") {
      setAddingFamilyMember(false);
    }
    if (!editableDetailTabs.has(nextTab)) {
      setEditing(false);
    }
  }

  async function submitProfileEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setMessage("");
    setMessageIsError(false);

    try {
      const response = await fetch(`/api/hr/employees/${employee.id}`, {
        method: "PATCH",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Ажилтны мэдээлэл хадгалахад алдаа гарлаа.");
      }
      setMessage("Ажилтны мэдээлэл хадгалагдлаа.");
      setEditing(false);
      setAddingFamilyMember(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ажилтны мэдээлэл хадгалахад алдаа гарлаа.");
      setMessageIsError(true);
    } finally {
      setPending(false);
    }
  }

  const generalInfo: DetailPair[] = [
    { label: "Нэр", value: employee.name },
    { label: "Ажилтны код", value: employee.employeeCode },
    { label: "Регистр / үнэмлэх", value: employee.registerNumber },
    { label: "Хүйс", value: employee.genderLabel },
    { label: "Төрсөн огноо", value: employee.birthDate },
    { label: "Төлөв", value: employee.statusLabel },
    { label: "Ажлын утас", value: employee.workPhone },
    { label: "Гар утас", value: employee.mobilePhone },
    { label: "Ажлын и-мэйл", value: employee.workEmail },
    { label: "Хувийн утас", value: employee.privatePhone },
    { label: "Хувийн и-мэйл", value: employee.privateEmail },
    { label: "Хэрэглэгч", value: employee.userName },
  ];

  const workInfo: DetailPair[] = [
    { label: "Хэлтэс / алба", value: employee.departmentName },
    { label: "Албан тушаал", value: employee.jobTitle },
    { label: "Шууд удирдлага", value: employee.managerName },
    { label: "Дасгалжуулагч", value: employee.coachName },
    { label: "Ажилд орсон огноо", value: employee.startDate },
    { label: "Гэрээ дуусах огноо", value: employee.contractEndDate },
    { label: "Ажлын байршил", value: employee.workLocation },
    { label: "Ажлын хаяг", value: employee.workAddress },
    { label: "Ажлын цагийн хуваарь", value: employee.workSchedule },
    { label: "Зэрэг / дэв", value: employee.gradeRank },
  ];

  const personalInfo: DetailPair[] = [
    { label: "Гэрийн хаяг", value: employee.homeAddress },
    { label: "Төрсөн газар", value: employee.placeOfBirth },
    { label: "Төрсөн улс", value: employee.countryOfBirth },
    { label: "Иргэншил", value: employee.nationality },
    { label: "Гэрлэлтийн байдал", value: employee.maritalStatus },
    { label: "Эхнэр / нөхрийн нэр", value: employee.spouseName },
    { label: "Эхнэр / нөхрийн төрсөн огноо", value: employee.spouseBirthDate },
    { label: "Хүүхдийн тоо", value: countLabel(employee.childrenCount) },
    { label: "Паспорт", value: employee.passportNumber },
    { label: "Яаралтай холбоо барих хүн", value: employee.emergencyContact },
    { label: "Яаралтай холбоо барих утас", value: employee.emergencyPhone },
  ];

  const salaryInfo: DetailPair[] = [
    { label: "Гэрээ", value: employee.contractName },
    { label: "Цалин", value: formatMoney(employee.wage) },
    { label: "Цалингийн ангилал", value: employee.payCategory },
    { label: "Банкны данс", value: employee.bankAccount },
    { label: "Ажилд орсон огноо", value: employee.startDate },
    { label: "Гэрээ дуусах огноо", value: employee.contractEndDate },
    { label: "Ажилтны төрөл", value: employee.statusLabel },
  ];

  const familyRows = compactRows([
    employee.spouseName
      ? {
          type: employee.maritalStatus || "Гэр бүл",
          name: employee.spouseName,
          register: "",
          birthDate: employee.spouseBirthDate || "",
          note: "Эхнэр / нөхөр",
        }
      : null,
    Number(employee.childrenCount || 0) > 0
      ? {
          type: "Хүүхэд",
          name: `${employee.childrenCount} хүүхэд`,
          register: "",
          birthDate: "",
          note: "Дэлгэрэнгүй бүртгэл нэмэх шаардлагатай",
        }
      : null,
  ]);

  const emergencyRows = compactRows([
    employee.emergencyContact || employee.emergencyPhone
      ? {
          name: employee.emergencyContact || "Яаралтай холбоо",
          relation: "",
          phone: employee.emergencyPhone || "",
          address: employee.homeAddress || "",
          note: "Үндсэн холбоо барих хүн",
      }
      : null,
  ]);

  const leaveCards = [
    { label: "Жилийн амралт", value: "Бүртгэлгүй", note: "Үлдэгдэл / нийт өдөр" },
    { label: "Өвчтэй чөлөө", value: "Бүртгэлгүй", note: "Эмнэлгийн магадлагаагаар" },
    { label: "Цалингүй чөлөө", value: "Бүртгэлгүй", note: "HR хүсэлтээр" },
    { label: "Ээлжийн амралт", value: "Бүртгэлгүй", note: "Төлөвлөгөөтэй" },
  ];

  const rewardRows = compactRows([
    employee.kpiScore
      ? {
          date: "",
          type: "KPI",
          amount: formatPercent(employee.kpiScore),
          note: "Гүйцэтгэлийн үнэлгээ",
        }
      : null,
    employee.disciplineScore
      ? {
          date: "",
          type: "Сахилгын оноо",
          amount: formatPercent(employee.disciplineScore),
          note: "Сахилгын бүртгэлийн оноо",
      }
      : null,
  ]);

  const skillRows = compactRows([
    employee.educationLevel
      ? {
          name: "Боловсрол",
          type: employee.educationLevel,
          level: employee.studyField || "Бүртгэлтэй",
          note: employee.studySchool || "",
        }
      : null,
    employee.gradeRank
      ? {
          name: "Зэрэг / дэв",
          type: "Ажлын ур чадвар",
          level: employee.gradeRank,
          note: employee.jobTitle || "",
        }
      : null,
    employee.biography || employee.notes
      ? {
          name: "Нэмэлт тэмдэглэл",
          type: "Тайлбар",
          level: "",
          note: employee.biography || employee.notes || "",
      }
      : null,
  ]);

  const documentRows: TableRow[] = [
    {
      name: "Иргэний үнэмлэх / регистр",
      type: "Хувийн бичиг баримт",
      status: employee.registerNumber ? "Бүртгэлтэй" : "Дутуу",
      date: "",
    },
    {
      name: "Хөдөлмөрийн гэрээ",
      type: "Гэрээ",
      status: employee.contractName || employee.contractEndDate ? "Бүртгэлтэй" : "Дутуу",
      date: employee.contractEndDate || "",
    },
    {
      name: "Диплом / боловсрол",
      type: "Боловсрол",
      status: employee.educationLevel ? "Бүртгэлтэй" : "Дутуу",
      date: "",
    },
    {
      name: "Эрүүл мэндийн бичиг",
      type: "Эрүүл мэнд",
      status: employee.missingDocumentCount ? `${employee.missingDocumentCount} дутуу` : "Шалгах",
      date: "",
    },
  ];

  const historyRows = compactRows([
    employee.startDate
      ? {
          date: employee.startDate,
          title: "Ажилд орсон",
          note: compactValue(employee.jobTitle, employee.departmentName),
        }
      : null,
    employee.contractEndDate
      ? {
          date: employee.contractEndDate,
          title: "Гэрээ дуусах огноо",
          note: employee.contractName || "Гэрээ",
        }
      : null,
    employee.departureDate
      ? {
          date: employee.departureDate,
          title: "Ажлаас гарах мэдээлэл",
          note: compactValue(employee.departureReason, employee.departureDescription),
      }
      : null,
  ]);

  const summaryDetails = [
    { icon: CalendarDays, label: "Ажилд орсон огноо", value: employee.startDate },
    { icon: Clock3, label: "Ажилласан хугацаа", value: calculateWorkedDuration(employee.startDate) },
    { icon: CalendarDays, label: "Үлдсэн амралт", value: "Бүртгэлгүй" },
    { icon: BriefcaseBusiness, label: "Төлөв", value: employee.statusLabel },
  ];

  const rightSummary: DetailPair[] = [
    { label: "Ажилтны код", value: employee.employeeCode },
    { label: "Регистрийн дугаар", value: employee.registerNumber },
    { label: "Төрсөн огноо", value: employee.birthDate },
    { label: "Хүйс", value: employee.genderLabel },
    { label: "Иргэншил", value: employee.nationality },
    { label: "Гэрийн хаяг", value: employee.homeAddress },
    { label: "Банкны данс", value: employee.bankAccount },
  ];

  function renderInfoList(items: DetailPair[], variant: "plain" | "cards" = "plain") {
    return (
      <div className={variant === "cards" ? styles.hrProfileInfoCards : styles.hrProfileInfoList}>
        {items.map((item) => (
          <div key={item.label} className={variant === "cards" ? styles.hrProfileInfoCard : styles.hrProfileInfoRow}>
            <span>{item.label}</span>
            <strong>{item.value || "Бүртгээгүй"}</strong>
          </div>
        ))}
      </div>
    );
  }

  function renderTable(columns: TableColumn[], rows: TableRow[], emptyText: string) {
    if (!rows.length) {
      return <div className={styles.hrProfileEmpty}>{emptyText}</div>;
    }

    return (
      <div className={styles.hrProfileTableWrap}>
        <table className={styles.hrProfileTable}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.name || row.title || row.type || "row"}-${index}`}>
                {columns.map((column) => (
                  <td key={column.key}>{row[column.key] || "Бүртгээгүй"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderPanel(title: string, children: ReactNode, action?: ReactNode) {
    return (
      <section className={styles.hrProfileSubPanel}>
        <div className={styles.hrProfileSubHeader}>
          <h3>{title}</h3>
          {action}
        </div>
        {children}
      </section>
    );
  }

  function renderAddLink(label: string, href: string) {
    return (
      <Link href={href} className={styles.hrProfileAddLink}>
        <Plus aria-hidden />
        <span>{label}</span>
      </Link>
    );
  }

  function renderAddFamilyButton() {
    return (
      <button
        type="button"
        className={styles.hrProfileAddLink}
        onClick={() => {
          setEditing(false);
          setAddingFamilyMember(true);
        }}
      >
        <Plus aria-hidden />
        <span>Гэр бүлийн хүн нэмэх</span>
      </button>
    );
  }

  function renderTabContent() {
    if (tab === "Ерөнхий мэдээлэл") {
      return (
        <div className={styles.hrProfileContentGrid}>
          {renderPanel("Хувийн мэдээлэл", renderInfoList(generalInfo))}
          {renderPanel("Хувийн дэлгэрэнгүй", renderInfoList(personalInfo))}
          {renderPanel(
            "Баримт бичгийн төлөв",
            renderTable(
              [
                { key: "name", label: "Баримт бичиг" },
                { key: "status", label: "Төлөв" },
                { key: "date", label: "Огноо" },
              ],
              documentRows.slice(0, 4),
              "Баримт бичгийн бүртгэл алга.",
            ),
          )}
        </div>
      );
    }

    if (tab === "Ажлын мэдээлэл") {
      return (
        <div className={styles.hrProfileWorkGrid}>
          {renderPanel("Ажлын үндсэн мэдээлэл", renderInfoList(workInfo))}
          {renderPanel(
            "Гэрээний мэдээлэл",
            renderInfoList([
              { label: "Гэрээ", value: employee.contractName },
              { label: "Эхлэх огноо", value: employee.startDate },
              { label: "Дуусах огноо", value: employee.contractEndDate },
              { label: "Одоогийн үндсэн цалин", value: formatMoney(employee.wage) },
              { label: "Ажлын төрөл", value: employee.statusLabel },
            ]),
          )}
          {renderPanel(
            "Ажил үүрэг, хариуцлага",
            <ul className={styles.hrProfileBulletList}>
              <li>{employee.jobTitle || "Албан тушаалын мэдээлэл бүртгэгдээгүй"}</li>
              <li>{employee.departmentName || "Хэлтэс бүртгэгдээгүй"}</li>
              <li>{employee.workSchedule || "Ажлын цагийн хуваарь бүртгэгдээгүй"}</li>
            </ul>,
          )}
          {renderPanel(
            "Ажлын түүх",
            renderTable(
              [
                { key: "date", label: "Огноо" },
                { key: "title", label: "Үйл явдал" },
                { key: "note", label: "Тайлбар" },
              ],
              historyRows,
              "Ажлын түүх бүртгэгдээгүй.",
            ),
            mode === "hr" ? renderAddLink("Шилжилт нэмэх", `/hr/transfers?${employeeQuery}`) : null,
          )}
        </div>
      );
    }

    if (tab === "Гэр бүл") {
      return (
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Гэр бүлийн гишүүд",
            renderTable(
              [
                { key: "type", label: "Төрөл" },
                { key: "name", label: "Нэр" },
                { key: "register", label: "Регистр" },
                { key: "birthDate", label: "Төрсөн огноо" },
                { key: "note", label: "Тайлбар" },
              ],
              familyRows,
              "Гэр бүлийн гишүүний structured бүртгэл алга.",
            ),
            renderAddFamilyButton(),
          )}
          {renderPanel(
            "Гэр бүлийн ерөнхий мэдээлэл",
            renderInfoList([
              { label: "Гэрлэлтийн байдал", value: employee.maritalStatus },
              { label: "Хүүхдийн тоо", value: countLabel(employee.childrenCount) },
              { label: "Гэрийн хаяг", value: employee.homeAddress },
            ], "cards"),
          )}
        </div>
      );
    }

    if (tab === "Яаралтай холбоо") {
      return (
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Яаралтай холбоо барих хүмүүс",
            renderTable(
              [
                { key: "name", label: "Нэр" },
                { key: "relation", label: "Хамаарал" },
                { key: "phone", label: "Утас" },
                { key: "address", label: "Хаяг" },
                { key: "note", label: "Тэмдэглэл" },
              ],
              emergencyRows,
              "Яаралтай холбоо барих хүн бүртгэгдээгүй.",
            ),
            renderAddLink("Холбоо барих хүн нэмэх", `/hr/employees/${employee.id}?edit=profile#profile-info`),
          )}
          {renderPanel(
            "Анхаарах зүйлс",
            renderInfoList([
              { label: "Эрүүл мэндийн мэдээлэл", value: employee.notes },
              { label: "Цусны бүлэг", value: "" },
              { label: "Даатгалын мэдээлэл", value: "" },
              { label: "Бусад тэмдэглэл", value: employee.biography },
            ]),
          )}
        </div>
      );
    }

    if (tab === "Чөлөө") {
      return (
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Чөлөөний үлдэгдэл",
            <div className={styles.hrProfileMetricGrid}>
              {leaveCards.map((card) => (
                <div key={card.label} className={styles.hrProfileMetricCard}>
                  <CalendarDays aria-hidden />
                  <strong>{card.value}</strong>
                  <span>{card.label}</span>
                  <small>{card.note}</small>
                </div>
              ))}
            </div>,
          )}
          {renderPanel(
            "Чөлөөний хүсэлт",
            <div className={styles.hrProfileActionStack}>
              <Link href={`/hr/sick?${employeeQuery}&type=time_off`} className={styles.primaryButton}>Чөлөө хүсэх</Link>
              <Link href={`/hr/sick?${employeeQuery}&type=annual_leave`} className={styles.secondaryButton}>Ээлжийн амралт бүртгэх</Link>
              <Link href={`/hr/sick?${employeeQuery}&type=sick`} className={styles.secondaryButton}>Өвчтэй бүртгэх</Link>
              {mode === "hr" ? <Link href={`/hr/trips?${employeeQuery}`} className={styles.secondaryButton}>Томилолт бүртгэх</Link> : null}
            </div>,
          )}
        </div>
      );
    }

    if (tab === "Цалин") {
      return (
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel("Цалин, хөлс", renderInfoList(salaryInfo))}
          {renderPanel(
            "Цалингийн нэмэгдэл",
            renderTable(
              [
                { key: "date", label: "Огноо" },
                { key: "type", label: "Төрөл" },
                { key: "amount", label: "Дүн" },
                { key: "note", label: "Тайлбар" },
              ],
              rewardRows,
              "Цалингийн нэмэгдэл бүртгэгдээгүй.",
            ),
          )}
        </div>
      );
    }

    if (tab === "Шагнал, нэмэгдэл") {
      return (
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Шагналын мэдээлэл",
            renderTable(
              [
                { key: "date", label: "Огноо" },
                { key: "type", label: "Төрөл" },
                { key: "amount", label: "Дүн / оноо" },
                { key: "note", label: "Тайлбар" },
              ],
              rewardRows,
              "Шагнал, нэмэгдэл бүртгэгдээгүй.",
            ),
            mode === "hr" ? renderAddLink("Шагнал, нэмэгдэл нэмэх", `/hr/orders?${employeeQuery}`) : null,
          )}
          {renderPanel(
            "Гүйцэтгэлийн үзүүлэлт",
            renderInfoList([
              { label: "KPI", value: formatPercent(employee.kpiScore) },
              { label: "Даалгаврын биелэлт", value: formatPercent(employee.taskCompletionPercent) },
              { label: "Сахилгын оноо", value: formatPercent(employee.disciplineScore) },
            ], "cards"),
          )}
        </div>
      );
    }

    if (tab === "Авьяас, чадвар") {
      return (
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Авьяас, чадварын жагсаалт",
            renderTable(
              [
                { key: "name", label: "Авьяас, чадвар" },
                { key: "type", label: "Төрөл" },
                { key: "level", label: "Түвшин" },
                { key: "note", label: "Тодорхойлолт" },
              ],
              skillRows,
              "Авьяас, ур чадвар бүртгэгдээгүй.",
            ),
            renderAddLink("Авьяас, чадвар нэмэх", `/hr/employees/${employee.id}?edit=profile#profile-info`),
          )}
          {renderPanel(
            "Топ чадвар",
            <div className={styles.hrProfileSkillStack}>
              {(skillRows.length ? skillRows : [{ name: "Бүртгэлгүй", level: "", note: "" }]).slice(0, 5).map((skill, index) => (
                <div key={`${skill.name}-${index}`} className={styles.hrProfileSkillRow}>
                  <span>{skill.name}</span>
                  <strong>
                    <Star aria-hidden />
                    <Star aria-hidden />
                    <Star aria-hidden />
                    <Star aria-hidden />
                    <Star aria-hidden />
                  </strong>
                </div>
              ))}
            </div>,
          )}
        </div>
      );
    }

    if (tab === "Баримт бичиг") {
      return (
        <div className={styles.hrProfileFullWidth}>
          {renderPanel(
            "Баримт бичиг",
            renderTable(
              [
                { key: "name", label: "Баримт бичиг" },
                { key: "type", label: "Төрөл" },
                { key: "status", label: "Төлөв" },
                { key: "date", label: "Огноо" },
              ],
              documentRows,
              "Баримт бичиг бүртгэгдээгүй.",
            ),
            mode === "hr" ? renderAddLink("Баримт бичиг нэмэх", `/hr/orders?${employeeQuery}`) : null,
          )}
        </div>
      );
    }

    return (
      <div className={styles.hrProfileContentGrid}>
        {renderPanel(
          "Өөрчлөлтийн түүх",
          renderTable(
            [
              { key: "date", label: "Огноо" },
              { key: "title", label: "Өөрчлөлт" },
              { key: "note", label: "Тайлбар" },
            ],
            historyRows,
            "Өөрчлөлтийн түүх бүртгэгдээгүй.",
          ),
          mode === "hr" ? renderAddLink("Шилжилт хөдөлгөөн", `/hr/transfers?${employeeQuery}`) : null,
        )}
      </div>
    );
  }

  function renderProfileEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <Field name="name" label="Нэр" defaultValue={employee.name} required />
          <Field name="employeeCode" label="Ажилтны код" defaultValue={employee.employeeCode} />
          <Field name="registerNumber" label="Регистр / үнэмлэх" defaultValue={employee.registerNumber} />
          <label className={styles.field}>
            <span>Хүйс</span>
            <select name="genderKey" defaultValue={employeeGenderValue(employee)}>
              <option value="">Сонгох</option>
              <option value="male">Эрэгтэй</option>
              <option value="female">Эмэгтэй</option>
              <option value="other">Бусад</option>
            </select>
          </label>
          <Field name="birthDate" label="Төрсөн огноо" type="date" defaultValue={employee.birthDate} />
          <Field name="workPhone" label="Ажлын утас" defaultValue={employee.workPhone} />
          <Field name="mobilePhone" label="Гар утас" defaultValue={employee.mobilePhone} />
          <Field name="workEmail" label="И-мэйл" type="email" defaultValue={employee.workEmail} />
          <Field name="privatePhone" label="Хувийн утас" defaultValue={employee.privatePhone} />
          <Field name="privateEmail" label="Хувийн и-мэйл" type="email" defaultValue={employee.privateEmail} />
          <Field name="birthPlace" label="Төрсөн газар" defaultValue={employee.placeOfBirth} />
          <TextAreaField name="homeAddress" label="Гэрийн хаяг" defaultValue={employee.homeAddress} />
          <label className={styles.field}>
            <span>Профайл зураг солих</span>
            <input name="profilePhoto" type="file" accept="image/jpeg,image/png,image/webp" />
            <small>JPG, PNG, WebP зураг 5MB хүртэл.</small>
          </label>
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderFamilyEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Гэр бүлийн гишүүд",
            renderTable(
              [
                { key: "type", label: "Төрөл" },
                { key: "name", label: "Нэр" },
                { key: "register", label: "Регистр" },
                { key: "birthDate", label: "Төрсөн огноо" },
                { key: "note", label: "Тайлбар" },
              ],
              familyRows,
              "Гэр бүлийн гишүүний structured бүртгэл алга.",
            ),
            renderAddFamilyButton(),
          )}
          {renderPanel(
            "Гэр бүлийн ерөнхий мэдээлэл",
            <>
              <div className={styles.hrProfileInfoCards}>
                <label className={styles.field}>
                  <span>Гэрлэлтийн байдал</span>
                  <select name="familyStatus" defaultValue={employeeMaritalValue(employee)}>
                    <option value="">Сонгох</option>
                    <option value="single">Ганц бие</option>
                    <option value="married">Гэрлэсэн</option>
                    <option value="cohabitant">Хамтран амьдрагчтай</option>
                    <option value="widower">Бэлэвсэн</option>
                    <option value="divorced">Салсан</option>
                  </select>
                </label>
                <Field name="childrenCount" label="Хүүхдийн тоо" type="number" defaultValue={String(employee.childrenCount ?? 0)} />
                <TextAreaField name="homeAddress" label="Гэрийн хаяг" defaultValue={employee.homeAddress} />
              </div>
              <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
            </>,
          )}
        </div>
      </form>
    );
  }

  function renderFamilyMemberAddForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Гэр бүлийн хүн нэмэх",
            <>
              <div className={styles.hrProfileInfoCards}>
                <label className={styles.field}>
                  <span>Төрөл</span>
                  <select name="familyStatus" defaultValue={employeeMaritalValue(employee) || "married"}>
                    <option value="married">Эхнэр / нөхөр</option>
                    <option value="">Хүүхэд / бусад</option>
                  </select>
                </label>
                <Field name="spouseName" label="Нэр" defaultValue={employee.spouseName} />
                <Field name="spouseBirthDate" label="Төрсөн огноо" type="date" defaultValue={employee.spouseBirthDate} />
                <Field name="childrenCount" label="Хүүхдийн тоо" type="number" defaultValue={String(employee.childrenCount ?? 0)} />
                <TextAreaField name="childrenInfo" label="Нэмэлт мэдээлэл" defaultValue="" />
              </div>
              <ProfileEditButtons pending={pending} onCancel={() => setAddingFamilyMember(false)} />
            </>,
          )}
          {renderPanel(
            "Одоогийн бүртгэл",
            renderTable(
              [
                { key: "type", label: "Төрөл" },
                { key: "name", label: "Нэр" },
                { key: "register", label: "Регистр" },
                { key: "birthDate", label: "Төрсөн огноо" },
                { key: "note", label: "Тайлбар" },
              ],
              familyRows,
              "Гэр бүлийн гишүүний structured бүртгэл алга.",
            ),
          )}
        </div>
      </form>
    );
  }

  function renderEmergencyEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <Field name="emergencyContact" label="Яаралтай холбоо барих хүн" defaultValue={employee.emergencyContact} />
          <Field name="emergencyPhone" label="Яаралтай холбоо барих утас" defaultValue={employee.emergencyPhone} />
          <TextAreaField name="homeAddress" label="Хаяг" defaultValue={employee.homeAddress} />
          <TextAreaField name="notes" label="Анхаарах зүйлс / эрүүл мэнд / бусад тэмдэглэл" defaultValue={employee.notes} rows={5} />
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderLeaveEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <TextAreaField name="annualLeaveNote" label="Ээлжийн амралтын тэмдэглэл" defaultValue="" />
          <TextAreaField name="notes" label="Чөлөө / өвчтэй / томилолтын нэмэлт тэмдэглэл" defaultValue={employee.notes} rows={5} />
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderSalaryEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <Field name="baseSalary" label="Үндсэн цалин" defaultValue={employee.wage ? String(employee.wage) : ""} />
          <Field name="payCategory" label="Цалингийн ангилал" defaultValue={employee.payCategory} />
          <Field name="bankName" label="Банк" defaultValue="" />
          <Field name="bankAccountNumber" label="Дансны дугаар" defaultValue={employee.bankAccount} />
          <Field name="taxNumber" label="ТТД дугаар" defaultValue="" />
          <Field name="socialInsuranceStartDate" label="НД төлж эхэлсэн огноо" type="date" defaultValue="" />
          <Field name="contractEndDate" label="Гэрээ дуусах огноо" type="date" defaultValue={employee.contractEndDate} />
          <TextAreaField name="notes" label="Цалин, банкны нэмэлт тэмдэглэл" defaultValue={employee.notes} rows={4} />
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderRewardEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <Field name="kpiScore" label="KPI (%)" type="number" defaultValue={String(employee.kpiScore ?? 0)} />
          <Field name="taskCompletionPercent" label="Даалгаврын биелэлт (%)" type="number" defaultValue={String(employee.taskCompletionPercent ?? 0)} />
          <Field name="disciplineScore" label="Сахилгын оноо (%)" type="number" defaultValue={String(employee.disciplineScore ?? 0)} />
          <TextAreaField name="notes" label="Шагнал, нэмэгдлийн тэмдэглэл" defaultValue={employee.notes} rows={5} />
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderSkillEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <Field name="studyField" label="Мэргэжил / боловсролын чиглэл" defaultValue={employee.studyField} />
          <Field name="studySchool" label="Сургууль" defaultValue={employee.studySchool} />
          <Field name="gradeRank" label="Зэрэг / дэв" defaultValue={employee.gradeRank} />
          <TextAreaField name="talent" label="Авьяас / спорт / урлаг" defaultValue="" />
          <TextAreaField name="skillLevel" label="Ур чадвар ба зэрэглэл" defaultValue="" />
          <TextAreaField name="previousEmployment" label="Ажиллаж байсан байгууллагууд" defaultValue="" />
          <TextAreaField name="additionalDuty" label="Хавсран ажиллаж буй / нэмэлт ажил" defaultValue="" />
          <Field name="trialEndDate" label="Туршилтын хугацаа дуусах" type="date" defaultValue="" />
          <TextAreaField name="notes" label="Нэмэлт тэмдэглэл" defaultValue={employee.notes} rows={5} />
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderDocumentEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <Field name="registerNumber" label="Регистр / иргэний үнэмлэх" defaultValue={employee.registerNumber} />
          <Field name="contractEndDate" label="Хөдөлмөрийн гэрээ дуусах огноо" type="date" defaultValue={employee.contractEndDate} />
          <Field name="missingDocumentCount" label="Дутуу баримтын тоо" type="number" defaultValue={String(employee.missingDocumentCount ?? 0)} />
          <Field name="studyField" label="Диплом / боловсролын чиглэл" defaultValue={employee.studyField} />
          <Field name="studySchool" label="Сургууль" defaultValue={employee.studySchool} />
          <TextAreaField name="notes" label="Баримт бичгийн тэмдэглэл" defaultValue={employee.notes} rows={5} />
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderHistoryEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <Field name="startDate" label="Ажилд орсон огноо" type="date" defaultValue={employee.startDate} />
          <Field name="contractEndDate" label="Гэрээ дуусах огноо" type="date" defaultValue={employee.contractEndDate} />
          <Field name="departureDate" label="Ажлаас гарсан огноо" type="date" defaultValue={employee.departureDate} />
          <Field name="departureDescription" label="Ажлаас гарсан тайлбар" defaultValue={employee.departureDescription} />
          <TextAreaField name="notes" label="Өөрчлөлтийн түүхийн тэмдэглэл" defaultValue={employee.notes} rows={5} />
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderWorkEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.formGrid}>
          <Select
            name="departmentId"
            label="Хэлтэс / алба"
            options={departments}
            defaultValue={employee.departmentId ?? ""}
            required
          />
          <Select name="jobId" label="Албан тушаал" options={jobs} defaultValue={employee.jobId ?? ""} required />
          <Field name="jobTitle" label="Ажлын нэр" defaultValue={editableTextValue(employee.jobTitle)} />
          <Select name="managerId" label="Шууд удирдлага" options={managers} defaultValue={employee.managerId ?? ""} />
          <Field name="startDate" label="Ажилд орсон огноо" type="date" defaultValue={employee.startDate} />
          <Field name="contractEndDate" label="Гэрээ дуусах огноо" type="date" defaultValue={employee.contractEndDate} />
          <Field name="gradeRank" label="Зэрэг / дэв" defaultValue={employee.gradeRank} />
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderTabEditForm() {
    switch (tab) {
      case "Ерөнхий мэдээлэл":
        return renderProfileEditForm();
      case "Ажлын мэдээлэл":
        return renderWorkEditForm();
      case "Гэр бүл":
        return renderFamilyEditForm();
      case "Яаралтай холбоо":
        return renderEmergencyEditForm();
      case "Чөлөө":
        return renderLeaveEditForm();
      case "Цалин":
        return renderSalaryEditForm();
      case "Шагнал, нэмэгдэл":
        return renderRewardEditForm();
      case "Авьяас, чадвар":
        return renderSkillEditForm();
      case "Баримт бичиг":
        return renderDocumentEditForm();
      default:
        return renderHistoryEditForm();
    }
  }

  return (
    <section id="profile-info" className={styles.hrProfileShell}>
      <div className={styles.hrProfileBreadcrumb}>
        <Link href="/hr/employees">Ажилтнууд</Link>
        <span>/</span>
        <strong>Ажилтны дэлгэрэнгүй</strong>
      </div>

      <div className={styles.hrProfileHero}>
        <div className={styles.hrProfileIdentity}>
          <div className={styles.hrProfilePhotoFrame}>
            {showPhoto && employee.photoUrl ? (
              <Image
                src={employee.photoUrl}
                alt={`${employee.name} зураг`}
                width={156}
                height={156}
                className={styles.employeePhoto}
                onError={() => setPhotoErrorUrl(employee.photoUrl)}
                unoptimized
              />
            ) : (
              <span className={styles.employeePhotoPlaceholder}>{initials || "А"}</span>
            )}
          </div>
          <div className={styles.hrProfileIdentityText}>
            <div className={styles.hrProfileNameRow}>
              <h2>{employee.name}</h2>
              <span className={styles.hrProfileStatusPill}>{employee.statusLabel || "Идэвхтэй"}</span>
            </div>
            <p>{employee.jobTitle || "Албан тушаал бүртгээгүй"}</p>
            <ul>
              <li><Phone aria-hidden />{employee.workPhone || employee.mobilePhone || "Утас бүртгээгүй"}</li>
              <li><Mail aria-hidden />{employee.workEmail || "И-мэйл бүртгээгүй"}</li>
              <li><Building2 aria-hidden />{employee.departmentName || "Хэлтэс бүртгээгүй"}</li>
              <li><Users aria-hidden />Шууд удирдлага: {employee.managerName || "Бүртгээгүй"}</li>
            </ul>
          </div>
        </div>

        <div className={styles.hrProfileHeroMetrics}>
          {summaryDetails.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={styles.hrProfileHeroMetric}>
                <Icon aria-hidden />
                <span>{item.label}</span>
                <strong>{item.value || "Бүртгээгүй"}</strong>
              </div>
            );
          })}
        </div>

        <div className={styles.hrProfileHeroFacts}>
          {rightSummary.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value || "Бүртгээгүй"}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.hrProfileTabBar}>
        {detailTabs.map((item) => {
          const Icon = detailTabIcons[item] ?? IdCard;
          return (
            <button
              key={item}
              type="button"
              className={tab === item ? styles.hrProfileTabActive : styles.hrProfileTab}
              onClick={() => selectTab(item)}
            >
              <Icon aria-hidden />
              <span>{item}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.hrProfileContentPanel}>
        <div className={styles.hrProfileContentHeader}>
          <div>
            <h2>{tab}</h2>
            <p>{tab === "Ерөнхий мэдээлэл" ? "Ажилтны үндсэн болон хувийн бүртгэлийн мэдээлэл" : "Ажилтны дэлгэрэнгүй бүртгэлийн мэдээлэл"}</p>
          </div>
          <div className={styles.hrProfileHeaderActions}>
            {canEditCurrentTab && !editing && !addingFamilyMember ? (
              <button type="button" className={styles.secondaryButton} onClick={() => setEditing((value) => !value)}>
                <Pencil aria-hidden />
                <span>Засах</span>
              </button>
            ) : null}
            {tabActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className={styles.primaryButton}>
                  <Icon aria-hidden />
                  <span>{action.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {message ? <p className={messageIsError ? styles.errorText : styles.successText}>{message}</p> : null}

        {canEdit && addingFamilyMember ? renderFamilyMemberAddForm() : canEdit && editing ? renderTabEditForm() : renderTabContent()}
      </div>
    </section>
  );
}

type DetailTabAction = {
  label: string;
  href: string;
  icon: typeof FileCheck2;
};

function getEmployeeDetailTabActions(tab: string, employeeQuery: string, mode: "hr" | "department"): DetailTabAction[] {
  if (tab === "Чөлөө") {
    const actions: DetailTabAction[] = [
      { label: mode === "hr" ? "Чөлөө бүртгэх" : "Чөлөө хүсэх", href: `/hr/sick?${employeeQuery}&type=time_off`, icon: FileCheck2 },
      { label: "Ээлжийн амралт бүртгэх", href: `/hr/sick?${employeeQuery}&type=annual_leave`, icon: CalendarDays },
      { label: "Өвчтэй бүртгэх", href: `/hr/sick?${employeeQuery}&type=sick`, icon: HeartPulse },
    ];
    if (mode === "hr") {
      actions.push({ label: "Томилолт бүртгэх", href: `/hr/trips?${employeeQuery}`, icon: Plane });
    }
    return actions;
  }

  if (mode !== "hr") {
    return [];
  }

  if (tab === "Шагнал, нэмэгдэл") {
    return [{ label: "Тушаал / гэрээ нэмэх", href: `/hr/orders?${employeeQuery}`, icon: ScrollText }];
  }
  if (tab === "Баримт бичиг") {
    return [{ label: "Хавсралт нэмэх", href: `/hr/orders?${employeeQuery}`, icon: FilePlus2 }];
  }
  if (tab === "Өөрчлөлтийн түүх" || tab === "Ажлын мэдээлэл") {
    return [
      { label: "Шилжилт бүртгэх", href: `/hr/transfers?${employeeQuery}`, icon: Repeat2 },
      { label: "Тойрох хуудас", href: `/hr/clearance?${employeeQuery}`, icon: BriefcaseBusiness },
    ];
  }

  return [];
}

function ProfileEditButtons({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className={styles.profileEditActions}>
      <button className={styles.primaryButton} disabled={pending}>
        {pending ? "Хадгалж байна..." : "Хадгалах"}
      </button>
      <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={pending}>
        Болих
      </button>
    </div>
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
  const requestedType = searchParams.get("type");
  const defaultType: HrTimeoffRequestType =
    requestedType === "sick" ? "sick" : requestedType === "annual_leave" ? "annual_leave" : "time_off";
  const defaultFilter = searchParams.get("state") || searchParams.get("requestType") || ALL;
  const defaultEmployeeId = searchParams.get("employeeId") || "";
  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee.id) === defaultEmployeeId) ?? null,
    [defaultEmployeeId, employees],
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState(defaultFilter);
  const [editingRequest, setEditingRequest] = useState<HrTimeoffRequest | null>(null);
  const [selectedRequestType, setSelectedRequestType] = useState<HrTimeoffRequestType>(defaultType);
  const annualLeaveOnlyMode = mode === "hr" && defaultType === "annual_leave";

  const visibleRequests = useMemo(() => {
    if (filter === ALL) return requests;
    if (filter === "pending") {
      return requests.filter((request) => request.state === "submitted" || request.state === "hr_review");
    }
    return requests.filter((request) => request.state === filter || request.requestType === filter);
  }, [filter, requests]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    setMessage("");
    const formData = new FormData(form);
    const intent = submitter?.value || String(formData.get("intent") || "submit");
    if (submitter?.name && !formData.has(submitter.name)) {
      formData.set(submitter.name, intent);
    }
    const requestTypeValue = String(formData.get("requestType") || selectedRequestType);
    const hasNewAttachment = formData.getAll("files").some((value) => value instanceof File && value.size > 0);
    if (intent !== "draft" && requestTypeValue === "annual_leave" && !editingRequest?.hasAttachment && !hasNewAttachment) {
      setMessage("Ээлжийн амралт бүртгэхэд баримт файл заавал хавсаргана уу.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(
        editingRequest ? `/api/hr/timeoff-requests/${editingRequest.id}` : "/api/hr/timeoff-requests",
        { method: editingRequest ? "PATCH" : "POST", body: formData },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Хүсэлт илгээхэд алдаа гарлаа.");
      }
      setMessage(editingRequest ? "Хүсэлт шинэчлэгдлээ." : formData.get("intent") === "draft" ? "Ноорог хадгалагдлаа." : "Хүсэлт HR-д илгээгдлээ.");
      setEditingRequest(null);
      setSelectedRequestType(defaultType);
      router.refresh();
      form.reset();
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
    <div className={mode === "hr" ? styles.singleColumn : styles.twoColumn}>
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
            <option value="pending">Хяналт хүлээж буй</option>
            <option value="submitted">Хүлээгдэж буй</option>
            <option value="hr_review">HR шалгаж байна</option>
            <option value="approved">Батлагдсан</option>
            <option value="rejected">Татгалзсан</option>
            <option value="time_off">Чөлөө</option>
            <option value="annual_leave">Ээлжийн амралт</option>
            <option value="sick">Өвчтэй</option>
          </select>
        </div>

        {message ? <p className={message.includes("алдаа") || message.includes("эрх") ? styles.errorText : styles.successText}>{message}</p> : null}

        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.requestTable}`}>
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
                  <td data-label="Хэлтэс">{request.departmentName}</td>
                  <td data-label="Төрөл">{request.requestTypeLabel}</td>
                  <td data-label="Хугацаа">
                    {request.dateFrom} - {request.dateTo}
                  </td>
                  <td>{request.submittedBy || "Бүртгээгүй"}</td>
                  <td data-label="Төлөв">
                    <span className={styles.statusPill}>{request.stateLabel}</span>
                  </td>
                  <td data-label="Хавсралт">
                    <AttachmentLinks hasAttachment={request.hasAttachment} attachmentIds={request.attachmentIds} />
                  </td>
                  <td data-label="Үйлдэл">
                    <div className={styles.checklist}>
                      {mode === "hr" && request.state === "submitted" ? (
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionButtonReview}`}
                          onClick={() => runAction(request.id, "hr_review")}
                          disabled={pending}
                        >
                          HR шалгах
                        </button>
                      ) : null}
                      {mode === "hr" && ["submitted", "hr_review"].includes(request.state) ? (
                        <>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.actionButtonApprove}`}
                            onClick={() => runAction(request.id, "approve")}
                            disabled={pending}
                          >
                            Батлах
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.actionButtonReject}`}
                            onClick={() => runAction(request.id, "reject")}
                            disabled={pending}
                          >
                            Татгалзах
                          </button>
                        </>
                      ) : null}
                      {mode === "department" && !["approved", "rejected", "cancelled"].includes(request.state) ? (
                        <>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.actionButtonReview}`}
                            onClick={() => {
                              setEditingRequest(request);
                              setSelectedRequestType(request.requestType);
                            }}
                            disabled={pending}
                          >
                            Засах
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.actionButtonReject}`}
                            onClick={() => runAction(request.id, "cancel")}
                            disabled={pending}
                          >
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

      {mode === "department" || defaultType === "annual_leave" ? (
      <form key={editingRequest?.id ?? "new"} className={styles.formPanel} onSubmit={submit} noValidate>
        <h2>{editingRequest ? "Хүсэлт засах" : selectedRequestType === "annual_leave" ? "Ээлжийн амралт бүртгэх" : "Чөлөө / өвчтэй хүсэлт"}</h2>
        {message ? <p className={isErrorMessage(message) ? styles.errorText : styles.successText}>{message}</p> : null}
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
        <EmployeeSelect
          employees={employees}
          defaultValue={editingRequest?.employeeId || defaultEmployeeId}
          disabled={Boolean(editingRequest)}
        />
        {annualLeaveOnlyMode ? (
          <input type="hidden" name="requestType" value="annual_leave" />
        ) : (
          <label className={styles.field}>
            <span>Төрөл</span>
            <select
              name="requestType"
              value={selectedRequestType}
              onChange={(event) => setSelectedRequestType(event.target.value as HrTimeoffRequestType)}
              required
            >
              <option value="time_off">Чөлөө</option>
              <option value="annual_leave">Ээлжийн амралт</option>
              <option value="sick">Өвчтэй</option>
            </select>
          </label>
        )}
        <div className={styles.formGridTwo}>
          <Field name="dateFrom" label="Эхлэх огноо" type="date" required defaultValue={editingRequest?.dateFrom} />
          <Field name="dateTo" label="Дуусах огноо" type="date" required defaultValue={editingRequest?.dateTo} />
        </div>
        <label className={styles.field}>
          <span>{selectedRequestType === "annual_leave" ? "Тайлбар" : "Шалтгаан"}</span>
          <textarea
            name="reason"
            rows={4}
            defaultValue={editingRequest?.reason || (selectedRequestType === "annual_leave" ? "Ээлжийн амралт" : "")}
            required={selectedRequestType !== "annual_leave"}
          />
        </label>
        <label className={styles.field}>
          <span>{selectedRequestType === "annual_leave" ? "Баримт файл" : "Хавсралтын зураг"}</span>
          <input name="files" type="file" accept="image/*,.pdf,.doc,.docx" multiple />
          <small>
            {selectedRequestType === "annual_leave"
              ? "Ээлжийн амралт бүртгэхэд баримт файл хавсаргана."
              : "Заавал биш. Баримтыг дараа нь нэмэж болно."}
          </small>
        </label>
        {selectedRequestType !== "annual_leave" ? (
          <label className={styles.field}>
            <span>Тайлбар</span>
            <textarea name="note" rows={3} defaultValue={editingRequest?.note || ""} />
          </label>
        ) : null}
        <div className={styles.actionGrid}>
          <button className={styles.primaryButton} name="intent" value="submit" disabled={pending}>
            {pending ? "Илгээж байна..." : "Илгээх"}
          </button>
          <button className={styles.primaryButton} name="intent" value="draft" disabled={pending}>
            Ноорог хадгалах
          </button>
          {editingRequest ? (
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => {
                setEditingRequest(null);
                setSelectedRequestType(defaultType);
              }}
              disabled={pending}
            >
              Болих
            </button>
          ) : null}
        </div>
      </form>
      ) : null}
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
        <EmployeeSelect employees={employees} defaultValue={defaultEmployeeId} />
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
          <small>Заавал биш. Тайлбар бичээд илгээж, баримтыг дараа нь нэмэж болно.</small>
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
  records = [],
  columns = [],
  createAnchorLabel = "Шинэ бүртгэл үүсгэх",
  hideCreateAnchor = false,
  allowRecordActions = false,
}: {
  title: string;
  description: string;
  fields: RegistryField[];
  checklist?: string[];
  selectedEmployee?: HrEmployeeDirectoryItem | null;
  submitEndpoint?: string;
  submitLabel?: string;
  successMessage?: string;
  records?: RegistryRecord[];
  columns?: RegistryColumn[];
  createAnchorLabel?: string;
  hideCreateAnchor?: boolean;
  allowRecordActions?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editingRecord, setEditingRecord] = useState<RegistryRecord | null>(null);
  const [selectValues, setSelectValues] = useState<Record<string, string>>({});
  const selectedContext = editingRecord || selectedEmployee;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitEndpoint) {
      return;
    }

    setPending(true);
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      let endpoint =
        editingRecord && allowRecordActions ? `${submitEndpoint}/${encodeURIComponent(String(editingRecord.id))}` : submitEndpoint;
      if (endpoint.includes(":employeeId")) {
        const employeeId = String(formData.get("employeeId") || "").trim();
        if (!employeeId) {
          throw new Error("Ажилтан заавал сонгоно уу.");
        }
        endpoint = endpoint.replace(":employeeId", encodeURIComponent(employeeId));
      }
      const response = await fetch(endpoint, { method: editingRecord && allowRecordActions ? "PATCH" : "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || (editingRecord ? "Бүртгэл засахад алдаа гарлаа." : "Бүртгэл үүсгэхэд алдаа гарлаа."));
      }
      setMessage(editingRecord ? "Бүртгэл засагдлаа." : successMessage);
      setEditingRecord(null);
      setSelectValues({});
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : editingRecord ? "Бүртгэл засахад алдаа гарлаа." : "Бүртгэл үүсгэхэд алдаа гарлаа.");
    } finally {
      setPending(false);
    }
  }

  async function deleteRecord(record: RegistryRecord) {
    if (!submitEndpoint || !allowRecordActions || !record.id) {
      return;
    }
    if (!window.confirm("Энэ сахилгын бүртгэлийг устгах уу?")) {
      return;
    }

    const recordId = String(record.id);
    setDeletePendingId(recordId);
    setMessage("");
    try {
      const response = await fetch(`${submitEndpoint}/${encodeURIComponent(recordId)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Бүртгэл устгахад алдаа гарлаа.");
      }
      if (editingRecord?.id === record.id) {
        setEditingRecord(null);
      }
      setMessage("Бүртгэл устгагдлаа.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Бүртгэл устгахад алдаа гарлаа.");
    } finally {
      setDeletePendingId(null);
    }
  }

  function normalizeField(field: RegistryField) {
    return typeof field === "string" ? { label: field, name: field } : { name: field.label, ...field };
  }

  function getRecordValue(field: ReturnType<typeof normalizeField>) {
    if (!editingRecord) {
      return field.defaultValue || "";
    }
    const value = editingRecord[field.name || field.label];
    return value === null || value === undefined ? field.defaultValue || "" : String(value);
  }

  function renderSelectedEmployeeField(field: ReturnType<typeof normalizeField>) {
    if (!selectedContext) {
      return null;
    }

    if (field.label === "Ажилтан") {
      const employeeId = editingRecord?.employeeId || selectedEmployee?.id;
      const employeeName = String(editingRecord?.employeeName || selectedEmployee?.name || "Ажилтан бүртгээгүй");
      return (
        <label key={field.label} className={styles.field}>
          <span>Ажилтан</span>
          <input value={employeeName} readOnly />
          {employeeId ? <input name="employeeId" type="hidden" value={String(employeeId)} /> : null}
        </label>
      );
    }

    if (field.label === "Хэлтэс") {
      const departmentId = editingRecord?.departmentId || selectedEmployee?.departmentId;
      const departmentName = String(editingRecord?.departmentName || selectedEmployee?.departmentName || "Хэлтэс бүртгээгүй");
      return (
        <label key={field.label} className={styles.field}>
          <span>Хэлтэс</span>
          <input value={departmentName} readOnly />
          {departmentId ? <input name="departmentId" type="hidden" value={String(departmentId)} /> : null}
        </label>
      );
    }

    if (field.label === "Албан тушаал") {
      const jobTitle = String(editingRecord?.jobTitle || selectedEmployee?.jobTitle || "Албан тушаал бүртгээгүй");
      return (
        <label key={field.label} className={styles.field}>
          <span>Албан тушаал</span>
          <input value={jobTitle} readOnly />
        </label>
      );
    }

    return null;
  }

  const normalizedFields = fields.map((field) => normalizeField(field));
  const noteField = normalizedFields.find((field) => field.name === "note" || field.label === "Тайлбар");
  const gridFields = noteField
    ? normalizedFields.filter((field) => field !== noteField)
    : normalizedFields;

  function getSelectValue(field: ReturnType<typeof normalizeField>) {
    const fieldName = field.name || field.label;
    return selectValues[fieldName] ?? getRecordValue(field);
  }

  function getCurrentSelectValue(fieldName: string) {
    const field = normalizedFields.find((item) => (item.name || item.label) === fieldName);
    return field ? getSelectValue(field) : "";
  }

  function getVisibleOptions(field: ReturnType<typeof normalizeField>) {
    const options = field.options || [];
    const fieldName = field.name || field.label;
    const selectedDepartmentId = getCurrentSelectValue("departmentId");
    const selectedJobTitle = getCurrentSelectValue("jobTitle");

    if (fieldName === "jobTitle" && options.some((option) => option.departmentId !== undefined)) {
      if (!selectedDepartmentId) {
        return [];
      }
      return options.filter((option) => String(option.departmentId || "") === selectedDepartmentId);
    }

    if (fieldName === "employeeId" && options.some((option) => option.departmentId !== undefined)) {
      if (!selectedDepartmentId) {
        return [];
      }
      return options.filter(
        (option) =>
          String(option.departmentId || "") === selectedDepartmentId &&
          (!selectedJobTitle || String(option.jobTitle || "") === selectedJobTitle),
      );
    }

    return options;
  }

  function getSelectPlaceholder(field: ReturnType<typeof normalizeField>) {
    const fieldName = field.name || field.label;
    const selectedDepartmentId = getCurrentSelectValue("departmentId");
    if ((fieldName === "jobTitle" || fieldName === "employeeId") && !selectedDepartmentId) {
      return "Эхлээд хэлтэс сонгох";
    }
    return field.placeholder || "Сонгох";
  }

  function updateSelectValue(field: ReturnType<typeof normalizeField>, value: string) {
    const fieldName = field.name || field.label;
    setSelectValues((current) => {
      const next = { ...current, [fieldName]: value };
      if (fieldName === "departmentId") {
        delete next.jobTitle;
        delete next.employeeId;
      }
      if (fieldName === "jobTitle") {
        delete next.employeeId;
      }
      return next;
    });
  }

  return (
    <div className={styles.twoColumn}>
      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2>{title}</h2>
          <span>{records.length}</span>
        </div>
        {submitEndpoint && !hideCreateAnchor ? (
          <div className={styles.toolbar}>
            <a
              href="#new-registry-record"
              className={styles.primaryLink}
              onClick={() => {
                setEditingRecord(null);
                setMessage("");
                setSelectValues({});
              }}
            >
              {createAnchorLabel}
            </a>
          </div>
        ) : null}
        {records.length && columns.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  {allowRecordActions ? <th>Үйлдэл</th> : null}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={String(record.id)}>
                    {columns.map((column) => {
                      const value = record[column.key];
                      const href = column.hrefKey ? record[column.hrefKey] : "";
                      return (
                        <td key={column.key}>
                          {href ? <Link href={String(href)}>{String(value || "Бүртгээгүй")}</Link> : String(value || "Бүртгээгүй")}
                        </td>
                      );
                    })}
                    {allowRecordActions ? (
                      <td>
                        <div className={styles.recordActions}>
                          <a
                            href="#new-registry-record"
                            className={styles.secondaryButton}
                            onClick={() => {
                              setEditingRecord(record);
                              setMessage("");
                            }}
                          >
                            <Pencil aria-hidden />
                            Засах
                          </a>
                          <button
                            type="button"
                            className={styles.dangerButton}
                            disabled={deletePendingId === String(record.id)}
                            onClick={() => deleteRecord(record)}
                          >
                            <Trash2 aria-hidden />
                            {deletePendingId === String(record.id) ? "Устгаж байна..." : "Устгах"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>Одоогоор бүртгэл алга.</strong>
            <span>Шинэ бүртгэл үүсгэж эхлээрэй.</span>
          </div>
        )}
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
      <form key={editingRecord ? `edit-${editingRecord.id}` : "new-registry-record"} id="new-registry-record" className={styles.formPanel} onSubmit={submit} noValidate>
        <h2>{editingRecord ? "Бүртгэл засах" : "Шинэ бүртгэл"}</h2>
        <p className={styles.mutedText}>{description}</p>
        {message ? <p className={isErrorMessage(message) ? styles.errorText : styles.successText}>{message}</p> : null}
        {selectedContext ? (
          <div className={styles.selectedEmployeeContext}>
            <span>Сонгосон ажилтан</span>
            <strong>{String(editingRecord?.employeeName || selectedEmployee?.name || "Ажилтан бүртгээгүй")}</strong>
            <small>
              {String(editingRecord?.departmentName || selectedEmployee?.departmentName || "Хэлтэс бүртгээгүй")} ·{" "}
              {String(editingRecord?.jobTitle || selectedEmployee?.jobTitle || "Албан тушаал бүртгээгүй")}
            </small>
          </div>
        ) : null}
        <div className={styles.formGrid}>
          {gridFields.map((fieldConfig) => {
            if (fieldConfig.options?.length) {
              const visibleOptions = getVisibleOptions(fieldConfig);
              const visibleOptionValues = new Set(visibleOptions.map((option) => String(option.id)));
              const selectValue = String(getSelectValue(fieldConfig) || "");
              const normalizedSelectValue =
                selectValue && visibleOptionValues.has(selectValue) ? selectValue : "";
              const fieldName = fieldConfig.name || fieldConfig.label;
              const disabled =
                (fieldName === "jobTitle" || fieldName === "employeeId") &&
                !getCurrentSelectValue("departmentId");
              return (
                <label key={fieldConfig.label} className={styles.field}>
                  <span>{fieldConfig.label}</span>
                  <select
                    name={fieldName}
                    value={normalizedSelectValue}
                    required={fieldConfig.required}
                    disabled={disabled}
                    onChange={(event) => updateSelectValue(fieldConfig, event.target.value)}
                  >
                    <option value="">{getSelectPlaceholder(fieldConfig)}</option>
                    {visibleOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            const selectedField = renderSelectedEmployeeField(fieldConfig);
            if (selectedField) {
              return selectedField;
            }

            return (
              <Field
                key={fieldConfig.label}
                name={fieldConfig.name}
                label={fieldConfig.label}
                type={fieldConfig.type}
                defaultValue={getRecordValue(fieldConfig)}
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
        {noteField ? (
          <label className={`${styles.field} ${styles.registryNoteField}`}>
            <span>{noteField.label}</span>
            <textarea
              name={noteField.name}
              rows={5}
              defaultValue={getRecordValue(noteField)}
              required={noteField.required}
              placeholder={noteField.placeholder}
            />
          </label>
        ) : null}
        <div className={styles.actionGrid}>
          <button className={styles.primaryButton} type={submitEndpoint ? "submit" : "button"} disabled={pending}>
            <FilePlus2 aria-hidden />
            {pending ? (editingRecord ? "Хадгалж байна..." : "Үүсгэж байна...") : editingRecord ? "Хадгалах" : submitLabel}
          </button>
          {editingRecord ? (
            <button className={styles.secondaryButton} type="button" disabled={pending} onClick={() => setEditingRecord(null)}>
              Болих
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
