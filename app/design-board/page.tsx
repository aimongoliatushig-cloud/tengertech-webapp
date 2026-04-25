import type { Metadata } from "next";
import type { CSSProperties } from "react";

import styles from "./design-board.module.css";

type Tone = "good" | "attention" | "urgent" | "late" | "pending";
type ActionTone = "primary" | "secondary" | "ghost";

type Metric = {
  label: string;
  value: string;
  note: string;
  tone: Tone;
  featured?: boolean;
};

type ProgressItem = {
  label: string;
  value: number;
  note: string;
  tone: Tone;
};

type ListItem = {
  title: string;
  meta: string;
  detail?: string;
  value?: string;
  action?: string;
  tone: Tone;
};

type InventoryItem = {
  title: string;
  unit: string;
  value: string;
  capacity: number;
  tone: Tone;
  note: string;
};

export const metadata: Metadata = {
  title: "6 дүрийн удирдлагын самбар",
  description:
    "Хотын үйл ажиллагаанд зориулсан нэгдсэн олон дүрийн дизайн самбар.",
};

const statusLegend: Array<{ label: string; note: string; tone: Tone }> = [
  { label: "Хэвийн", note: "Хуваарийн дагуу", tone: "good" },
  { label: "Анхаарах", note: "Шалгалт хэрэгтэй", tone: "attention" },
  { label: "Яаралтай", note: "Шуурхай шийдвэр", tone: "urgent" },
  { label: "Хоцорсон", note: "Хугацаа давсан", tone: "late" },
  { label: "Хүлээгдэж буй", note: "Дараагийн алхам хүлээж байна", tone: "pending" },
];

const executiveMetrics: Metric[] = [
  {
    label: "Нийт гүйцэтгэл",
    value: "82%",
    note: "Өчигдрөөс 4 нэгжээр өссөн, 3 хэлтэс төлөвлөгөөнөөс дээгүүр явж байна.",
    tone: "good",
    featured: true,
  },
  {
    label: "Хоцорсон ажил",
    value: "18",
    note: "Зам талбай, гэрэлтүүлгийн 6 ажил өнөөдөр шийдвэр шаардана.",
    tone: "late",
  },
  {
    label: "Эрсдэлтэй ажил",
    value: "12",
    note: "Материалын тасалдал болон багийн хүрэлцээ муу ажлууд.",
    tone: "urgent",
  },
  {
    label: "Батлах шаардлагатай",
    value: "7",
    note: "Төлөв өөрчлөх, нэмэлт төсөв, илүү цагийн хүсэлт хүлээгдэж байна.",
    tone: "attention",
  },
];

const executiveComparison: ProgressItem[] = [
  { label: "Ногоон байгууламж", value: 91, note: "11 объект хугацаандаа", tone: "good" },
  { label: "Хог тээвэр", value: 88, note: "Маршрут 2 бага зэрэг шахалттай", tone: "good" },
  { label: "Тохижилт", value: 84, note: "2 бригад эрчим нэмэх шаардлагатай", tone: "attention" },
  { label: "Зам талбай", value: 76, note: "Асфальтын нөхөөс хоцорсон", tone: "late" },
];

const executiveAlerts: ListItem[] = [
  {
    title: "Чингэлтэй 4-р хороо - гэрэлтүүлгийн ажил",
    meta: "2 өдөр хоцорсон · Хэлтсийн даргын тайлбар ирээгүй",
    detail: "Шийдвэр: нэмэлт ээлж батлах эсэх",
    tone: "late",
    action: "Шийдвэрлэх",
  },
  {
    title: "Зүлэг усалгааны усны хуваарь",
    meta: "Өнөө орой ачаалал нэмэгдэнэ",
    detail: "Шийдвэр: түр насос шилжүүлэх",
    tone: "urgent",
    action: "Хурдлуулах",
  },
  {
    title: "Хөдөлмөр хамгааллын шалгалт",
    meta: "3 тайлан буцаагдсан",
    detail: "Шийдвэр: ахлах мастерт чиглэл өгөх",
    tone: "attention",
    action: "Хянах",
  },
];

const executiveApprovals: ListItem[] = [
  {
    title: "Давс, бодисын нөхөн захиалга",
    meta: "Нярав · 18,400,000 төгрөг",
    detail: "Өнөөдөр батлахгүй бол 2 маршрут саатна.",
    value: "5 мин",
    action: "Батлах",
    tone: "urgent",
  },
  {
    title: "Илүү цагийн хүсэлт",
    meta: "Тохижилтын хэлтэс · 14 ажилтан",
    detail: "Наадамчдын замын шөнийн ээлжид зориулсан хүсэлт.",
    value: "12 мин",
    action: "Батлах",
    tone: "attention",
  },
  {
    title: "Тоног төхөөрөмж түрээс",
    meta: "Зам талбай · индүү 1 ширхэг",
    detail: "Гадаад түрээсийн үнэ төсвийн дотор багтсан.",
    value: "19 мин",
    action: "Шалгах",
    tone: "pending",
  },
];

