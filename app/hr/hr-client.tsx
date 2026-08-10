"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  Archive,
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  FileText,
  FileCheck2,
  FilePlus2,
  HeartPulse,
  GraduationCap,
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
  X,
  type LucideIcon,
} from "lucide-react";

import { compareHrDepartmentNames } from "@/lib/hr-department-order";
import { formatEmployeeDisplayName } from "@/lib/hr-name";
import type { HrLeaveItem, HrOption, HrSelectionOption, HrTimeoffRequest, HrTimeoffRequestType } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import styles from "./hr.module.css";

const ALL = "__all__";
const DEFAULT_EMPLOYEE_STATUS = "Идэвхтэй";
type HrFamilyMember = NonNullable<HrEmployeeDirectoryItem["familyMembers"]>[number];
const familyRelationLabels: Record<string, string> = {
  spouse: "Эхнэр / нөхөр",
  child: "Хүүхэд",
  father: "Аав",
  mother: "Ээж",
  parent: "Эцэг / эх",
  sibling: "Ах / эгч / дүү",
  other: "Бусад",
};

function getFormDataString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isTrialWorkType(value?: string | null) {
  return String(value || "").trim() === "Туршилтаар";
}

function createFamilyMemberDraft(formData: FormData, id: number, employeeId: number): HrFamilyMember {
  const relation = getFormDataString(formData, "relation") || "spouse";
  const relatedEmployeeId = Number(getFormDataString(formData, "relatedEmployeeId")) || 0;

  return {
    id,
    employeeId,
    relatedEmployeeId,
    relatedEmployeeName: getFormDataString(formData, "name"),
    relation,
    relationLabel: familyRelationLabels[relation] || familyRelationLabels.other,
    birthYear: getFormDataString(formData, "birthYear"),
    school: getFormDataString(formData, "school"),
    phone: getFormDataString(formData, "phone"),
    departmentName: "",
    jobTitle: "",
    note: "",
  };
}

type EducationDraftRow = {
  id: string;
  level: string;
  field: string;
  school: string;
};

type DocumentDraftRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  date: string;
  attachmentIds: number[];
};

type TalentSkillDraftRow = {
  id: string;
  name: string;
  type: string;
  level: string;
  note: string;
};

const educationLevelOptions = [
  "Бүрэн бус дунд",
  "Бүрэн дунд",
  "Мэргэжлийн боловсрол",
  "Тусгай дунд",
  "Бакалавр",
  "Магистр",
  "Доктор",
];

const documentTypeOptions = [
  "Хувийн бичиг баримт",
  "Жолооны бичиг баримт",
  "Даатгал",
  "Эрүүл мэнд",
  "Боловсрол",
  "Гэрээ",
  "Бусад",
];

function splitEmployeeName(fullName?: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { lastName: "", firstName: parts[0] || "" };
  }
  return {
    lastName: parts[0],
    firstName: parts.slice(1).join(" "),
  };
}

function educationRowsFromEmployee(employee: HrEmployeeDirectoryItem): EducationDraftRow[] {
  const rows = employee.educationRecords?.length
    ? employee.educationRecords
    : employee.educationLevel || employee.studyField || employee.studySchool
      ? [{
          id: "education-1",
          level: employee.educationLevel || "",
          field: employee.studyField || "",
          school: employee.studySchool || "",
        }]
      : [];

  return rows.map((row, index) => ({
    id: row.id || `education-${index + 1}`,
    level: row.level || "",
    field: row.field || "",
    school: row.school || "",
  }));
}

function emptyEducationRow(): EducationDraftRow {
  return {
    id: `education-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level: "",
    field: "",
    school: "",
  };
}

function documentRowsFromEmployee(employee: HrEmployeeDirectoryItem): DocumentDraftRow[] {
  return (employee.documentRecords || []).map((row, index) => ({
    id: row.id || `document-${index + 1}`,
    name: row.name || "",
    type: row.type || "",
    status: row.status || "Бүртгэлтэй",
    date: row.date || "",
    attachmentIds: Array.isArray(row.attachmentIds) ? row.attachmentIds : [],
  }));
}

function emptyDocumentRow(): DocumentDraftRow {
  return {
    id: `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    type: "",
    status: "Бүртгэлтэй",
    date: "",
    attachmentIds: [],
  };
}

