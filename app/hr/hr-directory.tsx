"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  BriefcaseBusiness,
  Building2,
  FileWarning,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import Image from "next/image";

import { updateHrEmployeeRegistrationAction } from "@/app/hr/actions";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import styles from "./page.module.css";

type DepartmentEmployeeGroup = {
  departmentName: string;
  employees: HrEmployeeDirectoryItem[];
};

type Props = {
  departments: DepartmentEmployeeGroup[];
  initialEmployeeId?: number | null;
};

const ALL_DEPARTMENTS_KEY = "__all_departments__";
const ALL_STATUS_KEY = "__all_statuses__";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={styles.primaryAction} disabled={pending}>
      {pending ? "Хадгалж байна..." : "Бүртгэл хадгалах"}
    </button>
  );
}

function getInitials(name: string) {
  const letters = name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return letters ? letters.toLocaleUpperCase("mn-MN") : "ХН";
}

function formatDate(value: string) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function EmployeePhoto({
  employee,
  size,
}: {
  employee: HrEmployeeDirectoryItem;
  size: "card" | "modal";
}) {
  const className = size === "modal" ? styles.employeePhotoLarge : styles.employeePhoto;

  if (employee.photoUrl) {
    return (
      <Image
        src={employee.photoUrl}
        alt={`${employee.name} зураг`}
        width={size === "modal" ? 88 : 72}
        height={size === "modal" ? 88 : 72}
        className={className}
        unoptimized
      />
    );
  }

  return <span className={className}>{getInitials(employee.name)}</span>;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className={styles.detailItem}>
      <span>{label}</span>
      <strong>{value || "Бүртгээгүй"}</strong>
    </div>
  );
}

function matchesEmployee(employee: HrEmployeeDirectoryItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    employee.name,
    employee.employeeCode,
    employee.departmentName,
    employee.jobTitle,
    employee.workPhone,
    employee.mobilePhone,
    employee.workEmail,
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalized));
}