const departmentBacklog: ListItem[] = [
  {
    title: "Маршрут А-12 хуваарийн хоцролт",
    meta: "3 ажилтан тайлан дутуу · Өнөөдөр 14:00",
    detail: "Шалтгаан: машин солигдсон тул маршрутын урсгал тасалдсан.",
    tone: "late",
  },
  {
    title: "Засварын материал хүргэлт",
    meta: "2 цэг дээр бодис дуусах эрсдэлтэй",
    detail: "Няравтай нэн даруй тулгалт хийх шаардлагатай.",
    tone: "urgent",
  },
  {
    title: "Тайлан буцаалт",
    meta: "6 зураг тод бус, 2 байршилгүй",
    detail: "Ахлах мастерт дахин илгээх шаардлагатай.",
    tone: "attention",
  },
];

const reviewQueue: ListItem[] = [
  {
    title: "Өглөөний ээлжийн тайлан",
    meta: "8 тайлан · 11:30 дотор шалгана",
    detail: "Зураг, байршил, хэрэглэсэн материалын тулгалт.",
    action: "Шалгах",
    tone: "attention",
  },
  {
    title: "Маршрутын өөрчлөлтийн хүсэлт",
    meta: "2 хүсэлт · Мастер баталгаажуулсан",
    detail: "Хэлтсийн түвшинд дамжуулах шийдвэр хэрэгтэй.",
    action: "Дамжуулах",
    tone: "pending",
  },
  {
    title: "Илүү цагийн урьдчилсан бүртгэл",
    meta: "4 хүн · Санхүүтэй тулгана",
    detail: "Төсөвт багтах эсэхийг нягтлантай хамт үзнэ.",
    action: "Шалгах",
    tone: "urgent",
  },
];

const departmentTeamProgress: ProgressItem[] = [
  { label: "Бригад 1", value: 94, note: "Хуваарь хэвийн", tone: "good" },
  { label: "Бригад 2", value: 79, note: "1 ажил хоцорсон", tone: "attention" },
  { label: "Бригад 3", value: 67, note: "Хүний нөөц ачаалалтай", tone: "late" },
  { label: "Бригад 4", value: 85, note: "Тайлан бүрэн", tone: "good" },
];

const departmentActiveTasks: ListItem[] = [
  {
    title: "Төв талбайн угаалт",
    meta: "Ахлах мастер Батдөл · 5 ажилтан",
    detail: "15:00 дотор зурагтай тайлан хүлээн авна.",
    value: "64%",
    tone: "good",
  },
  {
    title: "Явган замын нөхөөс",
    meta: "Сүхбаатар 6-р хороо",
    detail: "Хөдөлгөөн ихтэй хэсэг тул ээлж сунгах магадлалтай.",
    value: "48%",
    tone: "urgent",
  },
  {
    title: "Хогийн цэгийн ариутгал",
    meta: "Баянзүрх 14-р хороо",
    detail: "Материалын хүргэлт 30 минутын дотор ирнэ.",
    value: "72%",
    tone: "attention",
  },
];

const masterChecklist: Array<{ title: string; meta: string; tone: Tone; checked?: boolean }> = [
  {
    title: "07:30 багийн бүрэлдэхүүн баталгаажуулах",
    meta: "8 ажилтан ирц бүрэн",
    tone: "good",
    checked: true,
  },
  {
    title: "Төв гудамжны хашлага цэвэрлэгээ эхлүүлэх",
    meta: "Маршрут Б-04 · 09:10",
    tone: "urgent",
  },
  {
    title: "Материал хүлээн авалт тэмдэглэх",
    meta: "Будгийн шохой 12 уут",
    tone: "attention",
  },
  {
    title: "Өдрийн тайлангийн зураг бэлдэх",
    meta: "14:30 өмнө 6 зураг",
    tone: "pending",
  },
];

