"use client";

import Link from "next/link";
import { Activity, AlertTriangle, Building2, Users } from "lucide-react";

import { formatEmployeeDisplayName } from "@/lib/hr-name";
import type { HrDepartmentJobCounts } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import { AgeBarChart, AnimatedPie, STATUS_COLORS, type ChartSlice } from "./hr-dashboard-client";
import { DepartmentStructureCard, findOrgDepartment, isDepartmentExcludedTitle } from "./org-chart";
import styles from "./hr.module.css";

const AGE_BUCKET_DEFS: { label: string; min: number; max: number }[] = [
  { label: "18-25", min: 18, max: 25 },
  { label: "26-35", min: 26, max: 35 },
  { label: "36-45", min: 36, max: 45 },
  { label: "46-55", min: 46, max: 55 },
  { label: "56+", min: 56, max: 200 },
];

function rowInitials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("mn-MN") ?? "");
  return letters.join("") || "?";
}

export function DepartmentDashboardClient({
  departmentId,
  departmentName,
  matchName,
  employees,
  jobCounts,
}: {
  departmentId: number;
  departmentName: string;
  matchName?: string;
  employees: HrEmployeeDirectoryItem[];
  jobCounts: HrDepartmentJobCounts[];
}) {
  const structureDept = findOrgDepartment(matchName || departmentName);
  const bucket =
    jobCounts.find((entry) => entry.departmentId === departmentId) ??
    jobCounts.find((entry) => entry.departmentName.toLowerCase().includes((matchName || departmentName).toLowerCase())) ??
    null;

  // Идэвхтэй ажилтнаар л тоолж, бүтцээс хасагдах албан тушаалыг (Дотоод хяналт)
  // хасаж, бүтцийн бодит тоотой бүрэн нийцүүлнэ.
  const roster = employees.filter(
    (employee) => employee.active && !isDepartmentExcludedTitle(employee.jobTitle || ""),
  );
  const total = roster.length;
  const maleCount = roster.filter((employee) => employee.genderKey === "male").length;
  const femaleCount = roster.filter((employee) => employee.genderKey === "female").length;

  const currentYear = new Date().getFullYear();
  const ages = roster
    .map((employee) => {
      const birthYear = Number((employee.birthDate || "").slice(0, 4));
      return birthYear > 1900 ? currentYear - birthYear : null;
    })
    .filter((age): age is number => age !== null && age > 14 && age < 100);
  const averageAge = ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0;
  const ageBuckets = AGE_BUCKET_DEFS.map((bucketDef) => ({
    label: bucketDef.label,
    value: ages.filter((age) => age >= bucketDef.min && age <= bucketDef.max).length,
  }));

  const approvedTotal = structureDept ? structureDept.roles.reduce((sum, role) => sum + role.count, 0) : null;
  const vacancies = approvedTotal != null ? Math.max(0, approvedTotal - total) : null;

  const positionSlices: ChartSlice[] = bucket
    ? bucket.jobCounts
        .filter((entry) => !isDepartmentExcludedTitle(entry.title))
        .sort((left, right) => {
          const leftHead = /дарга/i.test(left.title) ? 0 : 1;
          const rightHead = /дарга/i.test(right.title) ? 0 : 1;
          return leftHead - rightHead || right.count - left.count;
        })
        .map((entry, index) => ({
          label: entry.title,
          value: entry.count,
          color: STATUS_COLORS[index % STATUS_COLORS.length],
        }))
    : [];

  const genderSlices: ChartSlice[] = [
    { label: "Эрэгтэй", value: maleCount, color: "#2563eb" },
    { label: "Эмэгтэй", value: femaleCount, color: "#ec4899" },
  ];

  const statCards = [
    { label: "Нийт ажилтан", value: `${total}`, note: "Бодит томилолт", icon: Users, tone: styles.statCardTotal },
    {
      label: "Батлагдсан орон тоо",
      value: approvedTotal != null ? `${approvedTotal}` : "—",
      note: "Бүтцээр батлагдсан",
      icon: Building2,
      tone: styles.statCardActive,
    },
    {
      label: "Сул орон тоо",
      value: vacancies != null ? `${vacancies}` : "—",
      note: "Хараахан томилогдоогүй",
      icon: AlertTriangle,
      tone: styles.statCardPending,
    },
    {
      label: "Дундаж нас",
      value: averageAge ? `${averageAge}` : "—",
      note: `Эр ${maleCount} · Эм ${femaleCount}`,
      icon: Activity,
      tone: styles.statCardTrial,
    },
  ];

  return (
    <>
      <section className={styles.statGrid}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`${styles.statCard} ${card.tone}`}>
              <span className={styles.statIcon}>
                <Icon aria-hidden />
              </span>
              <div>
                <small>{card.label}</small>
                <strong>{card.value}</strong>
                <p>{card.note}</p>
              </div>
            </div>
          );
        })}
      </section>

      {structureDept ? (
        <section className={styles.orgSection}>
          <header className={styles.orgSectionHead}>
            <span className={styles.orgSectionIcon}>
              <Building2 aria-hidden size={16} />
            </span>
            <div>
              <h2>Орон тооны бүтэц</h2>
              <p>Албан тушаал бүрийн батлагдсан орон тоо ба бодит томилолтыг харьцуулав.</p>
            </div>
          </header>
          <div className={styles.orgDepartments}>
            <DepartmentStructureCard dept={structureDept} jobCounts={jobCounts} />
          </div>
        </section>
      ) : null}

      <div className={styles.chartGrid}>
        {positionSlices.length > 0 ? (
          <AnimatedPie
            title="Албан тушаалын бүтэц"
            slices={positionSlices}
            centerLabel="Ажилтан"
            centerValue={`${total}`}
            variant="donut"
          />
        ) : null}
        <AnimatedPie
          title="Хүйсийн харьцаа"
          slices={genderSlices}
          centerLabel="Нийт"
          centerValue={`${maleCount + femaleCount}`}
          variant="donut"
        />
        <AgeBarChart title="Насны бүтэц" buckets={ageBuckets} averageAge={averageAge} />
      </div>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2>Хэлтсийн ажилтнууд</h2>
          <span>{total}</span>
        </div>
        {roster.length ? (
          <div className={styles.deptEmployeeGrid}>
            {roster.map((employee) => (
              <Link
                key={employee.id}
                href={`/hr/employees/${employee.id}`}
                className={`${styles.detailRow} ${styles.detailRowPerson}`}
              >
                <span className={styles.detailRowAvatar} aria-hidden>
                  {employee.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={employee.photoUrl} alt="" className={styles.detailRowAvatarImg} />
                  ) : (
                    rowInitials(employee.name)
                  )}
                </span>
                <span>
                  <strong>{formatEmployeeDisplayName(employee.name)}</strong>
                  <small>{employee.jobTitle || "Албан тушаал бүртгээгүй"}</small>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>Энэ хэлтэст ажилтан бүртгэгдээгүй байна.</strong>
            <span>Ажилтан нэмэгдмэгц энд харагдана.</span>
          </div>
        )}
      </section>
    </>
  );
}