function emptyTalentSkillRow(): TalentSkillDraftRow {
  return {
    id: `talent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    type: "",
    level: "",
    note: "",
  };
}

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
  // Ажилтны багана — зураг + нэр + албан тушаалаар харуулна
  photoKey?: string;
  subKey?: string;
};

function EmployeeIdentity({
  name,
  jobTitle,
  photoUrl,
  href,
}: {
  name: string;
  jobTitle?: string;
  photoUrl?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className={styles.identityAvatar}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className={styles.identityAvatarImg} />
        ) : (
          employeeInitials(name)
        )}
      </span>
      <span className={styles.identityMain}>
        <strong className={styles.identityName}>{formatEmployeeDisplayName(name)}</strong>
        {jobTitle ? <small className={styles.identitySub}>{jobTitle}</small> : null}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={styles.identityRow}>
      {body}
    </Link>
  ) : (
    <span className={styles.identityRow}>{body}</span>
  );
}

// Бүртгэлийн мөрийг ажилтны картаар харуулах (зураг + нэр + тушаал + хэлтэс + төлөв + дэлгэрэнгүй)
function RegistryEmployeeCard({
  record,
  columns,
}: {
  record: RegistryRecord;
  columns: RegistryColumn[];
}) {
  const idCol = columns.find((column) => column.photoKey);
  const name = idCol ? String(record[idCol.key] ?? "") : "";
  const jobTitle = idCol?.subKey ? String(record[idCol.subKey] ?? "") : "";
  const photoUrl = idCol?.photoKey ? String(record[idCol.photoKey] ?? "") : "";
  const href = idCol?.hrefKey ? String(record[idCol.hrefKey] ?? "") : "";
  const deptCol = columns.find(
    (column) => column !== idCol && /department|хэлтэс|алба нэгж/i.test(`${column.key} ${column.label}`),
  );
  const statusCol = columns.find((column) => /state|status|төлөв/i.test(`${column.key} ${column.label}`));
  const dept = deptCol ? String(record[deptCol.key] ?? "") : "";
  const status = statusCol ? String(record[statusCol.key] ?? "") : "";
  const metaColumns = columns.filter(
    (column) => column !== idCol && column !== deptCol && column !== statusCol && column.key !== idCol?.subKey,
  );
  const head = (
    <>
      <span className={styles.employeeGridAvatar}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className={styles.employeeGridAvatarImg} />
        ) : (
          employeeInitials(name)
        )}
      </span>
      <strong className={styles.employeeGridName}>{formatEmployeeDisplayName(name)}</strong>
      {jobTitle ? <span className={styles.employeeGridTitle}>{jobTitle}</span> : null}
      {dept ? <span className={styles.employeeGridDept}>{dept}</span> : null}
      {status ? <span className={styles.statusPill}>{status}</span> : null}
    </>
  );
  return (
    <div className={styles.registryCard}>
      {href ? (
        <Link href={href} className={styles.registryCardHead}>
          {head}
        </Link>
      ) : (
        <div className={styles.registryCardHead}>{head}</div>
      )}
      {metaColumns.length ? (
        <dl className={styles.registryCardMeta}>
          {metaColumns.map((column) => {
            const value = record[column.key];
            if (value === undefined || value === null || value === "") return null;
            return (
              <div key={column.key}>
                <dt>{column.label}</dt>
                <dd>{String(value)}</dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </div>
  );
}

function employeeInitials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("mn-MN") ?? "").join("") || "?";
}

// Байгууллагын хэмжээнд хамгийн дээр гарах удирдлага: Захирал → Үйл ажиллагаа
// хариуцсан менежер → Дотоод хяналт. Бусад нь 100 (хэлтсээрээ эрэмбэлэгдэнэ).
function topLeadershipRank(jobTitle?: string | null) {
  const title = (jobTitle || "").toLocaleLowerCase("mn-MN");
  if (title.includes("захирал")) return 0;
  if (title.includes("үйл ажиллагаа") && title.includes("менежер")) return 1;
  if (title.includes("дотоод хяналт")) return 2;
  return 100;
}

// Хэлтэс доторх дэс дараа: дарга → ерөнхий нягтлан/ХН → менежер → бусад
function employeeRoleRank(jobTitle?: string | null) {
  const title = (jobTitle || "").toLocaleLowerCase("mn-MN");
  if (title.includes("дарга")) return 0;
  if (title.includes("ерөнхий ня") || title.includes("ерөнхий нягтлан")) return 1;
  if (title.includes("хүний нөөц")) return 1;
  if (title.includes("менежер")) return 2;
  if (title.includes("нягтлан") || title.includes("ня-бо") || title.includes("мэргэжилтэн")) return 3;
  return 5;
}

// Албан тушаалын түвшингээр бүлэглэх дараалал (6 шат + бусад)
const POSITION_TIER_LABELS = [
  "Дээд шатны удирдлага",
  "Дунд шатны удирдлага",
  "Анхан шатны удирдлага",
  "Мэргэжлийн ажилтан",
  "Техникийн ажилтан",
  "Үйлдвэрлэл, үйлчилгээний ажилтан",
  "Бусад",
];

function positionTierRank(jobTitle?: string | null) {
  const title = (jobTitle || "").toLocaleLowerCase("mn-MN");
  if (!title) return 6;
  // 0 — Удирдах дээд шат
  if (title.includes("захирал")) return 0;
  if (title.includes("үйл ажиллагаа") && title.includes("менежер")) return 0;
  // 1 — Дунд шатны удирдлага
  if (title.includes("дарга")) return 1;
  // 2 — Анхан шатны удирдлага (ахлах/мастер/ерөнхий мэргэжилтэн)
  if (title.includes("ахлах")) return 2;
  if (title.includes("мастер")) return 2;
  if (title.includes("ерөнхий механик")) return 2;
  if (title.includes("ерөнхий ня") || title.includes("ерөнхий нягтлан")) return 2;
  // 3 — Мэргэжлийн ажилтан
  if (
    title.includes("мэргэжилтэн") ||
    title.includes("инженер") ||
    title.includes("нягтлан") ||
    title.includes("ня-бо") ||
    title.includes("хяналтын ажилтан") ||
    title.includes("технологи") ||
    title.includes("хуулийн") ||
    title.includes("архив") ||
    title.includes("хүний нөөц") ||
    title.includes("олон нийт")
  ) {
    return 3;
  }
  // 4 — Техникийн ажилтан (мэргэжлийн ур чадвартай)
  if (
    title.includes("засварчин") ||
    title.includes("гагнуурчин") ||
    title.includes("цахилгаанчин") ||
    title.includes("мужаан") ||
    title.includes("механик")
  ) {
    return 4;
  }
  // 5 — Үйлдвэрлэл, үйлчилгээний ажилтан
  if (
    title.includes("жолооч") ||
    title.includes("ачигч") ||
    title.includes("оператор") ||
    title.includes("үйлчлэгч") ||
    title.includes("цэвэрлэг") ||
    title.includes("туслах") ||
    title.includes("харуул") ||
    title.includes("нярав")
  ) {
    return 5;
  }
  return 6;
}

// Зургийг дөрвөлжин болгон "cover" аргаар босоо байрлалаар (offsetYPercent) тайрч Blob болгоно
function cropImageCover(url: string, offsetYPercent: number, size = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => {
      const naturalW = img.naturalWidth || size;
      const naturalH = img.naturalHeight || size;
      const scale = Math.max(size / naturalW, size / naturalH);
      const drawW = naturalW * scale;
      const drawH = naturalH * scale;
      const offX = (drawW - size) / 2;
      const clampedY = Math.max(0, Math.min(100, offsetYPercent));
      const offY = (drawH - size) * (clampedY / 100);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas unsupported"));
        return;
      }
      ctx.drawImage(img, -offX, -offY, drawW, drawH);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("crop failed"))),
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

function statusLabel(employee: HrEmployeeDirectoryItem) {
  if (!employee.active || ["archived", "terminated", "resigned"].includes(employee.statusKey)) {
    return "Ажлаас чөлөөлсөн";
  }
  if (employee.statusKey === "probation") {
    return isTrialEndDateExpired(employee.trialEndDate) ? "Туршилт дууссан" : "Туршилт";
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

function matchesEmployeeStatusFilter(employee: HrEmployeeDirectoryItem, filter: string) {
  if (filter === ALL) {
    return true;
  }
  const label = statusLabel(employee);
  if (filter === "Идэвхтэй") {
    return (
      employee.active &&
      !["archived", "terminated", "resigned"].includes(employee.statusKey) &&
      ["Идэвхтэй", "Туршилт", "Туршилт дууссан"].includes(label)
    );
  }
  return label === filter;
}

function todayInUlaanbaatar() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isTrialEndDateExpired(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= todayInUlaanbaatar());
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
  const jobTitles = useMemo(
    () =>
      Array.from(new Set(employees.map((employee) => employee.jobTitle).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "mn-MN"),
      ),
    [employees],
  );
  const router = useRouter();
  const [query, setQuery] = useState("");
  const initialDepartment = searchParams.get("department") || ALL;
  const [department, setDepartment] = useState(initialDepartment);
  const [jobTitle, setJobTitle] = useState(ALL);
  const [status, setStatus] = useState(searchParams.get("status") || DEFAULT_EMPLOYEE_STATUS);
  // Хэлтсийн шүүлтүүрийг URL-д тусгана — дэлгэрэнгүйгээс буцахад шүүлт хадгалагдана
  useEffect(() => {
    const params = new URLSearchParams();
    if (department !== ALL) params.set("department", department);
    const queryString = params.toString();
    router.replace(queryString ? `/hr/employees?${queryString}` : "/hr/employees", {
      scroll: false,
    });
  }, [department, router]);

  const visibleEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("mn-MN");
    const filtered = employees.filter((employee) => {
      const matchesQuery = normalizedQuery
        ? [
            employee.name,
            employee.departmentName,
            employee.jobTitle,
            employee.mobilePhone,
            employee.workEmail,
          ]
            .filter(Boolean)
            .some((value) => value.toLocaleLowerCase("mn-MN").includes(normalizedQuery))
        : true;
      const matchesDepartment = department === ALL || employee.departmentName === department;
      const matchesJobTitle = jobTitle === ALL || employee.jobTitle === jobTitle;
      const matchesStatus = matchesEmployeeStatusFilter(employee, status);
      return matchesQuery && matchesDepartment && matchesJobTitle && matchesStatus;
    });
    // Албан тушаалын түвшингээр (6 шат) бүлэглэн эрэмбэлж, шат дотор нь
    // удирдлага → хэлтэс → гол албан тушаал → нэрээр эрэмбэлнэ.
    return [...filtered].sort(
      (left, right) =>
        positionTierRank(left.jobTitle) - positionTierRank(right.jobTitle) ||
        topLeadershipRank(left.jobTitle) - topLeadershipRank(right.jobTitle) ||
        (left.departmentName || "").localeCompare(right.departmentName || "", "mn-MN") ||
        employeeRoleRank(left.jobTitle) - employeeRoleRank(right.jobTitle) ||
        left.name.localeCompare(right.name, "mn-MN"),
    );
  }, [department, employees, jobTitle, query, status]);

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
        <select value={jobTitle} onChange={(event) => setJobTitle(event.target.value)}>
          <option value={ALL}>Бүх албан тушаал</option>
          {jobTitles.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value={ALL}>Бүх төлөв</option>
          <option value="Идэвхтэй">Идэвхтэй</option>
          <option value="Туршилт">Туршилт</option>
          <option value="Туршилт дууссан">Туршилт дууссан</option>
          <option value="Чөлөөтэй">Чөлөөтэй</option>
          <option value="Ээлжийн амралттай">Ээлжийн амралттай</option>
          <option value="Өвчтэй">Өвчтэй</option>
          <option value="Томилолттой">Томилолттой</option>
          <option value="Ажлаас чөлөөлсөн">Ажлаас чөлөөлсөн</option>
        </select>
        {canCreateEmployee ? (
          <Link href="/hr/employees/new" className={styles.primaryLink}>
            Шинэ ажилтан
          </Link>
        ) : null}
      </div>

      <div className={styles.filterSummary} role="status" aria-live="polite">
        Одоогийн шүүлтээр <strong>{visibleEmployees.length}</strong> хүн байна
      </div>

      <div className={styles.employeeGrid}>
        {visibleEmployees.map((employee, index) => {
          const tier = positionTierRank(employee.jobTitle);
          const showTierHeader =
            index === 0 || tier !== positionTierRank(visibleEmployees[index - 1].jobTitle);
          return (
          <Fragment key={employee.id}>
          {showTierHeader ? (
            <div className={styles.tierHeader}>
              <span>{POSITION_TIER_LABELS[tier]}</span>
            </div>
          ) : null}
          <Link
            href={`/hr/employees/${employee.id}`}
            className={styles.employeeGridCard}
          >
            <span className={styles.employeeGridAvatar}>
              {employee.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={employee.photoUrl} alt="" className={styles.employeeGridAvatarImg} />
              ) : (
                employeeInitials(employee.name)
              )}
            </span>
            <strong className={styles.employeeGridName}>
              {formatEmployeeDisplayName(employee.name)}
            </strong>
            <span className={styles.employeeGridTitle}>
              {employee.jobTitle || "Албан тушаал бүртгээгүй"}
            </span>
            <span className={styles.employeeGridDept}>
              {employee.departmentName || "Хэлтэс бүртгээгүй"}
            </span>
            <span
              className={`${styles.statusPill} ${statusLabel(employee) === "Туршилт дууссан" ? styles.statusPillWarning : ""}`}
            >
              {statusLabel(employee)}
            </span>
          </Link>
          </Fragment>
          );
        })}
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
  const [createWorkType, setCreateWorkType] = useState("Үндсэн");
  const [createEducationRows, setCreateEducationRows] = useState<EducationDraftRow[]>(() => [emptyEducationRow()]);
  const [createDocumentRows, setCreateDocumentRows] = useState<DocumentDraftRow[]>(() => [emptyDocumentRow()]);
  const [createTalentSkillRows, setCreateTalentSkillRows] = useState<TalentSkillDraftRow[]>(() => [emptyTalentSkillRow()]);
  const showCreateTrialDates = createWorkType === "Туршилтаар";

  function normalizedCreateEducationRows(rows = createEducationRows) {
    return rows
      .map((row, index) => ({
        id: row.id || `education-${index + 1}`,
        level: row.level.trim(),
        field: row.field.trim(),
        school: row.school.trim(),
      }))
      .filter((row) => row.level || row.field || row.school);
  }

  function updateCreateEducationRow(id: string, field: keyof Omit<EducationDraftRow, "id">, value: string) {
    setCreateEducationRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addCreateEducationRow() {
    setCreateEducationRows((rows) => [...rows, emptyEducationRow()]);
  }

  function removeCreateEducationRow(id: string) {
    setCreateEducationRows((rows) => {
      const nextRows = rows.filter((row) => row.id !== id);
      return nextRows.length ? nextRows : [emptyEducationRow()];
    });
  }

  function normalizedCreateDocumentRows(rows = createDocumentRows) {
    return rows
      .map((row, index) => ({
        id: row.id || `document-${index + 1}`,
        name: row.name.trim(),
        type: row.type.trim(),
        status: row.status || "Бүртгэлтэй",
        date: row.date.trim(),
        attachmentIds: Array.isArray(row.attachmentIds) ? row.attachmentIds : [],
      }))
      .filter((row) => row.name || row.type || row.date || row.attachmentIds.length);
  }

  function updateCreateDocumentRow(id: string, field: keyof Omit<DocumentDraftRow, "id" | "attachmentIds">, value: string) {
    setCreateDocumentRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function handleCreateDocumentFileChange(rowId: string, fileName?: string) {
    if (!fileName) return;
    setCreateDocumentRows((rows) =>
      rows.map((row) => (row.id === rowId && !row.name.trim() ? { ...row, name: fileName } : row)),
    );
  }

  function addCreateDocumentRow() {
    setCreateDocumentRows((rows) => [...rows, emptyDocumentRow()]);
  }

  function removeCreateDocumentRow(id: string) {
    setCreateDocumentRows((rows) => {
      const nextRows = rows.filter((row) => row.id !== id);
      return nextRows.length ? nextRows : [emptyDocumentRow()];
    });
  }

  function normalizedCreateTalentSkillRows(rows = createTalentSkillRows) {
    return rows
      .map((row, index) => ({
        id: row.id || `talent-${index + 1}`,
        name: row.name.trim(),
        type: row.type.trim(),
        level: row.level.trim(),
        note: row.note.trim(),
      }))
      .filter((row) => row.name || row.type || row.level || row.note);
  }

  function updateCreateTalentSkillRow(id: string, field: keyof Omit<TalentSkillDraftRow, "id">, value: string) {
    setCreateTalentSkillRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addCreateTalentSkillRow() {
    setCreateTalentSkillRows((rows) => [...rows, emptyTalentSkillRow()]);
  }

  function removeCreateTalentSkillRow(id: string) {
    setCreateTalentSkillRows((rows) => {
      const nextRows = rows.filter((row) => row.id !== id);
      return nextRows.length ? nextRows : [emptyTalentSkillRow()];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const educationRecords = normalizedCreateEducationRows();
    const primaryEducation = educationRecords[0];
    formData.set("educationRecords", JSON.stringify(educationRecords));
    formData.set("educationLevel", primaryEducation?.level || "");
    formData.set("studyField", primaryEducation?.field || "");
    formData.set("studySchool", primaryEducation?.school || "");
    formData.set("documentRecords", JSON.stringify(normalizedCreateDocumentRows()));
    const talentSkillRecords = normalizedCreateTalentSkillRows();
    const primaryTalentSkill = talentSkillRecords[0];
    formData.set("talentSkillRecords", JSON.stringify(talentSkillRecords));
    formData.set("talent", primaryTalentSkill?.name || "");
    formData.set("skillLevel", primaryTalentSkill?.level || "");
    formData.set("previousEmployment", primaryTalentSkill?.type || "");
    formData.set("additionalDuty", primaryTalentSkill?.note || "");
    if (!showCreateTrialDates) {
      formData.delete("trialEndDate");
    }

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

  const savedCreateEducationRows = normalizedCreateEducationRows();
  const primaryCreateEducation = savedCreateEducationRows[0];
  const savedCreateDocumentRows = normalizedCreateDocumentRows();
  const savedCreateTalentSkillRows = normalizedCreateTalentSkillRows();
  const primaryCreateTalentSkill = savedCreateTalentSkillRows[0];

  return (
    <form className={styles.formPanel} onSubmit={submit} noValidate>
      {message ? <p className={styles.errorText}>{message}</p> : null}
      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <h2>Үндсэн мэдээлэл</h2>
          <p>Овог, нэрийг заавал оруулна. Бусад талбарыг боломжтой үед нөхөж болно.</p>
        </div>
      <div className={styles.formGrid}>
        <Field name="lastName" label="Овог" required />
        <Field name="firstName" label="Нэр" required />
        <Field name="registerNumber" label="Регистрийн дугаар" />
        <label className={styles.field}>
          <span>Хүйс</span>
          <select name="gender" defaultValue="">
            <option value="">Сонгох</option>
            <option value="male">Эрэгтэй</option>
            <option value="female">Эмэгтэй</option>
            <option value="other">Бусад</option>
          </select>
        </label>
        <Field name="birthDate" label="Төрсөн огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} />
        <Field name="countryOfBirth" label="Төрсөн улс" />
        <Field name="nationality" label="Иргэншил" />
        <Field name="phone" label="Гар утас" />
        <Field name="email" label="Имэйл" type="email" />
        <label className={styles.field}>
          <span>Ажилтны зураг</span>
          <input name="profilePhoto" type="file" accept="image/jpeg,image/png,image/webp" />
          <small>JPG, PNG, WebP зураг 5MB хүртэл.</small>
        </label>
        <Select name="departmentId" label="Хэлтэс / алба" options={departments} />
        <Select name="jobId" label="Албан тушаал" options={jobs} />
        <Select name="managerId" label="Удирдлага" options={managers} />
        <label className={styles.field}>
          <span>Ажиллах төрөл</span>
          <select name="workType" value={createWorkType} onChange={(event) => setCreateWorkType(event.currentTarget.value)}>
            <option>Үндсэн</option>
            <option>Туршилтаар</option>
            <option>Гэрээт</option>
            <option>Улирлын</option>
          </select>
        </label>
        <Field name="startDate" label="Ажилд орсон огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} />
        {showCreateTrialDates ? (
          <>
            <Field name="trialEndDate" label="Туршилт дуусах огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} />
          </>
        ) : null}
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
          <Field name="birthPlace" label="Төрсөн хот / аймаг / сум" />
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <h2>Боловсрол</h2>
          <p>Боловсролын түвшин, дипломын чиглэл болон сургууль нь заавал биш.</p>
        </div>
        <input type="hidden" name="educationRecords" value={JSON.stringify(savedCreateEducationRows)} readOnly />
        <input type="hidden" name="educationLevel" value={primaryCreateEducation?.level || ""} readOnly />
        <input type="hidden" name="studyField" value={primaryCreateEducation?.field || ""} readOnly />
        <input type="hidden" name="studySchool" value={primaryCreateEducation?.school || ""} readOnly />
        <div className={styles.familyMemberEditList}>
          {createEducationRows.map((education) => (
            <div key={education.id} className={styles.familyMemberEditRow}>
              <label className={styles.field}>
                <span>Боловсролын түвшин</span>
                <select value={education.level} onChange={(event) => updateCreateEducationRow(education.id, "level", event.currentTarget.value)}>
                  <option value="">Сонгох</option>
                  {educationLevelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Диплом / мэргэжил</span>
                <input value={education.field} onChange={(event) => updateCreateEducationRow(education.id, "field", event.currentTarget.value)} />
              </label>
              <label className={styles.field}>
                <span>Сургууль</span>
                <input value={education.school} onChange={(event) => updateCreateEducationRow(education.id, "school", event.currentTarget.value)} />
              </label>
              <div className={styles.familyMemberRowActions}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => removeCreateEducationRow(education.id)}
                  disabled={createEducationRows.length === 1 && !normalizedCreateEducationRows([education]).length}
                >
                  <Trash2 aria-hidden />
                  <span>Устгах</span>
                </button>
              </div>
            </div>
          ))}
          <div className={styles.familyMemberRowActions}>
            <button type="button" className={styles.secondaryButton} onClick={addCreateEducationRow}>
              <Plus aria-hidden />
              <span>Мөр нэмэх</span>
            </button>
          </div>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Боловсролын зураг / файл</span>
            <input name="educationDocument" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
            <small>JPG, PNG, WebP зураг эсвэл PDF файл 10MB хүртэл.</small>
          </label>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <h2>Баримт бичиг</h2>
          <p>Гэрээ, тушаал, үнэмлэх, диплом болон бусад ажилтны хувийн хэргийн файлыг бүртгэнэ.</p>
        </div>
        <input type="hidden" name="documentRecords" value={JSON.stringify(savedCreateDocumentRows)} readOnly />
        <div className={styles.familyMemberEditList}>
          {createDocumentRows.map((document, index) => (
            <div key={document.id} className={styles.familyMemberEditRow}>
              <label className={styles.field}>
                <span>Баримт бичиг</span>
                <input
                  value={document.name}
                  onChange={(event) => updateCreateDocumentRow(document.id, "name", event.currentTarget.value)}
                  placeholder="Жишээ: Иргэний үнэмлэх"
                />
              </label>
              <label className={styles.field}>
                <span>Төрөл</span>
                <select value={document.type} onChange={(event) => updateCreateDocumentRow(document.id, "type", event.currentTarget.value)}>
                  <option value="">Сонгох</option>
                  {documentTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Огноо</span>
                <input
                  value={document.date}
                  onChange={(event) => updateCreateDocumentRow(document.id, "date", event.currentTarget.value)}
                  placeholder="Ж: 2026-06-15"
                />
              </label>
              <label className={styles.field}>
                <span>Файл / зураг</span>
                <input
                  name={`documentFile-${document.id}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => handleCreateDocumentFileChange(document.id, event.currentTarget.files?.[0]?.name)}
                />
                <small>JPG, PNG, WebP зураг эсвэл PDF файл 10MB хүртэл.</small>
              </label>
              <div className={styles.familyMemberRowActions}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => removeCreateDocumentRow(document.id)}
                  disabled={createDocumentRows.length === 1 && !normalizedCreateDocumentRows([document]).length}
                  aria-label={`${index + 1}-р баримт бичгийн мөр устгах`}
                >
                  <Trash2 aria-hidden />
                  <span>Устгах</span>
                </button>
              </div>
            </div>
          ))}
          <div className={styles.familyMemberRowActions}>
            <button type="button" className={styles.secondaryButton} onClick={addCreateDocumentRow}>
              <Plus aria-hidden />
              <span>Мөр нэмэх</span>
            </button>
          </div>
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
          <Field name="socialInsuranceStartDate" label="НД төлж эхэлсэн огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} />
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <h2>Ур чадвар, ажлын түүх</h2>
          <p>Авьяас, ур чадвар болон өмнөх ажлын мэдээлэл. Заавал бөглөхгүй.</p>
        </div>
        <input type="hidden" name="talentSkillRecords" value={JSON.stringify(savedCreateTalentSkillRows)} readOnly />
        <input type="hidden" name="talent" value={primaryCreateTalentSkill?.name || ""} readOnly />
        <input type="hidden" name="skillLevel" value={primaryCreateTalentSkill?.level || ""} readOnly />
        <input type="hidden" name="previousEmployment" value={primaryCreateTalentSkill?.type || ""} readOnly />
        <input type="hidden" name="additionalDuty" value={primaryCreateTalentSkill?.note || ""} readOnly />
        <div className={styles.familyMemberEditList}>
          {createTalentSkillRows.map((skill) => (
            <div key={skill.id} className={styles.createMultiFieldRow}>
              <label className={styles.field}>
                <span>Авьяас / спорт / урлаг</span>
                <input value={skill.name} onChange={(event) => updateCreateTalentSkillRow(skill.id, "name", event.currentTarget.value)} />
              </label>
              <label className={styles.field}>
                <span>Ур чадвар ба зэрэглэл</span>
                <input value={skill.level} onChange={(event) => updateCreateTalentSkillRow(skill.id, "level", event.currentTarget.value)} />
              </label>
              <label className={styles.field}>
                <span>Ажиллаж байсан байгууллагууд</span>
                <input value={skill.type} onChange={(event) => updateCreateTalentSkillRow(skill.id, "type", event.currentTarget.value)} />
              </label>
              <label className={styles.field}>
                <span>Хавсран ажиллаж буй / нэмэлт ажил</span>
                <input value={skill.note} onChange={(event) => updateCreateTalentSkillRow(skill.id, "note", event.currentTarget.value)} />
              </label>
              <div className={styles.familyMemberRowActions}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => removeCreateTalentSkillRow(skill.id)}
                  disabled={createTalentSkillRows.length === 1 && !normalizedCreateTalentSkillRows([skill]).length}
                >
                  <Trash2 aria-hidden />
                  <span>Устгах</span>
                </button>
              </div>
            </div>
          ))}
          <div className={styles.familyMemberRowActions}>
            <button type="button" className={styles.secondaryButton} onClick={addCreateTalentSkillRow}>
              <Plus aria-hidden />
              <span>Мөр нэмэх</span>
            </button>
          </div>
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
  inputMode,
  placeholder,
  pattern,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  readOnly?: boolean;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  placeholder?: string;
  pattern?: string;
  maxLength?: number;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        readOnly={readOnly}
        inputMode={inputMode}
        placeholder={placeholder}
        pattern={pattern}
        maxLength={maxLength}
      />
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
        name: formatEmployeeDisplayName(employee.name),
        description: [employee.name, employee.departmentName, employee.jobTitle].filter(Boolean).join(" · "),
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
  "Боловсрол",
  "Яаралтай холбоо",
  "Чөлөө",
  "Цалин",
  "Шагнал, нэмэгдэл",
  "Авьяас, чадвар",
  "Баримт бичиг",
  "Өөрчлөлтийн түүх",
];