const accountingMetrics: Metric[] = [
  {
    label: "Өнөөдөр төлөх",
    value: "96.4 сая",
    note: "Төлөвлөгөөт 7 гүйлгээ, 2 нь хэтрэх эрсдэлтэй.",
    tone: "urgent",
  },
  {
    label: "Батлах гүйлгээ",
    value: "14",
    note: "Даргын баталгаажуулалт хүлээж буй хүсэлтүүд.",
    tone: "attention",
  },
  {
    label: "Төсвийн ашиглалт",
    value: "78%",
    note: "Зам талбайн зардал дээд хязгаарт ойртсон.",
    tone: "good",
  },
];

const pendingPayments: ListItem[] = [
  {
    title: "Дизель түлшний тооцоо",
    meta: "ШТС гэрээт нийлүүлэгч",
    detail: "Өнөөдөр 16:00 дотор шилжүүлбэл үнийн зөрүү нэмэгдэхгүй.",
    value: "24.8 сая",
    action: "Төлөх",
    tone: "urgent",
  },
  {
    title: "Ажилчдын хоолны төлбөр",
    meta: "7 хоногийн нэгтгэл",
    detail: "Батлагдсан жагсаалт хавсаргасан.",
    value: "8.2 сая",
    action: "Төлөх",
    tone: "attention",
  },
  {
    title: "Түрээсийн индүүний урьдчилгаа",
    meta: "Зам талбайн төслийн техник",
    detail: "Баталгаа ирсэн, нэхэмжлэл бүрэн.",
    value: "12.0 сая",
    action: "Шалгах",
    tone: "pending",
  },
];

const transactionApprovals: ListItem[] = [
  {
    title: "Илүү цагийн цалин",
    meta: "Тохижилтын 14 ажилтан",
    detail: "Хэлтсийн даргын тайлбар хавсарсан.",
    action: "Батлах",
    tone: "attention",
  },
  {
    title: "Материал худалдан авалтын урьдчилгаа",
    meta: "Шохойн гэрээ · 30%",
    detail: "Няравын үлдэгдэл тайлантай тулгасан.",
    action: "Батлах",
    tone: "urgent",
  },
  {
    title: "Байгууллагын картын зарлага",
    meta: "Шуурхай сэлбэг худалдан авалт",
    detail: "Баримт дутуу тул буцаах эсэх шийдвэр хэрэгтэй.",
    action: "Буцаах",
    tone: "late",
  },
];

const transactionRows: Array<{ date: string; item: string; status: string; amount: string; tone: Tone }> = [
  {
    date: "04/23",
    item: "Замын тэмдэглэгээний будаг",
    status: "Шилжүүлсэн",
    amount: "6.8 сая",
    tone: "good",
  },
  {
    date: "04/23",
    item: "Түлшний урьдчилгаа",
    status: "Батлах",
    amount: "24.8 сая",
    tone: "urgent",
  },
  {
    date: "04/22",
    item: "Хөдөлмөр хамгааллын хэрэгсэл",
    status: "Хүлээгдэж буй",
    amount: "9.4 сая",
    tone: "pending",
  },
  {
    date: "04/22",
    item: "Илүү цагийн нөхөн олговор",
    status: "Шалгаж буй",
    amount: "5.1 сая",
    tone: "attention",
  },
];

const warehouseMetrics: Metric[] = [
  {
    label: "Бараа үлдэгдэл",
    value: "186 нэр төрөл",
    note: "11 нэр төрөл доод нөөц рүү орсон.",
    tone: "good",
  },
  {
    label: "Орлого / зарлага",
    value: "32 / 27",
    note: "Өнөөдрийн хөдөлгөөний баримт бүртгэгдсэн.",
    tone: "attention",
  },
  {
    label: "Хүлээгдэж буй захиалга",
    value: "9",
    note: "Тохижилт, гэрэлтүүлгийн багуудаас хүсэлт ирсэн.",
    tone: "pending",
  },
];

const inventoryItems: InventoryItem[] = [
  {
    title: "Замын давс",
    unit: "тонн",
    value: "18 / 40",
    capacity: 45,
    note: "Нөхөн захиалга бэлэн",
    tone: "attention",
  },
  {
    title: "Шохойн уут",
    unit: "уут",
    value: "24 / 90",
    capacity: 27,
    note: "3 өдрийн хэрэгцээ үлдсэн",
    tone: "late",
  },
  {
    title: "Ажлын бээлий",
    unit: "хайрцаг",
    value: "41 / 60",
    capacity: 68,
    note: "Хэвийн эргэлттэй",
    tone: "good",
  },
];

