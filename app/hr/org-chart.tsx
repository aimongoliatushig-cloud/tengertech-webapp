import { Users } from "lucide-react";

import type { HrDepartmentNode } from "@/lib/hr";

import styles from "./hr.module.css";

type OrgRole = { title: string; count: number };

type OrgTone = "blue" | "purple" | "amber" | "green" | "orange";

type OrgDepartment = {
  key: string;
  name: string;
  tone: OrgTone;
  /** Odoo хэлтсийн нэрийг тааруулах түлхүүр үг (жижиг үсгээр) */
  match: string[];
  /** Зураг дээрх батлагдсан орон тоо */
  approvedTotal: number;
  roles: OrgRole[];
};

/**
 * Албан ёсны (батлагдсан) орон тооны бүтэц. Албан тушаалын задаргаа нь Odoo-д
 * байдаггүй тул тогтмол лавлагаа болон энд хадгална; хэлтсийн НИЙТ тоог Odoo-гоос
 * амьдаар татаж толгойд харуулна (getDepartmentStructure).
 */
const ORG_DEPARTMENTS: OrgDepartment[] = [
  {
    key: "finance",
    name: "Санхүүгийн алба",
    tone: "blue",
    match: ["санхүү"],
    approvedTotal: 4,
    roles: [
      { title: "Ерөнхий нягтлан бодогч", count: 1 },
      { title: "Тооцооны нягтлан бодогч", count: 1 },
      { title: "Нярав", count: 2 },
    ],
  },
  {
    key: "admin",
    name: "Захиргааны алба",
    tone: "purple",
    match: ["захиргаа"],
    approvedTotal: 9,
    roles: [
      { title: "Захиргааны албаны дарга", count: 1 },
      { title: "Хүний нөөцийн мэргэжилтэн", count: 1 },
      { title: "Хуулийн мэргэжилтэн", count: 1 },
      { title: "Тайлан, төлөвлөлт хариуцсан мэргэжилтэн", count: 1 },
      { title: "Архив, бичиг хэргийн ажилтан", count: 1 },
      { title: "ХАБЭА хяналтын ажилтан", count: 1 },
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
    approvedTotal: 61,
    roles: [
      { title: "Хэлтсийн дарга", count: 1 },
      { title: "Ерөнхий механик", count: 1 },
      { title: "Талбер, хураамж хариуцсан мэргэжилтэн", count: 1 },
      { title: "Тээвэрлэлтийн хяналтын ажилтан", count: 3 },
      { title: "Хог тээврийн жолооч", count: 14 },
      { title: "Хог тээврийн ачигч", count: 25 },
      { title: "Засварчин", count: 2 },
      { title: "Гагнуурчин", count: 1 },
      { title: "Харуул", count: 4 },
      { title: "Цахилгаанчин гэрээт", count: 1 },
      { title: "Түүвэр хог цэвэрлээчийн ажилтан", count: 8 },
    ],
  },
  {
    key: "green",
    name: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
    tone: "green",
    match: ["ногоон"],
    approvedTotal: 61,
    roles: [
      { title: "Хэлтсийн дарга", count: 1 },
      { title: "Ногоон байгууламжийн инженер", count: 1 },
      { title: "Зам талбайн ахлах мастер", count: 1 },
      { title: "Зам талбайн мастер", count: 2 },
      { title: "Зам талбайн үйлчлэгч", count: 44 },
      { title: "Хог тээврийн жолооч", count: 10 },
      { title: "Ковшны оператор", count: 2 },
    ],
  },
  {
    key: "amenity",
    name: "Тохижилтын хэлтэс",
    tone: "orange",
    match: ["тохижилт"],
    approvedTotal: 21,
    roles: [
      { title: "Хэлтсийн дарга", count: 1 },
      { title: "Дизайн, талбайн инженер", count: 1 },
      { title: "Мухачан", count: 1 },
      { title: "Гагнуурчин", count: 2 },
      { title: "Туслах ажилтан", count: 14 },
      { title: "Жолооч", count: 1 },
      { title: "Цахилгаанчин гэрээт", count: 1 },
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

function flattenNodes(nodes: HrDepartmentNode[]): HrDepartmentNode[] {
  const flat: HrDepartmentNode[] = [];
  const walk = (list: HrDepartmentNode[]) => {
    for (const node of list) {
      flat.push(node);
      if (node.children.length) walk(node.children);
    }
  };
  walk(nodes);
  return flat;
}

export function OrgChart({ liveCounts }: { liveCounts: HrDepartmentNode[] }) {
  const flat = flattenNodes(liveCounts);
  const liveFor = (dept: OrgDepartment): number | null => {
    const node = flat.find((candidate) => {
      const name = candidate.name.toLowerCase();
      return dept.match.some((keyword) => name.includes(keyword));
    });
    return node ? node.memberCount : null;
  };

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
          const live = liveFor(dept);
          return (
            <div key={dept.key} className={`${styles.orgDept} ${TONE_CLASS[dept.tone]}`}>
              <div className={styles.orgDeptHead}>
                <h3>{dept.name}</h3>
                <div className={styles.orgDeptCounts}>
                  <span className={styles.orgDeptLive}>
                    <Users aria-hidden size={13} />
                    {live ?? "—"} <em>бодит</em>
                  </span>
                  <span className={styles.orgDeptApproved}>Орон тоо {dept.approvedTotal}</span>
                </div>
              </div>
              <ol className={styles.orgRoles}>
                {dept.roles.map((role) => (
                  <li key={role.title}>
                    <span>{role.title}</span>
                    <b>{role.count}</b>
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