const editableDetailTabs = new Set([
  "Ерөнхий мэдээлэл",
  "Ажлын мэдээлэл",
  "Гэр бүл",
  "Боловсрол",
  "Яаралтай холбоо",
  "Цалин",
  "Баримт бичиг",
]);

const detailTabIcons: Record<string, LucideIcon> = {
  "Ерөнхий мэдээлэл": User,
  "Ажлын мэдээлэл": BriefcaseBusiness,
  "Гэр бүл": Users,
  "Боловсрол": GraduationCap,
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

type DetailPair = {
  label: string;
  value?: string;
};

type WorkInfoCardData = {
  title: string;
  help: string;
  rows: DetailPair[];
};

type TableColumn = {
  key: string;
  label: string;
};

type TableRow = Record<string, string>;

function compactRows(rows: Array<TableRow | null | false | undefined>) {
  return rows.filter((row): row is TableRow => Boolean(row));
}

function hasUsefulValue(value?: string | number | null) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("mn-MN");
  if (!normalized) return false;
  const emptyTokens = [
    "бүртгээгүй",
    "бүртгэлгүй",
    "хэлтэсгүй",
    "хэлтэс бүртгээгүй",
    "алба нэгж бүртгээгүй",
    "алба нэгж бүртгэлгүй",
    "албан тушаал бүртгээгүй",
    "албан тушаал бүртгэлгүй",
    "утас бүртгээгүй",
    "утас бүртгэлгүй",
    "и-мэйл бүртгээгүй",
    "и-мэйл бүртгэлгүй",
  ];
  return !emptyTokens.some((token) => normalized.includes(token));
}

function formatWorkValue(value?: string | number | null) {
  return hasUsefulValue(value) ? String(value).trim() : "—";
}

function ProfileValue({ value, fallback = "Бүртгээгүй" }: { value?: string | number | null; fallback?: string }) {
  const displayValue = hasUsefulValue(value) ? String(value).trim() : fallback;
  const isEmpty = !hasUsefulValue(displayValue);
  return <strong className={isEmpty ? styles.hrProfileEmptyValue : undefined}>{displayValue}</strong>;
}

function getMissingWorkFields(employee: HrEmployeeDirectoryItem) {
  const importantFields: DetailPair[] = [
    { label: "Хэлтэс / алба", value: employee.departmentName },
    { label: "Албан тушаал", value: employee.jobTitle },
    { label: "Шууд удирдлага", value: employee.managerName },
    { label: "Ажилд орсон огноо", value: employee.startDate },
  ];

  return importantFields.filter((field) => !hasUsefulValue(field.value));
}

function WorkInfoRow({ row }: { row: DetailPair }) {
  const value = formatWorkValue(row.value);

  return (
    <div className={styles.workInfoRow}>
      <span className={styles.workInfoLabel}>{row.label}</span>
      <strong className={`${styles.workInfoValue} ${value === "—" ? styles.emptyValue : ""}`}>{value}</strong>
    </div>
  );
}

function WorkInfoCard({ card }: { card: WorkInfoCardData }) {
  return (
    <section className={styles.workInfoCard}>
      <div className={styles.workInfoCardHeader}>
        <h3 className={styles.workInfoCardTitle}>{card.title}</h3>
        <p className={styles.workInfoCardHelp}>{card.help}</p>
      </div>
      <div className={styles.workInfoRows}>{card.rows.map((row) => <WorkInfoRow key={row.label} row={row} />)}</div>
    </section>
  );
}

