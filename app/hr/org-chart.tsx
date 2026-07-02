import { Users } from "lucide-react";

import type { HrDepartmentJobCounts } from "@/lib/hr";

import styles from "./hr.module.css";

type OrgRole = {
  title: string;
  /** Батлагдсан орон тоо */
  count: number;
  /** Odoo дахь албан тушаалын өөр бичлэгүүд (тухайн орон тоог тааруулах) */
  aliases?: string[];
};

type OrgTone = "blue" | "purple" | "amber" | "green" | "orange";

type OrgDepartment = {
  key: string;
  name: string;
  tone: OrgTone;
  /** Odoo хэлтсийн нэрийг тааруулах түлхүүр үг (жижиг үсгээр) */
  match: string[];
  roles: OrgRole[];
};

/**
 * Албан ёсны (батлагдсан) орон тооны бүтэц. Албан тушаал бүрийн орон тоо нь
 * тогтмол; бодит томилолтын тоог Odoo-гоос (getDepartmentJobCounts) албан
 * тушаалын нэрээр тааруулж харьцуулна. Odoo дахь нэр өөр бичигдсэн тохиолдолд
 * `aliases`-аар холбоно.
 */
const ORG_DEPARTMENTS: OrgDepartment[] = [
  {
    key: "finance",
    name: "Санхүүгийн алба",
    tone: "blue",
    match: ["санхүү"],
    roles: [
      { title: "Ерөнхий нягтлан бодогч", count: 1, aliases: ["ерөнхий ня-бо"] },
      { title: "Тооцооны нягтлан бодогч", count: 1, aliases: ["тооцооны ня-бо"] },
      { title: "Нярав", count: 2 },
    ],
  },
  {
    key: "admin",
    name: "Захиргааны алба",
    tone: "purple",
    match: ["захиргаа"],
    roles: [
      { title: "Захиргааны албаны дарга", count: 1, aliases: ["захиргааны дарга"] },
      { title: "Хүний нөөцийн мэргэжилтэн", count: 1 },
      { title: "Хуулийн мэргэжилтэн", count: 1 },
      { title: "Тайлан, төлөвлөлт хариуцсан мэргэжилтэн", count: 1, aliases: ["тайлан төлөвлөгөө хариуцсан мэргэжилтэн"] },
      { title: "Архив, бичиг хэргийн ажилтан", count: 1 },
      { title: "ХАБЭА хяналтын ажилтан", count: 1, aliases: ["хабэа"] },
      { title: "Мэдээлэл технологийн ажилтан", count: 1 },
      { title: "Олон нийттэй харилцах ажилтан", count: 1 },
      { title: "Үйлчлэгч", count: 1 },
    ],
  },
  {
    key: "transport",
    name: "Авто базаа, хог тээвэрлэлтийн хэлтэс",
    tone: "amber",
    match: ["хог тээвэр", "авто баз"],
    roles: [
      { title: "Хэлтсийн дарга", count: 1 },
      { title: "Ерөнхий механик", count: 1 },
      { title: "Талбер, хураамж хариуцсан мэргэжилтэн", count: 1, aliases: ["төлбөр хураамж хариуцсан мэргэжилтэн"] },
      { title: "Тээвэрлэлтийн хяналтын ажилтан", count: 3 },
      { title: "Хог тээврийн жолооч", count: 14 },
      { title: "Хог тээврийн ачигч", count: 25 },
      { title: "Засварчин", count: 2 },
      { title: "Гагнуурчин", count: 1 },
      { title: "Харуул", count: 4 },
      { title: "Цахилгаанчин гэрээт", count: 1, aliases: ["цахилгаанчин"] },
      { title: "Түүвэр хог цэвэрлээчийн ажилтан", count: 8, aliases: ["түүвэр хог цэвэрлэгээний ажилтан"] },
    ],
  },
  {
    key: "green",
    name: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
    tone: "green",
    match: ["ногоон"],
    roles: [
      { title: "Хэлтсийн дарга", count: 1 },
      { title: "Ногоон байгууламжийн инженер", count: 1 },
      { title: "Зам талбайн ахлах мастер", count: 1 },
      { title: "Зам талбайн мастер", count: 2, aliases: ["мастер"] },
      { title: "Зам талбайн үйлчлэгч", count: 44 },
      { title: "Хог тээврийн жолооч", count: 10 },
      { title: "Ковшны оператор", count: 2, aliases: ["ковшийн оператор"] },
    ],
  },
  {
    key: "amenity",
    name: "Тохижилтын хэлтэс",
    tone: "orange",
    match: ["тохижилт"],
    roles: [
      { title: "Хэлтсийн дарга", count: 1 },
      { title: "Дизайн, талбайн инженер", count: 1, aliases: ["даамал талбайн инженер"] },
      { title: "Мухачан", count: 1, aliases: ["мужаан"] },
      { title: "Гагнуурчин", count: 2 },
      { title: "Туслах ажилтан", count: 14 },
      { title: "Жолооч", count: 1 },
      { title: "Цахилгаанчин гэрээт", count: 1, aliases: ["цахилгаанчин"] },
    ],
  },
];