const warehouseOrders: ListItem[] = [
  {
    title: "Тэмдэглэгээний будаг",
    meta: "Зам талбайн бригад · 18 сав",
    detail: "Өглөөний ээлжид тараах хуваарьтай.",
    action: "Гаргах",
    tone: "pending",
  },
  {
    title: "Ариутгалын бодис",
    meta: "Хог тээврийн баг · 9 канистр",
    detail: "Материалын карт тулгагдсан.",
    action: "Гаргах",
    tone: "attention",
  },
  {
    title: "Лампын нөөц",
    meta: "Гэрэлтүүлгийн баг · 36 ширхэг",
    detail: "Захиалга батлагдсан, хүлээн авалт дутуу.",
    action: "Хянах",
    tone: "urgent",
  },
];

const warehouseAlerts: ListItem[] = [
  {
    title: "Шохойн уут доод үлдэгдэлд орсон",
    meta: "Дахин захиалга өгөх хугацаа өнөөдөр",
    detail: "Замын тэмдэглэгээний төлөвлөгөө саатах эрсдэлтэй.",
    action: "Нөхөн захиалах",
    tone: "late",
  },
  {
    title: "Давсны агуулахын тооллого зөрсөн",
    meta: "Сүүлийн 2 гаргалт баримтад дутуу бичигдсэн",
    detail: "Нягтлантай тулгалт хийж засварлана.",
    action: "Шалгах",
    tone: "urgent",
  },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function toneClass(tone: Tone) {
  switch (tone) {
    case "good":
      return styles.toneGood;
    case "attention":
      return styles.toneAttention;
    case "urgent":
      return styles.toneUrgent;
    case "late":
      return styles.toneLate;
    default:
      return styles.tonePending;
  }
}

function chipLabel(tone: Tone) {
  switch (tone) {
    case "good":
      return "Хэвийн";
    case "attention":
      return "Анхаарах";
    case "urgent":
      return "Яаралтай";
    case "late":
      return "Хоцорсон";
    default:
      return "Хүлээгдэж буй";
  }
}

function actionClass(tone: ActionTone) {
  switch (tone) {
    case "secondary":
      return styles.actionSecondary;
    case "ghost":
      return styles.actionGhost;
    default:
      return styles.actionPrimary;
  }
}

function StatusChip({ tone, label }: { tone: Tone; label?: string }) {
  return <span className={cx(styles.statusChip, toneClass(tone))}>{label ?? chipLabel(tone)}</span>;
}

function ActionButton({
  label,
  tone = "primary",
  full = false,
}: {
  label: string;
  tone?: ActionTone;
  full?: boolean;
}) {
  return (
    <button type="button" className={cx(styles.actionButton, actionClass(tone), full && styles.fullButton)}>
      {label}
    </button>
  );
}

function RolePanel({
  eyebrow,
  title,
  description,
  metaLabel,
  metaValue,
  className,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metaLabel: string;
  metaValue: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cx(styles.rolePanel, className)}>
      <header className={styles.roleHeader}>
        <div className={styles.roleHeaderCopy}>
          <span className={styles.roleEyebrow}>{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.roleMetaCard}>
          <span>{metaLabel}</span>
          <strong>{metaValue}</strong>
        </div>
      </header>
      {children}
    </section>
  );
}

function MetricCard({ metric, compact = false }: { metric: Metric; compact?: boolean }) {
  return (
    <article
      className={cx(
        styles.metricCard,
        toneClass(metric.tone),
        metric.featured && styles.metricFeatured,
        compact && styles.metricCompact,
      )}
    >
      <div className={styles.metricTop}>
        <span>{metric.label}</span>
        <StatusChip tone={metric.tone} />
      </div>
      <strong>{metric.value}</strong>
      <p>{metric.note}</p>
    </article>
  );
}

function SectionCard({
  eyebrow,
  title,
  actionLabel,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(styles.sectionCard, className)}>
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionEyebrow}>{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        {actionLabel ? <ActionButton label={actionLabel} tone="ghost" /> : null}
      </header>
      {children}
    </section>
  );
}

function ProgressRow({ item }: { item: ProgressItem }) {
  return (
    <div className={styles.progressRow}>
      <div className={styles.progressRowHeader}>
        <strong>{item.label}</strong>
        <span>{item.value}%</span>
      </div>
      <div className={styles.progressTrack}>
        <span className={cx(styles.progressFill, toneClass(item.tone))} style={{ width: `${item.value}%` }} />
      </div>
      <p>{item.note}</p>
    </div>
  );
}