function WorkInformationPanel({
  employee,
  cards,
  missingFields,
  historyRows,
  transferHref,
  canAddTransfer,
}: {
  employee: HrEmployeeDirectoryItem;
  cards: WorkInfoCardData[];
  missingFields: DetailPair[];
  historyRows: TableRow[];
  transferHref: string;
  canAddTransfer: boolean;
}) {
  return (
    <div className={styles.workInfoPanel}>
      {missingFields.length ? (
        <div className={styles.missingWorkBanner} role="status">
          <div>
            <strong>Дутуу мэдээлэл байна: {missingFields.length} талбар</strong>
            <span>Шаардлагатай ажлын мэдээллийг бүрэн бөглөнө үү.</span>
          </div>
          <div className={styles.missingWorkChips}>
            {missingFields.map((field) => (
              <span key={field.label}>{field.label}</span>
            ))}
          </div>
        </div>
      ) : null}

      <section className={styles.workSnapshot}>
        <div className={styles.workSnapshotMain}>
          <span>Ажлын товч мэдээлэл</span>
          <strong>{formatWorkValue(employee.departmentName)}</strong>
          <p>{formatWorkValue(employee.jobTitle)}</p>
        </div>
        <div className={styles.workSnapshotMeta}>
          <div>
            <span>Шууд удирдлага</span>
            <strong>{formatWorkValue(employee.managerName)}</strong>
          </div>
          <div>
            <span>Төлөв</span>
            <strong className={styles.workStatusPill}>{formatWorkValue(employee.statusLabel)}</strong>
          </div>
        </div>
        <p className={styles.workSnapshotHelp}>
          Алба, албан тушаал, шууд удирдлага өөрчлөгдвөл ажлын шилжилтийн түүхээр бүртгэнэ.
        </p>
      </section>

      <div className={styles.workInfoGrid}>{cards.map((card) => <WorkInfoCard key={card.title} card={card} />)}</div>

      {canAddTransfer ? (
        <section className={styles.workTransferCta}>
          <div>
            <h3>Алба, албан тушаал, шууд удирдлага өөрчлөх үү?</h3>
            <p>Эдгээр өөрчлөлт нь ажилтны түүхэнд бүртгэгдэх тул ажлын шилжилтийн урсгалаар оруулна.</p>
          </div>
          <Link href={transferHref} className={styles.primaryActionButton}>
            <Repeat2 aria-hidden />
            <span>Ажлын шилжилт бүртгэх</span>
          </Link>
        </section>
      ) : null}

      <section className={styles.workHistoryPanel}>
        <div className={styles.workHistoryHeader}>
          <div>
            <h3>Ажлын түүх</h3>
            <p>Хэлтэс, албан тушаал, шууд удирдлага, төлөвийн өөрчлөлт энд бүртгэгдэнэ.</p>
          </div>
          {canAddTransfer ? (
            <Link href={transferHref} className={styles.hrProfileAddLink}>
              <Plus aria-hidden />
              <span>Шилжилт нэмэх</span>
            </Link>
          ) : null}
        </div>

        {historyRows.length ? (
          <div className={styles.hrProfileTableWrap}>
            <table className={styles.hrProfileTable}>
              <thead>
                <tr>
                  <th>Огноо</th>
                  <th>Үйл явдал</th>
                  <th>Тайлбар</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row, index) => (
                  <tr key={`${row.title}-${row.date}-${index}`}>
                    <td>{row.date || "—"}</td>
                    <td>{row.title || "—"}</td>
                    <td>{row.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.workHistoryEmpty}>
            <strong>Ажлын түүх бүртгэгдээгүй.</strong>
            <span>Шилжилт бүртгэсний дараа түүх автоматаар харагдана.</span>
          </div>
        )}
      </section>
    </div>
  );
}