const TONE_CLASS: Record<OrgTone, string> = {
  blue: styles.orgToneBlue,
  purple: styles.orgTonePurple,
  amber: styles.orgToneAmber,
  green: styles.orgToneGreen,
  orange: styles.orgToneOrange,
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

type ComputedRole = {
  title: string;
  approved: number;
  filled: number;
  extra: boolean;
};

function computeDepartment(dept: OrgDepartment, buckets: HrDepartmentJobCounts[]) {
  const bucket = buckets.find((candidate) => {
    const name = candidate.departmentName.toLowerCase();
    return dept.match.some((keyword) => name.includes(keyword));
  });
  const counts = bucket ? bucket.jobCounts : [];
  const usedTitles = new Set<string>();

  const rows: ComputedRole[] = dept.roles.map((role) => {
    const aliases = [role.title, ...(role.aliases ?? [])].map(normalize);
    let filled = 0;
    for (const entry of counts) {
      if (aliases.includes(normalize(entry.title))) {
        filled += entry.count;
        usedTitles.add(entry.title);
      }
    }
    return { title: role.title, approved: role.count, filled, extra: false };
  });

  // Odoo-д бүртгэлтэй боловч батлагдсан бүтцэд ороогүй албан тушаалууд
  const extras: ComputedRole[] = counts
    .filter((entry) => !usedTitles.has(entry.title))
    .map((entry) => ({ title: entry.title, approved: 0, filled: entry.count, extra: true }));

  const totalApproved = dept.roles.reduce((sum, role) => sum + role.count, 0);
  const totalFilled = bucket ? bucket.total : 0;
  const vacancies = Math.max(0, totalApproved - totalFilled);

  return { rows: [...rows, ...extras], totalApproved, totalFilled, vacancies };
}

function roleStatusClass(role: ComputedRole): string {
  if (role.extra) return styles.orgRoleExtra;
  if (role.filled === 0) return styles.orgRoleVacant;
  if (role.filled < role.approved) return styles.orgRolePartial;
  if (role.filled > role.approved) return styles.orgRoleOver;
  return styles.orgRoleOk;
}

export function OrgChart({ jobCounts }: { jobCounts: HrDepartmentJobCounts[] }) {
  return (
    <div className={styles.orgChart}>
      <div className={styles.orgSpine}>
        <div className={styles.orgLevel}>
          <div className={`${styles.orgTopBox} ${styles.orgToneBoard}`}>
            <span>Төлөөлөн удирдах зөвлөл</span>
            <strong>5</strong>
          </div>
          <span className={styles.orgDash} aria-hidden />
          <div className={styles.orgAside}>
            <span>ТУЗ-ийн нарийн бичгийн дарга</span>
            <strong>1</strong>
          </div>
        </div>

        <span className={styles.orgConnector} aria-hidden />

        <div className={styles.orgLevel}>
          <div className={`${styles.orgTopBox} ${styles.orgToneDirector}`}>
            <span>Захирал</span>
            <strong>1</strong>
          </div>
          <span className={styles.orgDash} aria-hidden />
          <div className={styles.orgAside}>
            <span>Дотоод хяналтын ажилтан</span>
            <strong>1</strong>
          </div>
        </div>

        <span className={styles.orgConnector} aria-hidden />

        <div className={styles.orgLevel}>
          <div className={`${styles.orgTopBox} ${styles.orgToneOps}`}>
            <span>Үйл ажиллагаа хариуцсан менежер</span>
            <strong>1</strong>
          </div>
        </div>

        <span className={styles.orgConnector} aria-hidden />
      </div>

      <div className={styles.orgDepartments}>
        {ORG_DEPARTMENTS.map((dept) => {
          const { rows, totalApproved, totalFilled, vacancies } = computeDepartment(dept, jobCounts);
          return (
            <div key={dept.key} className={`${styles.orgDept} ${TONE_CLASS[dept.tone]}`}>
              <div className={styles.orgDeptHead}>
                <h3>{dept.name}</h3>
                <div className={styles.orgDeptCounts}>
                  <span className={styles.orgDeptLive}>
                    <Users aria-hidden size={13} />
                    {totalFilled}/{totalApproved} <em>бодит/орон тоо</em>
                  </span>
                  {vacancies > 0 ? (
                    <span className={styles.orgDeptVacant}>{vacancies} сул</span>
                  ) : (
                    <span className={styles.orgDeptFull}>Дүүрсэн</span>
                  )}
                </div>
              </div>
              <ol className={styles.orgRoles}>
                {rows.map((role, index) => (
                  <li key={`${role.title}-${index}`} className={roleStatusClass(role)}>
                    <span>
                      {role.title}
                      {role.extra ? <i className={styles.orgRoleTag}>орон тоонд заагаагүй</i> : null}
                    </span>
                    <span className={styles.orgRoleCount}>
                      <b>{role.filled}</b>
                      <small>/{role.approved}</small>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