function ListCard({ item, compact = false }: { item: ListItem; compact?: boolean }) {
  return (
    <article className={cx(styles.listCard, toneClass(item.tone), compact && styles.listCardCompact)}>
      <div className={styles.listCopy}>
        <div className={styles.listTop}>
          <strong>{item.title}</strong>
          <StatusChip tone={item.tone} />
        </div>
        <p>{item.meta}</p>
        {item.detail ? <small>{item.detail}</small> : null}
      </div>
      {item.value || item.action ? (
        <div className={styles.listAside}>
          {item.value ? <span>{item.value}</span> : null}
          {item.action ? <ActionButton label={item.action} tone="ghost" /> : null}
        </div>
      ) : null}
    </article>
  );
}

function TableToneCell({ tone, label }: { tone: Tone; label: string }) {
  return (
    <div className={styles.tableStatus}>
      <StatusChip tone={tone} label={label} />
    </div>
  );
}

function InventoryCard({ item }: { item: InventoryItem }) {
  return (
    <article className={cx(styles.inventoryCard, toneClass(item.tone))}>
      <div className={styles.inventoryTop}>
        <div>
          <strong>{item.title}</strong>
          <span>{item.unit}</span>
        </div>
        <StatusChip tone={item.tone} />
      </div>
      <p className={styles.inventoryValue}>{item.value}</p>
      <div className={styles.progressTrack}>
        <span className={cx(styles.progressFill, toneClass(item.tone))} style={{ width: `${item.capacity}%` }} />
      </div>
      <small>{item.note}</small>
    </article>
  );
}

function ringStyle(value: number): CSSProperties {
  return {
    background: `conic-gradient(#3f9152 ${value}%, rgba(203, 220, 205, 0.52) ${value}% 100%)`,
  };
}