export function EmployeeDetailTabs({
  employee,
  canEdit = false,
  mode = "hr",
}: {
  employee: HrEmployeeDirectoryItem;
  canEdit?: boolean;
  mode?: "hr" | "department";
}) {
  const [tab, setTab] = useState(detailTabs[0]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(canEdit && searchParams.get("edit") === "profile");
  const [addingFamilyMember, setAddingFamilyMember] = useState(canEdit && searchParams.get("edit") === "family-member");
  const [pending, setPending] = useState(false);
  const [familyMemberPending, setFamilyMemberPending] = useState(false);
  const [familyMemberActionPending, setFamilyMemberActionPending] = useState("");
  const [familyMembers, setFamilyMembers] = useState<HrFamilyMember[]>(() => employee.familyMembers || []);
  const [workEditType, setWorkEditType] = useState(employee.workType || "");
  const [educationRows, setEducationRows] = useState<EducationDraftRow[]>(() => educationRowsFromEmployee(employee));
  const [documentDraftRows, setDocumentDraftRows] = useState<DocumentDraftRow[]>(() => documentRowsFromEmployee(employee));
  const [recordAddPending, setRecordAddPending] = useState(false);
  const [addingEmergencyContact, setAddingEmergencyContact] = useState(false);
  const [addingReward, setAddingReward] = useState(false);
  const [addingTalentSkill, setAddingTalentSkill] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [photoErrorUrl, setPhotoErrorUrl] = useState("");
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState("");
  const [removeProfilePhoto, setRemoveProfilePhoto] = useState(false);
  const [photoOffsetY, setPhotoOffsetY] = useState(50);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const photoDragRef = useRef<{ startY: number; startOffset: number; height: number } | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const familyMemberDraftIdRef = useRef(-1);
  const initials = employee.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("mn-MN");
  const showPhoto = Boolean(employee.photoUrl && photoErrorUrl !== employee.photoUrl);
  const currentProfilePhotoUrl = showPhoto ? employee.photoLargeUrl || employee.photoUrl || "" : "";
  const profilePhotoEditUrl = removeProfilePhoto ? "" : profilePhotoPreviewUrl || currentProfilePhotoUrl;
  const employeeNameParts = splitEmployeeName(employee.name);
  const employeeQuery = `employeeId=${employee.id}`;
  const canEditCurrentTab = canEdit && editableDetailTabs.has(tab);
  const primaryActions = [
    ...(mode === "hr" ? [{ label: "Ажлын шилжилт бүртгэх", href: `/hr/transfers?${employeeQuery}`, icon: Repeat2 }] : []),
    ...(mode === "hr" ? [{ label: "Тойрох хуудас", href: `/hr/clearance?${employeeQuery}`, icon: BriefcaseBusiness }] : []),
    ...(mode === "hr" ? [{ label: "Ажлаас чөлөөлөх", href: `/hr/archive?${employeeQuery}`, icon: Archive }] : []),
  ];
  const recordActions = [
    { label: mode === "hr" ? "Чөлөө" : "Чөлөө хүсэх", href: `/hr/sick?${employeeQuery}&type=time_off`, icon: FileCheck2 },
    { label: "Ээлжийн амралт", href: `/hr/sick?${employeeQuery}&type=annual_leave`, icon: CalendarDays },
    { label: "Өвчтэй", href: `/hr/sick?${employeeQuery}&type=sick`, icon: HeartPulse },
    ...(mode === "hr" ? [{ label: "Томилолт", href: `/hr/trips?${employeeQuery}`, icon: Plane }] : []),
    ...(mode === "hr" ? [{ label: "Сахилга", href: `/hr/discipline?${employeeQuery}`, icon: ScrollText }] : []),
    ...(mode === "hr" ? [{ label: "Тушаал / гэрээ", href: `/hr/orders?${employeeQuery}`, icon: FilePlus2 }] : []),
  ];
  useEffect(() => {
    return () => {
      if (profilePhotoPreviewUrl) {
        URL.revokeObjectURL(profilePhotoPreviewUrl);
      }
    };
  }, [profilePhotoPreviewUrl]);

  useEffect(() => {
    setFamilyMembers(employee.familyMembers || []);
  }, [employee.familyMembers]);

  useEffect(() => {
    setWorkEditType(employee.workType || "");
  }, [employee.workType]);

  useEffect(() => {
    setEducationRows(educationRowsFromEmployee(employee));
  }, [employee]);

  useEffect(() => {
    setDocumentDraftRows(documentRowsFromEmployee(employee));
  }, [employee]);

  function selectTab(nextTab: string) {
    setTab(nextTab);
    setMessage("");
    if (nextTab !== "Гэр бүл") {
      setAddingFamilyMember(false);
    }
    if (nextTab !== "Яаралтай холбоо") {
      setAddingEmergencyContact(false);
    }
    if (nextTab !== "Шагнал, нэмэгдэл") {
      setAddingReward(false);
    }
    if (nextTab !== "Авьяас, чадвар") {
      setAddingTalentSkill(false);
    }
    if (!editableDetailTabs.has(nextTab)) {
      setEditing(false);
    }
  }

  function beginAddRecord(kind: "family" | "emergency" | "reward" | "talent") {
    setEditing(false);
    setAddingFamilyMember(kind === "family");
    setAddingEmergencyContact(kind === "emergency");
    setAddingReward(kind === "reward");
    setAddingTalentSkill(kind === "talent");
    setMessage("");
    setMessageIsError(false);
  }

  function handleProfilePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setRemoveProfilePhoto(false);
    setPhotoErrorUrl("");
    setPhotoOffsetY(50);
    setProfilePhotoPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  function onPhotoPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!profilePhotoEditUrl) return;
    const rect = event.currentTarget.getBoundingClientRect();
    photoDragRef.current = { startY: event.clientY, startOffset: photoOffsetY, height: rect.height || 1 };
    setIsDraggingPhoto(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }

  function onPhotoPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = photoDragRef.current;
    if (!drag) return;
    const delta = event.clientY - drag.startY;
    // Доош чирэх → зургийн дээд хэсэг харагдана (offset багасна)
    const next = drag.startOffset - (delta / drag.height) * 100;
    setPhotoOffsetY(Math.max(0, Math.min(100, next)));
  }

  function onPhotoPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    photoDragRef.current = null;
    setIsDraggingPhoto(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  }

  function removeSelectedProfilePhoto() {
    if (profilePhotoInputRef.current) {
      profilePhotoInputRef.current.value = "";
    }
    setProfilePhotoPreviewUrl("");
    setRemoveProfilePhoto(true);
    setPhotoErrorUrl("");
  }

  function resetProfilePhotoEditor() {
    if (profilePhotoInputRef.current) {
      profilePhotoInputRef.current.value = "";
    }
    setProfilePhotoPreviewUrl("");
    setRemoveProfilePhoto(false);
    setPhotoOffsetY(50);
  }

  function cancelProfileEdit() {
    resetProfilePhotoEditor();
    setEditing(false);
  }

  async function submitProfileEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (formData.has("workType") && !isTrialWorkType(getFormDataString(formData, "workType"))) {
      formData.set("trialEndDate", "");
    }
    // Профайл зургийг сонгосон байрлалаар нь дөрвөлжин болгон тайрч илгээнэ
    if (!removeProfilePhoto && profilePhotoEditUrl && (profilePhotoPreviewUrl || photoOffsetY !== 50)) {
      try {
        const cropped = await cropImageCover(profilePhotoEditUrl, photoOffsetY);
        formData.set("profilePhoto", cropped, "profile.jpg");
      } catch (error) {
        console.warn("Профайл зураг тайрахад алдаа гарлаа:", error);
      }
    }
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
      resetProfilePhotoEditor();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ажилтны мэдээлэл хадгалахад алдаа гарлаа.");
      setMessageIsError(true);
    } finally {
      setPending(false);
    }
  }

  function normalizedEducationRows(rows = educationRows) {
    return rows
      .map((row, index) => ({
        id: row.id || `education-${index + 1}`,
        level: row.level.trim(),
        field: row.field.trim(),
        school: row.school.trim(),
      }))
      .filter((row) => row.level || row.field || row.school);
  }

  function updateEducationRow(rowId: string, key: keyof Omit<EducationDraftRow, "id">, value: string) {
    setEducationRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
    );
  }

  function addEducationRow() {
    setEducationRows((rows) => [...rows, emptyEducationRow()]);
  }

  function removeEducationRow(rowId: string) {
    setEducationRows((rows) => rows.filter((row) => row.id !== rowId));
  }

  function normalizedDocumentRows(rows = documentDraftRows) {
    return rows
      .map((row, index) => ({
        id: row.id || `document-${index + 1}`,
        name: row.name.trim(),
        type: row.type.trim(),
        status: "Бүртгэлтэй",
        date: row.date.trim(),
        attachmentIds: Array.isArray(row.attachmentIds) ? row.attachmentIds : [],
      }))
      .filter((row) => row.name || row.type || row.date || row.attachmentIds.length);
  }

  function updateDocumentRow(rowId: string, key: keyof Omit<DocumentDraftRow, "id" | "attachmentIds">, value: string) {
    setDocumentDraftRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
    );
  }

  function handleDocumentFileChange(rowId: string, fileName?: string) {
    if (!fileName) return;
    setDocumentDraftRows((rows) =>
      rows.map((row) => (row.id === rowId && !row.name.trim() ? { ...row, name: fileName } : row)),
    );
  }

  function addDocumentRow() {
    setDocumentDraftRows((rows) => [...rows, emptyDocumentRow()]);
  }

  function removeDocumentRow(rowId: string) {
    setDocumentDraftRows((rows) => rows.filter((row) => row.id !== rowId));
  }

  async function submitFamilyMemberAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const draftId = familyMemberDraftIdRef.current;
    familyMemberDraftIdRef.current -= 1;
    const draftFamilyMember = createFamilyMemberDraft(formData, draftId, employee.id);
    setFamilyMemberPending(true);
    setMessage("");
    setMessageIsError(false);
    setFamilyMembers((members) => [...members, draftFamilyMember]);

    try {
      const response = await fetch(`/api/hr/employees/${employee.id}/family-members`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; familyMember?: HrFamilyMember };
      if (!response.ok) {
        throw new Error(payload.error || "Гэр бүлийн гишүүн хадгалахад алдаа гарлаа.");
      }
      const savedFamilyMember = payload.familyMember;
      if (savedFamilyMember) {
        setFamilyMembers((members) => {
          const withoutExistingSaved = members.filter((member) => member.id !== savedFamilyMember.id);
          return withoutExistingSaved.some((member) => member.id === draftId)
            ? withoutExistingSaved.map((member) => (member.id === draftId ? savedFamilyMember : member))
            : [...withoutExistingSaved, savedFamilyMember];
        });
      }
      form.reset();
      setMessage("Гэр бүлийн гишүүн нэмэгдлээ.");
    } catch (error) {
      setFamilyMembers((members) => members.filter((member) => member.id !== draftId));
      setMessage(error instanceof Error ? error.message : "Гэр бүлийн гишүүн хадгалахад алдаа гарлаа.");
      setMessageIsError(true);
    } finally {
      setFamilyMemberPending(false);
    }
  }

  async function submitFamilyMemberUpdate(event: FormEvent<HTMLFormElement>, familyMemberId: number) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const pendingKey = `update-${familyMemberId}`;
    setFamilyMemberActionPending(pendingKey);
    setMessage("");
    setMessageIsError(false);

    try {
      const response = await fetch(`/api/hr/employees/${employee.id}/family-members/${familyMemberId}`, {
        method: "PATCH",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; familyMember?: HrFamilyMember };
      if (!response.ok) {
        throw new Error(payload.error || "Гэр бүлийн гишүүний мэдээлэл хадгалахад алдаа гарлаа.");
      }
      const savedFamilyMember = payload.familyMember;
      if (savedFamilyMember) {
        setFamilyMembers((members) =>
          members.map((member) => (member.id === savedFamilyMember.id ? savedFamilyMember : member)),
        );
      }
      setMessage("Гэр бүлийн гишүүний мэдээлэл хадгалагдлаа.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Гэр бүлийн гишүүний мэдээлэл хадгалахад алдаа гарлаа.");
      setMessageIsError(true);
    } finally {
      setFamilyMemberActionPending("");
    }
  }

  async function deleteFamilyMember(familyMemberId: number) {
    if (!window.confirm("Энэ гэр бүлийн гишүүний бүртгэлийг устгах уу?")) {
      return;
    }
    const pendingKey = `delete-${familyMemberId}`;
    setFamilyMemberActionPending(pendingKey);
    setMessage("");
    setMessageIsError(false);

    try {
      const response = await fetch(`/api/hr/employees/${employee.id}/family-members/${familyMemberId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Гэр бүлийн гишүүний бүртгэл устгахад алдаа гарлаа.");
      }
      setFamilyMembers((members) => members.filter((member) => member.id !== familyMemberId));
      setMessage("Гэр бүлийн гишүүний бүртгэл устгагдлаа.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Гэр бүлийн гишүүний бүртгэл устгахад алдаа гарлаа.");
      setMessageIsError(true);
    } finally {
      setFamilyMemberActionPending("");
    }
  }

  async function submitRecordAdd(
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    successMessage: string,
    closeForm: () => void,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setRecordAddPending(true);
    setMessage("");
    setMessageIsError(false);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Бүртгэл хадгалахад алдаа гарлаа.");
      }
      setMessage(successMessage);
      closeForm();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Бүртгэл хадгалахад алдаа гарлаа.");
      setMessageIsError(true);
    } finally {
      setRecordAddPending(false);
    }
  }

  const generalInfo: DetailPair[] = [
    { label: "Овог", value: employeeNameParts.lastName },
    { label: "Нэр", value: employeeNameParts.firstName },
    { label: "Ажилтны код", value: employee.employeeCode },
    { label: "Регистр / үнэмлэх", value: employee.registerNumber },
    { label: "Хүйс", value: employee.genderLabel },
    { label: "Төрсөн огноо", value: employee.birthDate },
    { label: "Гар утас", value: employee.mobilePhone },
    { label: "Ажлын и-мэйл", value: employee.workEmail },
    { label: "Хэрэглэгч", value: employee.userName },
  ];

  const missingWorkFields = getMissingWorkFields(employee);
  const showTrialEndDate = isTrialWorkType(employee.workType);

  const workInfoCards: WorkInfoCardData[] = [
    {
      title: "1. Одоогийн ажлын байр",
      help: "Одоогоор ажиллаж буй нэгж, албан тушаал, шууд удирдлага.",
      rows: [
        { label: "Хэлтэс / алба", value: employee.departmentName },
        { label: "Албан тушаал", value: employee.jobTitle },
        { label: "Шууд удирдлага", value: employee.managerName },
        { label: "Ажил эрхлэлтийн төлөв", value: employee.statusLabel },
      ],
    },
    {
      title: "2. Ажлын хугацаа",
      help: showTrialEndDate ? "Ажилд орсон болон туршилтын хугацааны мэдээлэл." : "Ажилд орсон огнооны мэдээлэл.",
      rows: [
        { label: "Ажилд орсон огноо", value: employee.startDate },
        ...(showTrialEndDate ? [{ label: "Туршилтын хугацаа дуусах", value: employee.trialEndDate }] : []),
      ],
    },
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
    { label: "Яаралтай холбоо барих хүн", value: employee.emergencyContact },
    { label: "Яаралтай холбоо барих утас", value: employee.emergencyPhone },
  ];

  const salaryInfo: DetailPair[] = [
    { label: "Цалин", value: formatMoney(employee.wage) || employee.baseSalary },
    { label: "Цалингийн ангилал", value: employee.payCategory },
    { label: "Банкны данс", value: employee.bankAccount || [employee.bankName, employee.bankAccountNumber].filter(Boolean).join(" - ") },
    { label: "ТТД дугаар", value: employee.taxNumber },
    { label: "НД төлж эхэлсэн огноо", value: employee.socialInsuranceStartDate },
  ];

  const familyRows = compactRows(
    familyMembers.map((member) => ({
      type: member.relationLabel,
      name: member.relatedEmployeeName,
      birthYear: member.birthYear,
      school: member.school,
      phone: member.phone,
    })),
  );

  const emergencyRows = compactRows([
    ...((employee.emergencyContacts || []).map((contact) => ({
      name: contact.name,
      relation: contact.relation,
      phone: contact.phone,
      address: contact.address,
      note: contact.note,
    }))),
    !(employee.emergencyContacts || []).length && (employee.emergencyContact || employee.emergencyPhone)
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

  const rewardRows = compactRows(
    (employee.rewards || []).map((reward) => ({
      date: reward.date,
      name: reward.name,
      orderNo: reward.orderNo,
      note: reward.note,
    })),
  );

  const skillRows = compactRows([
    ...((employee.talentSkills || []).map((skill) => ({
      name: skill.name,
      type: skill.type,
      level: skill.level,
      note: [skill.acquiredDate, skill.note].filter(Boolean).join(" · "),
    }))),
    !(employee.talentSkills || []).length && employee.educationLevel
      ? {
          name: "Боловсрол",
          type: employee.educationLevel,
          level: employee.studyField || "Бүртгэлтэй",
          note: employee.studySchool || "",
      }
      : null,
    !(employee.talentSkills || []).length && (employee.biography || employee.notes)
      ? {
          name: "Нэмэлт тэмдэглэл",
          type: "Тайлбар",
          level: "",
          note: employee.biography || employee.notes || "",
      }
      : null,
  ]);

  const educationDisplayRows = compactRows(
    educationRows.map((education) => ({
      level: education.level,
      field: education.field,
      school: education.school,
    })),
  );

  const documentRows = documentDraftRows.filter(
    (document) => document.name || document.type || document.date || document.attachmentIds.length,
  );

  const historyRows = compactRows([
    employee.startDate
      ? {
          date: employee.startDate,
          title: "Ажилд орсон",
          note: compactValue(employee.jobTitle, employee.departmentName),
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
            <ProfileValue value={item.value} />
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

  function renderDocumentRecordsTable(rows: DocumentDraftRow[], emptyText: string) {
    if (!rows.length) {
      return <div className={styles.hrProfileEmpty}>{emptyText}</div>;
    }

    return (
      <div className={styles.hrProfileTableWrap}>
        <table className={styles.hrProfileTable}>
          <thead>
            <tr>
              <th>Баримт бичиг</th>
              <th>Төрөл</th>
              <th>Огноо</th>
              <th>Файл</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.id}-${index}`}>
                <td>{row.name || "Бүртгээгүй"}</td>
                <td>{row.type || "Бүртгээгүй"}</td>
                <td>{row.date || "Бүртгээгүй"}</td>
                <td>
                  <AttachmentLinks hasAttachment={Boolean(row.attachmentIds.length)} attachmentIds={row.attachmentIds} />
                </td>
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
          beginAddRecord("family");
        }}
      >
        <Plus aria-hidden />
        <span>Гэр бүлийн гишүүн нэмэх</span>
      </button>
    );
  }

  function renderAddRecordButton(label: string, kind: "emergency" | "reward" | "talent") {
    return (
      <button type="button" className={styles.hrProfileAddLink} onClick={() => beginAddRecord(kind)}>
        <Plus aria-hidden />
        <span>{label}</span>
      </button>
    );
  }

  function renderEmployeeActionBar() {
    return (
      <section className={styles.employeeActionBar} aria-label="Ажилтны үйлдэл">
        <div className={styles.actionPanelHeader}>
          <div>
            <span>Ажилтны үйлдэл</span>
            <p className={styles.actionPanelHelp}>
              Алба, албан тушаал, удирдлагын өөрчлөлт нь зөвхөн ажлын шилжилтийн урсгалаар бүртгэгдэнэ.
            </p>
          </div>
        </div>

        {primaryActions.length ? (
          <div className={styles.primaryActionGroup}>
            {primaryActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className={styles.primaryActionButton}>
                  <Icon aria-hidden />
                  <span>{action.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}

        {recordActions.length ? (
          <div className={styles.recordActionGroup} aria-label="HR хурдан бүртгэл">
            {recordActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className={styles.recordActionChip}>
                  <Icon aria-hidden />
                  <span>{action.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
    );
  }

  function renderTabContent() {
    if (tab === "Ерөнхий мэдээлэл") {
      return (
        <div className={styles.hrProfileContentGrid}>
          {renderPanel("Хувийн мэдээлэл", renderInfoList(generalInfo))}
          {renderPanel("Хувийн дэлгэрэнгүй", renderInfoList(personalInfo))}
        </div>
      );
    }

    if (tab === "Ажлын мэдээлэл") {
      return (
        <WorkInformationPanel
          employee={employee}
          cards={workInfoCards}
          missingFields={missingWorkFields}
          historyRows={historyRows}
          transferHref={`/hr/transfers?${employeeQuery}`}
          canAddTransfer={mode === "hr"}
        />
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
                { key: "birthYear", label: "Төрсөн он" },
                { key: "school", label: "Сургууль" },
                { key: "phone", label: "Утас" },
              ],
              familyRows,
              "Гэр бүлийн мэдээлэл бүртгэгдээгүй.",
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

    if (tab === "Боловсрол") {
      return (
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Боловсролын мэдээлэл",
            renderTable(
              [
                { key: "level", label: "Боловсролын түвшин" },
                { key: "field", label: "Диплом / мэргэжил" },
                { key: "school", label: "Сургууль" },
              ],
              educationDisplayRows,
              "Боловсролын мэдээлэл бүртгэгдээгүй.",
            ),
          )}
          {renderPanel(
            "Боловсролын зураг / файл",
            <AttachmentLinks
              hasAttachment={Boolean(employee.educationAttachmentIds?.length)}
              attachmentIds={employee.educationAttachmentIds}
            />,
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
            canEdit ? renderAddRecordButton("Холбоо барих хүн нэмэх", "emergency") : null,
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
            "Сүүлийн бүртгэл",
            <div className={styles.workHistoryEmpty}>
              <strong>Чөлөө, өвчтэй, томилолтын бүртгэл энд нэгтгэгдэнэ.</strong>
              <span>Шинэ бүртгэл хийх бол дээрх HR хурдан бүртгэл хэсгээс тохирох үйлдлээ сонгоно.</span>
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
                { key: "name", label: "Шагнал" },
                { key: "orderNo", label: "Тушаал" },
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
                { key: "name", label: "Шагнал" },
                { key: "orderNo", label: "Тушаал" },
                { key: "note", label: "Тайлбар" },
              ],
              rewardRows,
              "Шагнал, нэмэгдэл бүртгэгдээгүй.",
            ),
            mode === "hr" ? renderAddRecordButton("Шагнал нэмэх", "reward") : null,
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
            canEdit ? renderAddRecordButton("Авьяас, чадвар нэмэх", "talent") : null,
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
            renderDocumentRecordsTable(documentRows, "Баримт бичиг бүртгэгдээгүй."),
            canEdit ? (
              <button
                type="button"
                className={styles.hrProfileAddLink}
                onClick={() => {
                  setEditing(true);
                  setDocumentDraftRows((rows) => (rows.length ? rows : [emptyDocumentRow()]));
                }}
              >
                <Plus aria-hidden />
                <span>Баримт бичиг нэмэх</span>
              </button>
            ) : null,
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

  function renderProfilePhotoEditor() {
    const inputId = `profile-photo-${employee.id}`;
    return (
      <div className={styles.profilePhotoEditor}>
        <span className={styles.profilePhotoEditorLabel}>Профайл зураг</span>
        <div className={styles.profilePhotoUploadBox}>
          {profilePhotoEditUrl ? (
            <div
              className={`${styles.profilePhotoDropCard} ${styles.profilePhotoDropCardFilled} ${styles.profilePhotoDraggable} ${isDraggingPhoto ? styles.profilePhotoDragging : ""}`}
              onPointerDown={onPhotoPointerDown}
              onPointerMove={onPhotoPointerMove}
              onPointerUp={onPhotoPointerUp}
              onPointerCancel={onPhotoPointerUp}
            >
              <img
                src={profilePhotoEditUrl}
                alt={`${employee.name} профиль зураг`}
                className={styles.profilePhotoImage}
                style={{ objectPosition: `50% ${photoOffsetY}%` }}
                draggable={false}
                onError={() => {
                  if (profilePhotoPreviewUrl) {
                    setProfilePhotoPreviewUrl("");
                  } else {
                    setPhotoErrorUrl(profilePhotoEditUrl);
                  }
                }}
              />
              <span className={styles.profilePhotoDragBadge} aria-hidden>
                ⇅ Чирж байрлуулна
              </span>
              <button
                type="button"
                className={styles.profilePhotoChangeButton}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => profilePhotoInputRef.current?.click()}
              >
                Зураг солих
              </button>
            </div>
          ) : (
            <label htmlFor={inputId} className={styles.profilePhotoDropCard}>
              <span className={styles.profilePhotoEmptyState}>
                <span className={styles.profilePhotoDefaultAvatar}>{initials || "А"}</span>
                <strong>Зураг нэмэх</strong>
              </span>
              <span className={styles.profilePhotoDropOverlay}>Зураг сонгох</span>
            </label>
          )}
          {profilePhotoEditUrl ? (
            <button
              type="button"
              className={styles.profilePhotoRemoveButton}
              onClick={removeSelectedProfilePhoto}
              aria-label="Профайл зураг устгах"
              title="Профайл зураг устгах"
            >
              <X aria-hidden />
            </button>
          ) : null}
          <input
            id={inputId}
            ref={profilePhotoInputRef}
            className={styles.profilePhotoFileInput}
            name="profilePhoto"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleProfilePhotoChange}
          />
          {removeProfilePhoto ? <input type="hidden" name="removeProfilePhoto" value="1" /> : null}
        </div>
        {profilePhotoEditUrl ? (
          <span className={styles.profilePhotoHint}>Зургийг дээш доош чирж байрлуулна</span>
        ) : null}
      </div>
    );
  }

  function renderProfileEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.editInfoBanner}>
          <strong>Ерөнхий мэдээлэл засаж байна</strong>
          <span>
            Энэ хэсэг нь нэр, код, хүйс, төрсөн огноо, утас, имэйл зэрэг ерөнхий мэдээллийг засна. Алба/албан тушаал
            өөрчлөх бол «Ажлын шилжилт бүртгэх»-ийг ашиглана.
          </span>
        </div>
        <div className={styles.hrProfileContentGrid}>
          {renderPanel(
            "Хувийн мэдээлэл",
            <div className={styles.editCardFields}>
              <Field name="lastName" label="Овог" defaultValue={employeeNameParts.lastName} />
              <Field name="firstName" label="Нэр" defaultValue={employeeNameParts.firstName} required />
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
              <Field name="birthDate" label="Төрсөн огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} defaultValue={employee.birthDate} />
              <Field name="mobilePhone" label="Гар утас" defaultValue={employee.mobilePhone} />
              <Field name="workEmail" label="Ажлын и-мэйл" type="email" defaultValue={employee.workEmail} />
              {renderProfilePhotoEditor()}
            </div>,
          )}
          {renderPanel(
            "Хувийн дэлгэрэнгүй",
            <div className={styles.editCardFields}>
              <TextAreaField name="homeAddress" label="Гэрийн хаяг" defaultValue={employee.homeAddress} />
              <Field name="birthPlace" label="Төрсөн газар" defaultValue={employee.placeOfBirth} />
              <Field name="countryOfBirth" label="Төрсөн улс" defaultValue={employee.countryOfBirth} />
              <Field name="nationality" label="Иргэншил" defaultValue={employee.nationality} />
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
              <Field name="spouseName" label="Эхнэр / нөхрийн нэр" defaultValue={employee.spouseName} />
              <Field name="spouseBirthDate" label="Эхнэр / нөхрийн төрсөн огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} defaultValue={employee.spouseBirthDate} />
              <Field name="childrenCount" label="Хүүхдийн тоо" type="number" defaultValue={String(employee.childrenCount ?? 0)} />
              <Field name="emergencyContact" label="Яаралтай холбоо барих хүн" defaultValue={employee.emergencyContact} />
              <Field name="emergencyPhone" label="Яаралтай холбоо барих утас" defaultValue={employee.emergencyPhone} />
            </div>,
          )}
        </div>
        <ProfileEditButtons pending={pending} onCancel={cancelProfileEdit} />
      </form>
    );
  }

  function renderWorkEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.editInfoBanner}>
          <strong>Ажлын мэдээлэл засаж байна</strong>
          <span>
            Ажилд орсон огноо, туршилтын хугацаа болон ажил эрхлэлтийн төрлийг энд шинэчилнэ. Хэлтэс, албан тушаал,
            шууд удирдлага өөрчлөх бол ажлын шилжилтийн бүртгэлээр оруулна.
          </span>
        </div>
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Ажлын хугацаа",
            <div className={styles.editCardFields}>
              <Field name="startDate" label="Ажилд орсон огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} defaultValue={employee.startDate} />
              <label className={styles.field}>
                <span>Ажил эрхлэлтийн төрөл</span>
                <select name="workType" value={workEditType} onChange={(event) => setWorkEditType(event.currentTarget.value)}>
                  <option value="">Сонгох</option>
                  <option value="Үндсэн">Үндсэн</option>
                  <option value="Туршилтаар">Туршилтаар</option>
                  <option value="Гэрээт">Гэрээт</option>
                  <option value="Улирлын">Улирлын</option>
                  <option value="Түр">Түр</option>
                </select>
              </label>
              {isTrialWorkType(workEditType) ? (
                <Field name="trialEndDate" label="Туршилтын хугацаа дуусах" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} defaultValue={employee.trialEndDate} />
              ) : null}
            </div>,
          )}
          {renderPanel(
            "Шилжилтээр өөрчлөх мэдээлэл",
            <div className={styles.editCardFields}>
              {renderInfoList([
                { label: "Хэлтэс / алба", value: employee.departmentName },
                { label: "Албан тушаал", value: employee.jobTitle },
                { label: "Шууд удирдлага", value: employee.managerName },
              ])}
              {mode === "hr" ? (
                <Link href={`/hr/transfers?${employeeQuery}`} className={styles.secondaryButton}>
                  <Repeat2 aria-hidden />
                  <span>Ажлын шилжилт бүртгэх</span>
                </Link>
              ) : null}
            </div>,
          )}
        </div>
        <ProfileEditButtons
          pending={pending}
          onCancel={() => {
            setWorkEditType(employee.workType || "");
            setEditing(false);
          }}
        />
      </form>
    );
  }

  function renderFamilyRelationField(defaultValue = "spouse", disabled = false) {
    return (
      <label className={styles.field}>
        <span>Хамаарал</span>
        <select name="relation" defaultValue={defaultValue} disabled={disabled}>
          <option value="spouse">Эхнэр / нөхөр</option>
          <option value="child">Хүүхэд</option>
          <option value="father">Аав</option>
          <option value="mother">Ээж</option>
          <option value="parent">Эцэг / эх</option>
          <option value="sibling">Ах / эгч / дүү</option>
          <option value="other">Бусад</option>
        </select>
      </label>
    );
  }

  function closeFamilyEdit() {
    setEditing(false);
    setAddingFamilyMember(false);
  }

  function renderFamilyMemberAddCard() {
    return (
      <form className={styles.familyMemberEditCard} onSubmit={submitFamilyMemberAdd} noValidate>
        <div className={styles.editInfoBanner}>
          <strong>Гэр бүлийн гишүүн нэмэх</strong>
          <span>Хамаарал, нэрийг бүртгэнэ. Төрсөн он, сургууль, утас нь заавал биш.</span>
        </div>
        <div className={styles.editCardFields}>
          {renderFamilyRelationField("spouse", familyMemberPending)}
          <Field name="name" label="Нэр" required />
          <Field name="birthYear" label="Төрсөн он" type="number" />
          <Field name="school" label="Сургууль" />
          <Field name="phone" label="Утас" />
        </div>
        <ProfileEditButtons
          pending={familyMemberPending}
          onCancel={closeFamilyEdit}
          submitLabel="Нэмэх"
          pendingLabel="Нэмж байна..."
        />
      </form>
    );
  }

  function renderFamilyMemberEditList() {
    const members = familyMembers;
    if (!members.length) {
      return <div className={styles.hrProfileEmpty}>Одоогоор гэр бүлийн гишүүн нэмэгдээгүй.</div>;
    }

    return (
      <div className={styles.familyMemberEditList}>
        {members.map((member) => {
          const isTemporary = member.id < 0;
          const updatePending = familyMemberActionPending === `update-${member.id}`;
          const deletePending = familyMemberActionPending === `delete-${member.id}`;
          const anyPending = Boolean(familyMemberActionPending) || familyMemberPending;
          return (
            <form
              key={member.id}
              className={styles.familyMemberEditRow}
              onSubmit={(event) => submitFamilyMemberUpdate(event, member.id)}
              noValidate
            >
              {renderFamilyRelationField(member.relation, updatePending || deletePending || isTemporary)}
              <Field name="name" label="Нэр" defaultValue={member.relatedEmployeeName} required />
              <Field name="birthYear" label="Төрсөн он" type="number" defaultValue={member.birthYear} />
              <Field name="school" label="Сургууль" defaultValue={member.school} />
              <Field name="phone" label="Утас" defaultValue={member.phone} />
              <div className={styles.familyMemberRowActions}>
                <button
                  className={styles.secondaryButton}
                  disabled={isTemporary || updatePending || deletePending || (anyPending && !updatePending)}
                >
                  <Pencil aria-hidden />
                  <span>{isTemporary ? "Нэмж байна..." : updatePending ? "Хадгалж байна..." : "Хадгалах"}</span>
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => deleteFamilyMember(member.id)}
                  disabled={isTemporary || deletePending || updatePending || (anyPending && !deletePending)}
                >
                  <Trash2 aria-hidden />
                  <span>{deletePending ? "Устгаж байна..." : "Устгах"}</span>
                </button>
              </div>
            </form>
          );
        })}
      </div>
    );
  }

  function renderFamilyEditForm() {
    return (
      <div className={styles.profileEditForm}>
        <div className={styles.editInfoBanner}>
          <strong>Гэр бүл засах</strong>
          <span>Гэр бүлийн ерөнхий мэдээлэл болон бүртгэлтэй гишүүдийг засна.</span>
        </div>
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "1. Ерөнхий мэдээлэл",
            <form className={styles.familyMemberEditCard} onSubmit={submitProfileEdit} noValidate>
              <div className={styles.editCardFields}>
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
              <ProfileEditButtons pending={pending} onCancel={closeFamilyEdit} />
            </form>,
          )}
          {renderPanel("2. Шинэ гишүүн", renderFamilyMemberAddCard())}
        </div>
        {renderPanel("3. Бүртгэлтэй гишүүд", renderFamilyMemberEditList())}
      </div>
    );
  }

  function renderEmergencyContactAddForm() {
    return (
      <form
        className={styles.profileEditForm}
        onSubmit={(event) =>
          submitRecordAdd(
            event,
            `/api/hr/employees/${employee.id}/emergency-contacts`,
            "Яаралтай холбоо барих хүн нэмэгдлээ.",
            () => setAddingEmergencyContact(false),
          )
        }
        noValidate
      >
        <div className={styles.editInfoBanner}>
          <strong>Яаралтай холбоо барих хүн нэмэх</strong>
          <span>Ажилтантай яаралтай үед холбогдох хүний нэр, хамаарал, утас болон хаягийг бүртгэнэ.</span>
        </div>
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "1. Холбоо барих хүн",
            <div className={styles.editCardFields}>
              <Field name="name" label="Нэр" required />
              <Field name="relation" label="Хамаарал" />
              <Field name="phone" label="Утас" required />
              <Field name="address" label="Хаяг" />
              <TextAreaField name="note" label="Тайлбар" rows={4} />
            </div>,
          )}
          {renderPanel(
            "2. Одоогийн холбоо",
            renderTable(
              [
                { key: "name", label: "Нэр" },
                { key: "relation", label: "Хамаарал" },
                { key: "phone", label: "Утас" },
                { key: "note", label: "Тэмдэглэл" },
              ],
              emergencyRows,
              "Одоогоор яаралтай холбоо бүртгэгдээгүй.",
            ),
          )}
        </div>
        <ProfileEditButtons pending={recordAddPending} onCancel={() => setAddingEmergencyContact(false)} />
      </form>
    );
  }

  function renderRewardAddForm() {
    return (
      <form
        className={styles.profileEditForm}
        onSubmit={(event) =>
          submitRecordAdd(
            event,
            `/api/hr/employees/${employee.id}/rewards`,
            "Шагналын мэдээлэл нэмэгдлээ.",
            () => setAddingReward(false),
          )
        }
        noValidate
      >
        <div className={styles.editInfoBanner}>
          <strong>Шагнал нэмэх</strong>
          <span>Шагналын нэр, огноо, тушаалын дугаар болон тайлбарыг нэг мөрөөр хадгална.</span>
        </div>
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "1. Шагналын мэдээлэл",
            <div className={styles.editCardFields}>
              <Field name="name" label="Шагналын нэр" required />
              <Field name="date" label="Огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} />
              <Field name="orderNo" label="Тушаалын дугаар" />
              <TextAreaField name="note" label="Тайлбар" rows={4} />
            </div>,
          )}
          {renderPanel(
            "2. Одоогийн шагнал",
            renderTable(
              [
                { key: "date", label: "Огноо" },
                { key: "name", label: "Шагнал" },
                { key: "orderNo", label: "Тушаал" },
                { key: "note", label: "Тайлбар" },
              ],
              rewardRows,
              "Одоогоор шагнал бүртгэгдээгүй.",
            ),
          )}
        </div>
        <ProfileEditButtons pending={recordAddPending} onCancel={() => setAddingReward(false)} />
      </form>
    );
  }

  function renderTalentSkillAddForm() {
    return (
      <form
        className={styles.profileEditForm}
        onSubmit={(event) =>
          submitRecordAdd(
            event,
            `/api/hr/employees/${employee.id}/talent-skills`,
            "Авьяас, чадвар нэмэгдлээ.",
            () => setAddingTalentSkill(false),
          )
        }
        noValidate
      >
        <div className={styles.editInfoBanner}>
          <strong>Авьяас, чадвар нэмэх</strong>
          <span>Авьяас, ур чадвар, спорт/урлагийн төрөл, түвшин болон тодорхойлолтыг нэг мөрөөр хадгална.</span>
        </div>
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "1. Авьяас, чадвар",
            <div className={styles.editCardFields}>
              <Field name="name" label="Авьяас, чадвар" required />
              <Field name="type" label="Төрөл" />
              <Field name="level" label="Түвшин" />
              <Field name="acquiredDate" label="Бүртгэсэн огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} />
              <TextAreaField name="note" label="Тодорхойлолт" rows={4} />
            </div>,
          )}
          {renderPanel(
            "2. Одоогийн чадвар",
            renderTable(
              [
                { key: "name", label: "Авьяас, чадвар" },
                { key: "type", label: "Төрөл" },
                { key: "level", label: "Түвшин" },
                { key: "note", label: "Тодорхойлолт" },
              ],
              skillRows,
              "Одоогоор авьяас, чадвар бүртгэгдээгүй.",
            ),
          )}
        </div>
        <ProfileEditButtons pending={recordAddPending} onCancel={() => setAddingTalentSkill(false)} />
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

  function renderSalaryEditForm() {
    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Цалин, хөлс",
            <div className={styles.editCardFields}>
              <Field
                name="baseSalary"
                label="Үндсэн цалин"
                type="number"
                defaultValue={employee.wage ? String(employee.wage) : employee.baseSalary}
              />
              <Field name="payCategory" label="Цалингийн ангилал" defaultValue={employee.payCategory} />
              <Field name="taxNumber" label="ТТД дугаар" defaultValue={employee.taxNumber} />
              <Field
                name="socialInsuranceStartDate"
                label="НД төлж эхэлсэн огноо"
                type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10}
                defaultValue={employee.socialInsuranceStartDate}
              />
            </div>,
          )}
          {renderPanel(
            "Банкны мэдээлэл",
            <div className={styles.editCardFields}>
              <Field name="bankName" label="Банк" defaultValue={employee.bankName} />
              <Field name="bankAccountNumber" label="Дансны дугаар" defaultValue={employee.bankAccountNumber || employee.bankAccount} />
            </div>,
          )}
        </div>
        <ProfileEditButtons
          pending={pending}
          onCancel={() => {
            setEducationRows(educationRowsFromEmployee(employee));
            setEditing(false);
          }}
        />
      </form>
    );
  }

  function renderEducationEditForm() {
    const savedEducationRows = normalizedEducationRows();
    const primaryEducation = savedEducationRows[0];

    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <input type="hidden" name="educationRecords" value={JSON.stringify(savedEducationRows)} />
        <input type="hidden" name="educationLevel" value={primaryEducation?.level || ""} />
        <input type="hidden" name="studyField" value={primaryEducation?.field || ""} />
        <input type="hidden" name="studySchool" value={primaryEducation?.school || ""} />
        <div className={styles.hrProfileTwoColumn}>
          {renderPanel(
            "Боловсролын мэдээлэл",
            <div className={styles.familyMemberEditList}>
              {educationRows.length ? (
                educationRows.map((education, index) => (
                  <div key={education.id} className={styles.familyMemberEditRow}>
                    <label className={styles.field}>
                      <span>Боловсролын түвшин</span>
                      <select value={education.level} onChange={(event) => updateEducationRow(education.id, "level", event.currentTarget.value)}>
                        <option value="">Сонгох</option>
                        {educationLevelOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Диплом / мэргэжил</span>
                      <input
                        value={education.field}
                        onChange={(event) => updateEducationRow(education.id, "field", event.currentTarget.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Сургууль</span>
                      <input
                        value={education.school}
                        onChange={(event) => updateEducationRow(education.id, "school", event.currentTarget.value)}
                      />
                    </label>
                    <div className={styles.familyMemberRowActions}>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => removeEducationRow(education.id)}
                        disabled={pending}
                        aria-label={`${index + 1}-р боловсролын мөр устгах`}
                      >
                        <Trash2 aria-hidden />
                        <span>Устгах</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.hrProfileEmpty}>Боловсролын мөр нэмээгүй байна.</div>
              )}
              <button type="button" className={styles.secondaryButton} onClick={addEducationRow} disabled={pending}>
                <Plus aria-hidden />
                <span>Мөр нэмэх</span>
              </button>
            </div>,
          )}
          {renderPanel(
            "Боловсролын зураг / файл",
            <div className={styles.editCardFields}>
              <AttachmentLinks
                hasAttachment={Boolean(employee.educationAttachmentIds?.length)}
                attachmentIds={employee.educationAttachmentIds}
              />
              <label className={styles.field}>
                <span>Шинэ зураг / файл хавсаргах</span>
                <input name="educationDocument" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
                <small>JPG, PNG, WebP зураг эсвэл PDF файл 10MB хүртэл.</small>
              </label>
            </div>,
          )}
        </div>
        <ProfileEditButtons pending={pending} onCancel={() => setEditing(false)} />
      </form>
    );
  }

  function renderDocumentEditForm() {
    const savedDocumentRows = normalizedDocumentRows();

    return (
      <form className={styles.profileEditForm} onSubmit={submitProfileEdit} noValidate>
        <input type="hidden" name="documentRecords" value={JSON.stringify(savedDocumentRows)} />
        <input type="hidden" name="missingDocumentCount" value="0" />
        <div className={styles.hrProfileFullWidth}>
          {renderPanel(
            "Баримт бичгийн мэдээлэл",
            <div className={styles.familyMemberEditList}>
              {documentDraftRows.length ? (
                documentDraftRows.map((document, index) => (
                  <div key={document.id} className={styles.familyMemberEditRow}>
                    <label className={styles.field}>
                      <span>Баримт бичиг</span>
                      <input
                        value={document.name}
                        onChange={(event) => updateDocumentRow(document.id, "name", event.currentTarget.value)}
                        placeholder="Жишээ: Иргэний үнэмлэх"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Төрөл</span>
                      <select value={document.type} onChange={(event) => updateDocumentRow(document.id, "type", event.currentTarget.value)}>
                        <option value="">Сонгох</option>
                        {documentTypeOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Огноо</span>
                      <input
                        value={document.date}
                        onChange={(event) => updateDocumentRow(document.id, "date", event.currentTarget.value)}
                        placeholder="Ж: 2026, 2026-06, 2026-06-12"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Файл / зураг</span>
                      <input
                        name={`documentFile-${document.id}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => handleDocumentFileChange(document.id, event.currentTarget.files?.[0]?.name)}
                      />
                      {document.attachmentIds.length ? (
                        <div className={styles.fieldHint}>
                          <span>Одоогийн файл:</span>
                          <AttachmentLinks hasAttachment attachmentIds={document.attachmentIds} />
                        </div>
                      ) : null}
                    </label>
                    <div className={styles.familyMemberRowActions}>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => removeDocumentRow(document.id)}
                        disabled={pending}
                        aria-label={`${index + 1}-р баримт бичгийн мөр устгах`}
                      >
                        <Trash2 aria-hidden />
                        <span>Устгах</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.hrProfileEmpty}>Баримт бичгийн мөр нэмээгүй байна.</div>
              )}
              <button type="button" className={styles.secondaryButton} onClick={addDocumentRow} disabled={pending}>
                <Plus aria-hidden />
                <span>Мөр нэмэх</span>
              </button>
            </div>,
          )}
        </div>
        <ProfileEditButtons
          pending={pending}
          onCancel={() => {
            setDocumentDraftRows(documentRowsFromEmployee(employee));
            setEditing(false);
          }}
        />
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
      case "Боловсрол":
        return renderEducationEditForm();
      case "Яаралтай холбоо":
        return renderEmergencyEditForm();
      case "Цалин":
        return renderSalaryEditForm();
      case "Баримт бичиг":
        return renderDocumentEditForm();
      default:
        return renderTabContent();
    }
  }

  const addingAnyRecord = addingFamilyMember || addingEmergencyContact || addingReward || addingTalentSkill;

  return (
    <section id="profile-info" className={styles.hrProfileShell}>
      <div className={styles.hrProfileBreadcrumb}>
        <Link
          href="/hr/employees"
          onClick={(event) => {
            // Хандсан хэсэг (шүүлттэй жагсаалт) рүү нь буцаана
            if (typeof window !== "undefined" && window.history.length > 1) {
              event.preventDefault();
              router.back();
            }
          }}
        >
          Ажилтнууд
        </Link>
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
              <h2>{formatEmployeeDisplayName(employee.name)}</h2>
              <span className={styles.hrProfileStatusPill}>{employee.statusLabel || "Идэвхтэй"}</span>
            </div>
            <p className={!hasUsefulValue(employee.jobTitle) ? styles.hrProfileEmptyValue : undefined}>
              {hasUsefulValue(employee.jobTitle) ? employee.jobTitle : "Албан тушаал бүртгээгүй"}
            </p>
            <ul>
              <li><Phone aria-hidden /><ProfileValue value={employee.mobilePhone} fallback="Гар утас бүртгээгүй" /></li>
              <li><Mail aria-hidden /><ProfileValue value={employee.workEmail} fallback="И-мэйл бүртгээгүй" /></li>
              <li><Building2 aria-hidden /><ProfileValue value={employee.departmentName} fallback="Хэлтэс бүртгээгүй" /></li>
              <li><Users aria-hidden /><span>Шууд удирдлага:</span> <ProfileValue value={employee.managerName} /></li>
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
                <ProfileValue value={item.value} />
              </div>
            );
          })}
        </div>

        <div className={styles.hrProfileHeroFacts}>
          {rightSummary.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <ProfileValue value={item.value} />
            </div>
          ))}
        </div>
      </div>

      {renderEmployeeActionBar()}

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
            {canEditCurrentTab && !editing && !addingAnyRecord ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setEditing((value) => !value)}
              >
                <Pencil aria-hidden />
                <span>{tab === "Ерөнхий мэдээлэл" ? "Ерөнхий мэдээлэл засах" : `${tab} засах`}</span>
              </button>
            ) : null}
          </div>
        </div>

        {message ? <p className={messageIsError ? styles.errorText : styles.successText}>{message}</p> : null}

        {canEdit && addingFamilyMember
          ? renderFamilyEditForm()
          : canEdit && addingEmergencyContact
            ? renderEmergencyContactAddForm()
            : canEdit && addingReward
              ? renderRewardAddForm()
              : canEdit && addingTalentSkill
                ? renderTalentSkillAddForm()
                : canEdit && editing
                  ? renderTabEditForm()
                  : renderTabContent()}
      </div>
    </section>
  );
}

function ProfileEditButtons({
  pending,
  onCancel,
  disabled = false,
  submitLabel = "Хадгалах",
  pendingLabel = "Хадгалж байна...",
}: {
  pending: boolean;
  onCancel: () => void;
  disabled?: boolean;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  return (
    <div className={styles.profileEditActions}>
      <button className={styles.primaryButton} disabled={pending || disabled}>
        {pending ? pendingLabel : submitLabel}
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
      <ProfileValue value={value} />
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
  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState(defaultFilter);
  const [editingRequest, setEditingRequest] = useState<HrTimeoffRequest | null>(null);
  const [selectedRequestType, setSelectedRequestType] = useState<HrTimeoffRequestType>(defaultType);
  const [annualLeaveDateFrom, setAnnualLeaveDateFrom] = useState("");
  const [annualLeaveDateTo, setAnnualLeaveDateTo] = useState("");
  const annualLeaveOnlyMode = mode === "hr" && defaultType === "annual_leave";

  useEffect(() => {
    if (selectedRequestType !== "annual_leave") return;
    setAnnualLeaveDateFrom(editingRequest?.dateFrom || "");
    setAnnualLeaveDateTo(editingRequest?.dateTo || "");
  }, [editingRequest, selectedRequestType]);

  const visibleRequests = useMemo(() => {
    // Ноорог (илгээгээгүй) хүсэлтийг жагсаалтад харуулахгүй
    const base = requests.filter((request) => request.state !== "draft");
    if (filter === ALL) return base;
    if (filter === "pending") {
      return base.filter((request) => request.state === "submitted" || request.state === "hr_review");
    }
    return base.filter((request) => request.state === filter || request.requestType === filter);
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
    <div className={`${mode === "hr" ? styles.singleColumn : styles.twoColumn} ${annualLeaveOnlyMode ? styles.formFirstColumn : ""}`}>
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

        <div className={styles.registryCardGrid}>
          {visibleRequests.map((request) => (
            <div key={request.id} className={styles.registryCard}>
              <Link href={`/hr/employees/${request.employeeId}`} className={styles.registryCardHead}>
                <span className={styles.employeeGridAvatar}>
                  {employeeById.get(request.employeeId)?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={employeeById.get(request.employeeId)?.photoUrl}
                      alt=""
                      className={styles.employeeGridAvatarImg}
                    />
                  ) : (
                    employeeInitials(request.employeeName)
                  )}
                </span>
                <strong className={styles.employeeGridName}>
                  {formatEmployeeDisplayName(request.employeeName)}
                </strong>
                {employeeById.get(request.employeeId)?.jobTitle ? (
                  <span className={styles.employeeGridTitle}>
                    {employeeById.get(request.employeeId)?.jobTitle}
                  </span>
                ) : null}
                {request.departmentName ? (
                  <span className={styles.employeeGridDept}>{request.departmentName}</span>
                ) : null}
                <span className={styles.statusPill}>{request.stateLabel}</span>
              </Link>
              <dl className={styles.registryCardMeta}>
                <div>
                  <dt>Төрөл</dt>
                  <dd>{request.requestTypeLabel}</dd>
                </div>
                <div>
                  <dt>Хугацаа</dt>
                  <dd>
                    {request.dateFrom} - {request.dateTo}
                  </dd>
                </div>
                <div>
                  <dt>Илгээсэн</dt>
                  <dd>{request.submittedBy || "Бүртгээгүй"}</dd>
                </div>
                <div>
                  <dt>Хавсралт</dt>
                  <dd>
                    <AttachmentLinks hasAttachment={request.hasAttachment} attachmentIds={request.attachmentIds} />
                  </dd>
                </div>
              </dl>
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
            </div>
          ))}
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
        {selectedRequestType === "annual_leave" ? (
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Эхлэх огноо</span>
              <input
                name="dateFrom"
                type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10}
                required
                value={annualLeaveDateFrom}
                onChange={(event) => setAnnualLeaveDateFrom(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Дуусах огноо</span>
              <input
                name="dateTo"
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
                maxLength={10}
                required
                value={annualLeaveDateTo}
                onChange={(event) => setAnnualLeaveDateTo(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className={styles.formGridTwo}>
            <Field name="dateFrom" label="Эхлэх огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} required defaultValue={editingRequest?.dateFrom} />
            <Field name="dateTo" label="Дуусах огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} required defaultValue={editingRequest?.dateTo} />
          </div>
        )}
        <Field name="orderNumber" label="Тушаалын дугаар" defaultValue={editingRequest?.orderNumber || ""} />
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
                  <td>{formatEmployeeDisplayName(leave.employeeName)}</td>
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
            <strong>{formatEmployeeDisplayName(selectedEmployee.name)}</strong>
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
          <Field name="dateFrom" label="Эхлэх огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} required />
          <Field name="dateTo" label="Дуусах огноо" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} required />
        </div>
        <Field name="orderNumber" label="Тушаалын дугаар" />
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
      const employeeName = formatEmployeeDisplayName(String(editingRecord?.employeeName || selectedEmployee?.name || "Ажилтан бүртгээгүй"));
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

  function isSelectedEmployeeContextField(field: ReturnType<typeof normalizeField>) {
    if (!selectedContext) {
      return false;
    }
    const fieldName = field.name || field.label;
    return (
      fieldName === "employeeId" ||
      fieldName === "departmentId" ||
      fieldName === "jobTitle" ||
      field.label === "Ажилтан" ||
      field.label === "Хэлтэс" ||
      field.label === "Албан тушаал"
    );
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

  function getChangeEmployeeHref() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("employeeId");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function renderSelectedEmployeeContextContent() {
    return (
      <>
        <div className={styles.selectedEmployeeContextHeader}>
          <span>Сонгосон ажилтан</span>
          {!editingRecord ? <span className={styles.selectedEmployeeContextAction}>Ажилтан солих</span> : null}
        </div>
        <strong>{formatEmployeeDisplayName(String(editingRecord?.employeeName || selectedEmployee?.name || "Ажилтан бүртгээгүй"))}</strong>
        <small>
          {String(editingRecord?.departmentName || selectedEmployee?.departmentName || "Хэлтэс бүртгээгүй")} ·{" "}
          {String(editingRecord?.jobTitle || selectedEmployee?.jobTitle || "Албан тушаал бүртгээгүй")}
        </small>
      </>
    );
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
        {records.length && columns.length && columns.some((column) => column.photoKey) ? (
          <div className={styles.registryCardGrid}>
            {records.map((record) => (
              <RegistryEmployeeCard key={String(record.id)} record={record} columns={columns} />
            ))}
          </div>
        ) : records.length && columns.length ? (
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
                      const photo = column.photoKey ? record[column.photoKey] : "";
                      const sub = column.subKey ? record[column.subKey] : "";
                      return (
                        <td key={column.key}>
                          {column.photoKey ? (
                            <EmployeeIdentity
                              name={String(value || "Бүртгээгүй")}
                              jobTitle={sub ? String(sub) : undefined}
                              photoUrl={photo ? String(photo) : undefined}
                              href={href ? String(href) : undefined}
                            />
                          ) : href ? (
                            <Link href={String(href)}>{String(value || "Бүртгээгүй")}</Link>
                          ) : (
                            String(value || "Бүртгээгүй")
                          )}
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
          <>
            {editingRecord?.employeeId || selectedEmployee?.id ? (
              <input name="employeeId" type="hidden" value={String(editingRecord?.employeeId || selectedEmployee?.id)} />
            ) : null}
            {!editingRecord ? (
              <Link className={`${styles.selectedEmployeeContext} ${styles.selectedEmployeeContextLink}`} href={getChangeEmployeeHref()}>
                {renderSelectedEmployeeContextContent()}
              </Link>
            ) : (
              <div className={styles.selectedEmployeeContext}>{renderSelectedEmployeeContextContent()}</div>
            )}
          </>
        ) : null}
        <div className={styles.formGrid}>
          {gridFields.map((fieldConfig) => {
            if (isSelectedEmployeeContextField(fieldConfig)) {
              return null;
            }

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
