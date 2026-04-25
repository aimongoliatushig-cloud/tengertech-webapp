"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

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

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={styles.primaryAction} disabled={pending}>
      {pending ? "Хадгалж байна..." : "Бүртгэл хадгалах"}
    </button>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className={styles.detailItem}>
      <span>{label}</span>
      <strong>{value || "Бүртгээгүй"}</strong>
    </div>
  );
}

export function HrDirectory({ departments, initialEmployeeId }: Props) {
  const employees = useMemo(
    () => departments.flatMap((department) => department.employees),
    [departments],
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    initialEmployeeId ?? null,
  );
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) ?? null;

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
    return <div className={styles.emptyState}>Одоогоор харагдах бүртгэлтэй ажилтан алга.</div>;
  }

  return (
    <>
      <div className={styles.departmentList}>
        {departments.map(({ departmentName, employees: departmentEmployees }) => (
          <section key={departmentName} className={styles.departmentCard}>
            <div className={styles.departmentHeader}>
              <div>
                <h3>{departmentName}</h3>
                <p>Энэ хэлтэст {departmentEmployees.length} ажилтан бүртгэлтэй байна.</p>
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
                  <h4>{employee.name}</h4>
                  <p className={styles.jobTitle}>{employee.jobTitle}</p>

                  <div className={styles.metaStack}>
                    <div className={styles.metaRow}>
                      <span>Хэрэглэгч</span>
                      <strong>{employee.userName || "Холбоогүй"}</strong>
                    </div>
                    <div className={styles.metaRow}>
                      <span>Ажлын утас</span>
                      <strong>{employee.workPhone || "Бүртгээгүй"}</strong>
                    </div>
                    <div className={styles.metaRow}>
                      <span>Гар утас</span>
                      <strong>{employee.mobilePhone || "Бүртгээгүй"}</strong>
                    </div>
                    <div className={styles.metaRow}>
                      <span>И-мэйл</span>
                      <strong>{employee.workEmail || "Бүртгээгүй"}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

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
                x
              </button>
            </div>

            <div className={styles.detailGrid}>
              <DetailItem label="Хэлтэс" value={selectedEmployee.departmentName} />
              <DetailItem label="Албан тушаал" value={selectedEmployee.jobTitle} />
              <DetailItem label="Хэрэглэгч" value={selectedEmployee.userName || "Холбоогүй"} />
              <DetailItem label="Ажлын утас" value={selectedEmployee.workPhone} />
              <DetailItem label="Гар утас" value={selectedEmployee.mobilePhone} />
              <DetailItem label="И-мэйл" value={selectedEmployee.workEmail} />
            </div>

            <form
              key={selectedEmployee.id}
              action={updateHrEmployeeRegistrationAction}
              className={styles.registrationForm}
            >
              <input type="hidden" name="employee_id" value={selectedEmployee.id} />
              <div className={styles.formHeader}>
                <h3>Холбоо барих бүртгэл</h3>
                <p>Ажлын утас, гар утас, и-мэйл мэдээллийг Odoo дээр хадгална.</p>
              </div>

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
