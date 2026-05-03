"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, FilePlus2, Search } from "lucide-react";

import type { HrLeaveItem, HrOption } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import styles from "./hr.module.css";

const ALL = "__all__";

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

export function EmployeeTable({ employees }: { employees: HrEmployeeDirectoryItem[] }) {
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
        <Link href="/hr/employees/new" className={styles.primaryLink}>
          Шинэ ажилтан
        </Link>
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
    <form className={styles.formPanel} onSubmit={submit}>
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
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input name={name} type={type} required={required} />
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

      <form className={styles.formPanel} onSubmit={submit}>
        <h2>{defaultSick ? "Өвчтэй чөлөө бүртгэх" : "Чөлөө бүртгэх"}</h2>
        {message ? <p className={message.includes("хадгалагд") ? styles.successText : styles.errorText}>{message}</p> : null}
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
}: {
  title: string;
  description: string;
  fields: string[];
  checklist?: string[];
}) {
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
      <section className={styles.formPanel}>
        <h2>Шинэ бүртгэл</h2>
        <p className={styles.mutedText}>{description}</p>
        <div className={styles.formGrid}>
          {fields.map((field) => (
            <Field key={field} name={field} label={field} />
          ))}
        </div>
        <label className={styles.field}>
          <span>Хавсралт</span>
          <input type="file" />
        </label>
        <button className={styles.primaryButton} type="button">
          <FilePlus2 aria-hidden />
          Бүртгэл үүсгэх
        </button>
      </section>
    </div>
  );
}