function ExecutivePanel() {
  const [featuredMetric, ...secondaryMetrics] = executiveMetrics;

  return (
    <RolePanel
      eyebrow="1. Захирал / Үйл ажиллагаа хариуцсан менежер"
      title="Стратегийн хяналт, баталгаажуулалт"
      description="Хотын нийт ачаалал, эрсдэл, батлах урсгалыг нэг дэлгэцээс харж шууд шийдвэр гаргана."
      metaLabel="Шуурхай анхаарах"
      metaValue="7 шийдвэр"
    >
      <div className={styles.executiveHero}>
        <MetricCard metric={featuredMetric} />
        <div className={styles.metricStack}>
          {secondaryMetrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} compact />
          ))}
        </div>
      </div>

      <div className={styles.panelSplit}>
        <SectionCard eyebrow="Хэлтэс хоорондын харьцуулалт" title="Явц ба ачааллын зураглал">
          <div className={styles.progressList}>
            {executiveComparison.map((item) => (
              <ProgressRow key={item.label} item={item} />
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Анхааруулга" title="Одоо шийдвэрлэх асуудлууд" actionLabel="Бүгдийг харах">
          <div className={styles.listStack}>
            {executiveAlerts.map((item) => (
              <ListCard key={item.title} item={item} compact />
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard eyebrow="Баталгаажуулалт" title="Таны батлах дараалал" actionLabel="Шууд батлах">
        <div className={styles.listStack}>
          {executiveApprovals.map((item) => (
            <ListCard key={item.title} item={item} />
          ))}
        </div>
      </SectionCard>
    </RolePanel>
  );
}

function DepartmentPanel() {
  return (
    <RolePanel
      eyebrow="2. Хэлтсийн дарга"
      title="Хоцролт бууруулах, тайлан шалгах самбар"
      description="Багуудын ачаалал, шалгах тайлан, дамжуулах шаардлагатай ажлуудыг үйлдэл төвтэй байрлуулсан."
      metaLabel="Өнөөдрийн төвлөрөл"
      metaValue="6 хоцролт"
    >
      <section className={styles.focusBanner}>
        <div>
          <span className={styles.sectionEyebrow}>Шуурхай бүс</span>
          <h3>Эхлээд хоцорсон ажлыг цэгцэлнэ</h3>
          <p>Хамгийн өндөр эрсдэлтэй 3 ажлыг дээр байрлуулж, доороос тайлан болон багийн үзүүлэлтийг авч үзнэ.</p>
        </div>
        <div className={styles.actionRow}>
          <ActionButton label="Шалгах" />
          <ActionButton label="Дамжуулах" tone="secondary" />
        </div>
      </section>

      <div className={styles.departmentGrid}>
        <SectionCard eyebrow="Хоцорсон ажлууд" title="Улаан болон улбар шар дараалал" className={styles.sectionTall}>
          <div className={styles.listStack}>
            {departmentBacklog.map((item) => (
              <ListCard key={item.title} item={item} />
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Шалгах тайлангууд" title="Буцаах эсвэл дараагийн шат руу дамжуулах">
          <div className={styles.listStack}>
            {reviewQueue.map((item) => (
              <ListCard key={item.title} item={item} compact />
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Багийн гүйцэтгэл" title="Ахлагч бүрийн өнөөдрийн явц">
          <div className={styles.progressList}>
            {departmentTeamProgress.map((item) => (
              <ProgressRow key={item.label} item={item} />
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard eyebrow="Идэвхтэй ажлууд" title="Талбай дээр явагдаж буй урсгал" actionLabel="Бүгдийг харах">
        <div className={styles.listStack}>
          {departmentActiveTasks.map((item) => (
            <ListCard key={item.title} item={item} compact />
          ))}
        </div>
      </SectionCard>
    </RolePanel>
  );
}

function MasterPanel() {
  return (
    <RolePanel
      eyebrow="3. Мастер / Ахлах мастер"
      title="Өдрийн ажлын удирдлага"
      description="Яг одоо эхлүүлэх ажил, багийн бэлэн байдал, машин ба маршрутын мэдээллийг нэг үйлдлийн түвшинд төвлөрүүлэв."
      metaLabel="Өнөөдрийн явц"
      metaValue="78%"
    >
      <div className={styles.masterGrid}>
        <SectionCard eyebrow="Өнөөдрийн ажлууд" title="Шалгах хуудас" className={styles.sectionTall}>
          <div className={styles.checklist}>
            {masterChecklist.map((task) => (
              <label key={task.title} className={cx(styles.checklistItem, toneClass(task.tone))}>
                <span className={cx(styles.checkbox, task.checked && styles.checkboxChecked)} />
                <span className={styles.checklistCopy}>
                  <strong>{task.title}</strong>
                  <small>{task.meta}</small>
                </span>
                <StatusChip tone={task.tone} />
              </label>
            ))}
          </div>
        </SectionCard>

        <div className={styles.masterSide}>
          <section className={styles.progressRingCard}>
            <span className={styles.sectionEyebrow}>Прогресс</span>
            <div className={styles.progressRingShell}>
              <div className={styles.progressRing} style={ringStyle(78)}>
                <div className={styles.progressRingInner}>
                  <strong>78%</strong>
                  <span>Өдрийн явц</span>
                </div>
              </div>
            </div>
            <p>Эхний багц ажлын 7-с 5 нь идэвхтэй, 1 нь баталгаажуулалт хүлээж байна.</p>
          </section>

          <SectionCard eyebrow="Машин / маршрут" title="Талбайн бэлэн байдал">
            <div className={styles.routeCard}>
              <div>
                <span>Үндсэн маршрут</span>
                <strong>Б-04 · Энхтайвны өргөн чөлөө</strong>
              </div>
              <StatusChip tone="good" label="Маршрут нээлттэй" />
            </div>
            <div className={styles.routeMetaGrid}>
              <div className={styles.routeMeta}>
                <span>Машин</span>
                <strong>УБА 3478</strong>
                <small>Шатахуун 68%</small>
              </div>
              <div className={styles.routeMeta}>
                <span>Баг</span>
                <strong>8 хүн</strong>
                <small>Ирц бүрэн</small>
              </div>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Тайлан" title="Шууд хөтлөх товчлол">
            <div className={styles.actionColumn}>
              <ActionButton label="Тайлан оруулах" full />
              <ActionButton label="Зураг хавсаргах" tone="secondary" full />
            </div>
          </SectionCard>
        </div>
      </div>
    </RolePanel>
  );
}

function WorkerPanel() {
  return (
    <RolePanel
      eyebrow="4. Энгийн ажилтан · гар утас"
      title="Нэг ажлыг нэг дэлгэцээс дуусгах гар утасны урсгал"
      description="Ажилтан зөвхөн өөрийн хийх ажил, эхлэх товч, зурагтай тайлан, байршлын сануулгыг харна."
      metaLabel="Одоогийн ажил"
      metaValue="2 даалгавар"
      className={styles.mobilePanel}
    >
      <div className={styles.mobilePanelLayout}>
        <section className={styles.mobileNarrative}>
          <div className={styles.mobilePrincipleCard}>
            <span className={styles.sectionEyebrow}>Үндсэн зорилго</span>
            <h3>Эхлэх, гүйцэтгэх, илгээх</h3>
            <p>Талбай дээр илүү текст биш, том товч болон баталгаажуулалтын тод дохио өгнө.</p>
          </div>
          <div className={styles.mobileTags}>
            <StatusChip tone="good" label="Офлайн хадгалалт" />
            <StatusChip tone="attention" label="Байршлын сануулга" />
            <StatusChip tone="pending" label="Зураг 3/6" />
          </div>
        </section>

        <div className={styles.phoneShell}>
          <div className={styles.phoneTopBar}>
            <span>09:41</span>
            <strong>Миний ажил</strong>
            <span>Сүлжээ</span>
          </div>

          <div className={styles.phoneBody}>
            <section className={styles.mobileTaskHero}>
              <div>
                <span className={styles.sectionEyebrow}>Өнөөдрийн даалгавар</span>
                <h3>Төв гудамжны хашлага цэвэрлэгээ</h3>
                <p>Маршрут Б-04 · Ахлах мастер Батдөл</p>
              </div>
              <StatusChip tone="urgent" label="09:10 эхлэх" />
            </section>

            <div className={styles.mobileActionStack}>
              <ActionButton label="Эхлэх" full />
              <ActionButton label="Тайлан илгээх" tone="secondary" full />
            </div>

            <section className={styles.mobileCardGrid}>
              <article className={styles.mobileUtilityCard}>
                <span className={styles.utilityLabel}>Зураг</span>
                <strong>Зураг нэмэх</strong>
                <small>Өмнө, явц, дараах зураг</small>
              </article>
              <article className={styles.mobileUtilityCard}>
                <span className={styles.utilityLabel}>Байршил</span>
                <strong>Газрын зураг</strong>
                <small>50 м дотор шалгалт идэвхжинэ</small>
              </article>
            </section>

            <section className={styles.mapHintCard}>
              <div>
                <span className={styles.sectionEyebrow}>Байршлын сануулга</span>
                <p>Та ажлын бүсэд орсон байна. Эхлэх дармагц цаг бүртгэл автоматаар явна.</p>
              </div>
              <span className={styles.mapPin}>Б-04</span>
            </section>

            <section className={styles.confirmationSheet}>
              <StatusChip tone="good" label="Амжилттай" />
              <h4>Тайлан амжилттай илгээгдлээ</h4>
              <p>6 зураг, байршил, хугацааны тэмдэглэгээ бүртгэгдсэн.</p>
              <ActionButton label="Дараагийн ажил" tone="ghost" full />
            </section>
          </div>
        </div>
      </div>
    </RolePanel>
  );
}

function AccountingPanel() {
  return (
    <RolePanel
      eyebrow="5. Нягтлан"
      title="Санхүүгийн баталгаажуулалт, төлбөрийн самбар"
      description="Төлөх дүн, батлах гүйлгээ, гүйлгээний мөрүүдийг нэг хүрээнд төвлөрүүлж алдаагүй шийдвэр гаргана."
      metaLabel="Шууд хийх ажил"
      metaValue="14 баталгаа"
    >
      <div className={styles.metricRow}>
        {accountingMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} compact />
        ))}
      </div>

      <div className={styles.accountingGrid}>
        <SectionCard eyebrow="Төлбөр хүлээгдэж буй" title="Өнөөдөр гарах мөнгөн урсгал" className={styles.sectionTall}>
          <div className={styles.listStack}>
            {pendingPayments.map((item) => (
              <ListCard key={item.title} item={item} />
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Батлах шаардлагатай" title="Шийдвэр хүлээж буй гүйлгээ">
          <div className={styles.listStack}>
            {transactionApprovals.map((item) => (
              <ListCard key={item.title} item={item} compact />
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard eyebrow="Гүйлгээний жагсаалт" title="Сүүлийн мөрүүд" actionLabel="Нягтлах">
        <div className={styles.tableShell}>
          <div className={styles.tableHeader}>
            <span>Огноо</span>
            <span>Гүйлгээ</span>
            <span>Төлөв</span>
            <span>Дүн</span>
          </div>
          {transactionRows.map((row) => (
            <div key={`${row.date}-${row.item}`} className={styles.tableRow}>
              <span>{row.date}</span>
              <strong>{row.item}</strong>
              <TableToneCell tone={row.tone} label={row.status} />
              <span>{row.amount}</span>
            </div>
          ))}
        </div>
        <div className={styles.actionRow}>
          <ActionButton label="Төлөх" />
          <ActionButton label="Батлах" tone="secondary" />
        </div>
      </SectionCard>
    </RolePanel>
  );
}

function WarehousePanel() {
  return (
    <RolePanel
      eyebrow="6. Нярав / агуулах"
      title="Үлдэгдэл, хөдөлгөөн, нөхөн захиалгын самбар"
      description="Барааны үлдэгдэл, гаргалт, орлогын урсгал, доод нөөцийн анхааруулгыг шийдвэртэй байдлаар харуулна."
      metaLabel="Доод үлдэгдэл"
      metaValue="11 нэр төрөл"
    >
      <div className={styles.metricRow}>
        {warehouseMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} compact />
        ))}
      </div>

      <div className={styles.warehouseGrid}>
        <SectionCard eyebrow="Бараа үлдэгдэл" title="Гол материалын картууд">
          <div className={styles.inventoryGrid}>
            {inventoryItems.map((item) => (
              <InventoryCard key={item.title} item={item} />
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Орлого / зарлага" title="Өнөөдрийн хөдөлгөөн">
          <div className={styles.flowBars}>
            <div className={styles.flowBarCard}>
              <div className={styles.flowBarHeader}>
                <strong>Орлого</strong>
                <span>32 баримт</span>
              </div>
              <div className={styles.tallBarTrack}>
                <span className={styles.tallBarFill} style={{ height: "78%" }} />
              </div>
            </div>
            <div className={styles.flowBarCard}>
              <div className={styles.flowBarHeader}>
                <strong>Зарлага</strong>
                <span>27 баримт</span>
              </div>
              <div className={styles.tallBarTrack}>
                <span className={cx(styles.tallBarFill, styles.tallBarFillAlt)} style={{ height: "66%" }} />
              </div>
            </div>
            <div className={styles.flowSummary}>
              <p>Өглөөний тараалт хийгдсэн. Оройн ээлжид шохойн гаргалт нэмэгдэх төлөвтэй.</p>
              <ActionButton label="Хөдөлгөөн шалгах" tone="secondary" full />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className={styles.warehouseLowerGrid}>
        <SectionCard eyebrow="Хүлээгдэж буй захиалга" title="Тараах дараалал">
          <div className={styles.listStack}>
            {warehouseOrders.map((item) => (
              <ListCard key={item.title} item={item} compact />
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Анхааруулга" title="Доод нөөц ба зөрүү" actionLabel="Тайлан гаргах">
          <div className={styles.listStack}>
            {warehouseAlerts.map((item) => (
              <ListCard key={item.title} item={item} compact />
            ))}
          </div>
        </SectionCard>
      </div>
    </RolePanel>
  );
}

export default function DesignBoardPage() {
  return (
    <main className={styles.page}>
      <div className={styles.canvasGlow} />
      <section className={styles.boardHeader}>
        <div className={styles.boardCopy}>
          <span className={styles.boardEyebrow}>Хотын үйл ажиллагааны нэгдсэн дизайн систем</span>
          <h1>6 дүрийн удирдлагын самбар</h1>
          <p>
            Хотын ажлын веб самбар, гар утасны урсгалд зориулсан үйлдэл төвтэй загвар. Панель бүр “Одоо юу
            чухал вэ?” болон “Би юу хийх ёстой вэ?” гэсэн хоёр асуултад шууд хариулна.
          </p>
          <div className={styles.questionGrid}>
            <article className={styles.questionCard}>
              <strong>Одоо юу чухал вэ?</strong>
              <span>Хоцролт, эрсдэл, батлах дарааллыг дэлгэцийн дээд бүсэд байршуулсан.</span>
            </article>
            <article className={styles.questionCard}>
              <strong>Би юу хийх ёстой вэ?</strong>
              <span>Үндсэн товч, жагсаалт, товчлол бүр дараагийн алхмыг нэг товшилтоор өгнө.</span>
            </article>
          </div>
        </div>

        <div className={styles.boardAside}>
          <section className={styles.boardInfoCard}>
            <span className={styles.sectionEyebrow}>Нэгдсэн зарчим</span>
            <h3>Ногоон-цагаан байгууллагын хэллэг</h3>
            <p>Зөөлөн сүүдэр, тод шатлал, нэг картанд нэг зорилго, ижил системтэй бүрэлдэхүүн ашиглав.</p>
          </section>

          <section className={styles.legendCard}>
            <div className={styles.legendHeader}>
              <span className={styles.sectionEyebrow}>Төлөвийн өнгө</span>
              <h3>Шийдвэрийн ач холбогдлоор ялгана</h3>
            </div>
            <div className={styles.legendGrid}>
              {statusLegend.map((item) => (
                <article key={item.label} className={styles.legendItem}>
                  <StatusChip tone={item.tone} label={item.label} />
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className={styles.roleGrid}>
        <ExecutivePanel />
        <DepartmentPanel />
        <MasterPanel />
        <WorkerPanel />
        <AccountingPanel />
        <WarehousePanel />
      </section>
    </main>
  );
}