export function HrDirectory({ departments, initialEmployeeId }: Props) {
  const employees = useMemo(
    () => departments.flatMap((department) => department.employees),
    [departments],
  );
  const initialEmployee =
    employees.find((employee) => employee.id === initialEmployeeId) ?? null;
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    initialEmployeeId ?? null,
  );
  const [selectedDepartmentName, setSelectedDepartmentName] = useState(
    initialEmployee?.departmentName ?? ALL_DEPARTMENTS_KEY,
  );
  const [selectedStatus, setSelectedStatus] = useState(ALL_STATUS_KEY);
  const [query, setQuery] = useState("");

  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const activeDepartmentName =
    selectedDepartmentName === ALL_DEPARTMENTS_KEY ||
    departments.some((department) => department.departmentName === selectedDepartmentName)
      ? selectedDepartmentName
      : ALL_DEPARTMENTS_KEY;
  const statusOptions = useMemo(() => {
    const statuses = Array.from(
      new Map(employees.map((employee) => [employee.statusKey, employee.statusLabel])),
    );
    return [[ALL_STATUS_KEY, "Бүх төлөв"], ...statuses] as Array<[string, string]>;
  }, [employees]);
  const visibleDepartments = useMemo(
    () =>
      (activeDepartmentName === ALL_DEPARTMENTS_KEY
        ? departments
        : departments.filter(
            (department) => department.departmentName === activeDepartmentName,
          )
      )
        .map((department) => ({
          departmentName: department.departmentName,
          employees: department.employees.filter(
            (employee) =>
              matchesEmployee(employee, query) &&
              (selectedStatus === ALL_STATUS_KEY || employee.statusKey === selectedStatus),
          ),
        }))
        .filter((department) => department.employees.length > 0),
    [activeDepartmentName, departments, query, selectedStatus],
  );
  const visibleEmployeeCount = visibleDepartments.reduce(
    (total, department) => total + department.employees.length,
    0,
  );
  const selectedDepartmentLabel =
    activeDepartmentName === ALL_DEPARTMENTS_KEY
      ? "Бүх алба, хэлтэс"
      : activeDepartmentName;

  useEffect(() => {
    if (!selectedEmployee) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEmployeeId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEmployee]);

  if (!departments.length) {
    return <div className={styles.emptyState}>Одоогоор харагдах ажилтны бүртгэл алга.</div>;
  }

  return (
    <>
      <section className={styles.directoryToolbar}>
        <div className={styles.directorySearch}>
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Нэр, код, албан тушаал, утас, и-мэйлээр хайх"
            aria-label="Ажилтан хайх"
          />
        </div>

        <div className={styles.statusSegment} aria-label="Төлөвөөр шүүх">
          {statusOptions.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={selectedStatus === key ? styles.statusSegmentActive : ""}
              onClick={() => setSelectedStatus(key)}
              aria-pressed={selectedStatus === key}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.departmentExplorer}>
        <div className={styles.departmentExplorerHeader}>
          <div>
            <span className={styles.eyebrow}>Алба, нэгж хэлтсээр харах</span>
            <h3>{selectedDepartmentLabel}</h3>
          </div>
          <strong className={styles.departmentExplorerCount}>{visibleEmployeeCount}</strong>
        </div>

        <div className={styles.departmentFilterGrid} aria-label="Алба, нэгж хэлтэс сонгох">
          <button
            type="button"
            className={`${styles.departmentFilterButton} ${
              selectedDepartmentName === ALL_DEPARTMENTS_KEY
                ? styles.departmentFilterButtonActive
                : ""
            }`}
            aria-pressed={activeDepartmentName === ALL_DEPARTMENTS_KEY}
            onClick={() => setSelectedDepartmentName(ALL_DEPARTMENTS_KEY)}
          >
            <strong>Бүгд</strong>
            <span>{employees.length}</span>
          </button>

          {departments.map(({ departmentName, employees: departmentEmployees }) => (
            <button
              key={departmentName}
              type="button"
              className={`${styles.departmentFilterButton} ${
                activeDepartmentName === departmentName
                  ? styles.departmentFilterButtonActive
                  : ""
              }`}
              aria-pressed={activeDepartmentName === departmentName}
              onClick={() => setSelectedDepartmentName(departmentName)}
            >
              <strong>{departmentName}</strong>
              <span>{departmentEmployees.length}</span>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.departmentList}>
        {visibleDepartments.map(({ departmentName, employees: departmentEmployees }) => (
          <section key={departmentName} className={styles.departmentCard}>
            <div className={styles.departmentHeader}>
              <div>
                <h3>{departmentName}</h3>
                <p>{departmentEmployees.length} ажилтны бүртгэл харагдаж байна.</p>
              </div>
              <span className={styles.departmentBadge}>{departmentEmployees.length}</span>
            </div>

            <div className={styles.employeeGrid}>
              {departmentEmployees.map((employee) => (
                <article
                  key={employee.id}
                  role="button"
                  tabIndex={0}
                  className={styles.employeeCard}
                  onClick={() => setSelectedEmployeeId(employee.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedEmployeeId(employee.id);
                    }
                  }}
                >
                  <div className={styles.employeeCardHeader}>
                    <EmployeePhoto employee={employee} size="card" />
                    <div className={styles.employeeIdentity}>
                      <span className={styles.employeeCode}>{employee.employeeCode}</span>
                      <h4>{employee.name}</h4>
                      <p>{employee.jobTitle}</p>
                    </div>
                    <span className={`${styles.statusBadge} ${styles[`status_${employee.statusKey}`] ?? ""}`}>
                      {employee.statusLabel}
                    </span>
                  </div>

                  <div className={styles.cardMetaGrid}>
                    <span>
                      <Building2 size={14} aria-hidden="true" />
                      {employee.departmentName}
                    </span>
                    <span>
                      <BriefcaseBusiness size={14} aria-hidden="true" />
                      {employee.gradeRank || "Зэрэг бүртгээгүй"}
                    </span>
                    <span>
                      <Phone size={14} aria-hidden="true" />
                      {employee.workPhone || employee.mobilePhone || "Утас бүртгээгүй"}
                    </span>
                    <span>
                      <Mail size={14} aria-hidden="true" />
                      {employee.workEmail || "И-мэйл бүртгээгүй"}
                    </span>
                  </div>

                  <div className={styles.cardSignals}>
                    <span className={employee.missingDocumentCount ? styles.signalWarn : styles.signalOk}>
                      {employee.missingDocumentCount ? (
                        <FileWarning size={14} aria-hidden="true" />
                      ) : (
                        <ShieldCheck size={14} aria-hidden="true" />
                      )}
                      {employee.missingDocumentCount
                        ? `${employee.missingDocumentCount} дутуу баримт`
                        : "Баримт бүрэн"}
                    </span>
                    <span>
                      <TrendingUp size={14} aria-hidden="true" />
                      KPI {Math.round(employee.kpiScore)}%
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {!visibleDepartments.length ? (
        <div className={styles.emptyState}>Сонгосон нөхцөлд тохирох ажилтан алга.</div>
      ) : null}

      {selectedEmployee ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedEmployeeId(null);
            }
          }}
        >
          <section
            className={styles.employeeModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-detail-title"
          >
            <div className={styles.modalHeader}>
              <EmployeePhoto employee={selectedEmployee} size="modal" />
              <div>
                <span className={styles.eyebrow}>Ажилтны дэлгэрэнгүй</span>
                <h2 id="employee-detail-title">{selectedEmployee.name}</h2>
                <p>{selectedEmployee.jobTitle}</p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setSelectedEmployeeId(null)}
                aria-label="Дэлгэрэнгүй цонх хаах"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.detailGrid}>
              <DetailItem label="Ажилтны код" value={selectedEmployee.employeeCode} />
              <DetailItem label="Хэлтэс" value={selectedEmployee.departmentName} />
              <DetailItem label="Албан тушаал" value={selectedEmployee.jobTitle} />
              <DetailItem label="Удирдлага" value={selectedEmployee.managerName} />
              <DetailItem label="Ажилд орсон" value={formatDate(selectedEmployee.startDate)} />
              <DetailItem label="Гэрээ дуусах" value={formatDate(selectedEmployee.contractEndDate)} />
              <DetailItem label="Хүйс" value={selectedEmployee.genderLabel} />
              <DetailItem label="Боловсрол" value={selectedEmployee.educationLevel} />
              <DetailItem label="KPI" value={`${Math.round(selectedEmployee.kpiScore)}%`} />
            </div>

            <form
              key={selectedEmployee.id}
              action={updateHrEmployeeRegistrationAction}
              className={styles.registrationForm}
            >
              <input type="hidden" name="employee_id" value={selectedEmployee.id} />
              <div className={styles.formHeader}>
                <h3>Холбоо барих мэдээлэл</h3>
                <p>Ажилтны зураг, ажлын утас, гар утас, и-мэйл мэдээллийг Odoo дээр хадгална.</p>
              </div>

              <label className={styles.photoUploadField}>
                <span className={styles.photoUploadPreview}>
                  <EmployeePhoto employee={selectedEmployee} size="card" />
                </span>
                <span className={styles.photoUploadCopy}>
                  <strong>Ажилтны зураг</strong>
                  <small>JPG, PNG эсвэл WebP зураг 5MB хүртэл</small>
                  <input
                    name="employee_photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                  />
                </span>
              </label>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Ажлын утас</span>
                  <input
                    name="work_phone"
                    defaultValue={selectedEmployee.workPhone}
                    placeholder="Жишээ: 70110000"
                    autoComplete="tel"
                  />
                </label>
                <label className={styles.field}>
                  <span>Гар утас</span>
                  <input
                    name="mobile_phone"
                    defaultValue={selectedEmployee.mobilePhone}
                    placeholder="Жишээ: 99112233"
                    autoComplete="tel"
                  />
                </label>
                <label className={styles.field}>
                  <span>И-мэйл</span>
                  <input
                    name="work_email"
                    type="email"
                    defaultValue={selectedEmployee.workEmail}
                    placeholder="name@example.mn"
                    autoComplete="email"
                  />
                </label>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={() => setSelectedEmployeeId(null)}
                >
                  Хаах
                </button>
                <SubmitButton />
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
