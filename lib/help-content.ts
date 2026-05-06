import { hasCapability, isMasterRole, isWorkerOnly, type RoleGroupFlags, type UserRole } from "@/lib/roles";

export type HelpAudience =
  | "all"
  | "executive"
  | "department_head"
  | "master"
  | "worker"
  | "hr"
  | "procurement"
  | "fleet"
  | "garbage";

export type HelpVisibilityContext = {
  login?: string;
  role: UserRole;
  groupFlags?: Partial<RoleGroupFlags> | null;
  departmentScopeName?: string | null;
};

export type HelpStep = {
  title: string;
  body: string;
};

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  route: string;
  screenshot: string;
  audience: HelpAudience;
  tags: string[];
  steps: HelpStep[];
};

function flags(context: HelpVisibilityContext) {
  return context.groupFlags || {};
}

export function isExecutiveHelpUser(context: HelpVisibilityContext) {
  const groupFlags = flags(context);
  return Boolean(
    context.role === "system_admin" ||
      context.role === "director" ||
      context.role === "general_manager" ||
      groupFlags.municipalDirector ||
      groupFlags.fleetRepairCeo ||
      groupFlags.fleetRepairGeneralManager,
  );
}

export function isDepartmentHeadHelpUser(context: HelpVisibilityContext) {
  const groupFlags = flags(context);
  return Boolean(
    context.role === "project_manager" ||
      groupFlags.municipalDepartmentHead ||
      groupFlags.municipalManager ||
      groupFlags.mfoManager ||
      groupFlags.mfoDispatcher ||
      groupFlags.environmentManager ||
      groupFlags.improvementManager ||
      groupFlags.fleetRepairManager,
  );
}

export function isHrHelpUser(context: HelpVisibilityContext) {
  const groupFlags = flags(context);
  return Boolean(
    context.role === "hr_specialist" ||
      context.role === "hr_manager" ||
      groupFlags.hrUser ||
      groupFlags.hrManager ||
      groupFlags.municipalHr,
  );
}

export function isProcurementHelpUser(context: HelpVisibilityContext) {
  const groupFlags = flags(context);
  return Boolean(
    isExecutiveHelpUser(context) ||
      groupFlags.opsStorekeeper ||
      groupFlags.fleetRepairPurchaser ||
      groupFlags.fleetRepairFinance ||
      groupFlags.fleetRepairAccounting ||
      groupFlags.fleetRepairManager ||
      groupFlags.fleetRepairCeo,
  );
}

export function isFleetHelpUser(context: HelpVisibilityContext) {
  const groupFlags = flags(context);
  return Boolean(
    isExecutiveHelpUser(context) ||
      groupFlags.fleetRepairAny ||
      groupFlags.fleetRepairMechanic ||
      groupFlags.fleetRepairTeamLeader ||
      groupFlags.fleetRepairManager,
  );
}

export function isGarbageHelpUser(context: HelpVisibilityContext) {
  const groupFlags = flags(context);
  return Boolean(
    isExecutiveHelpUser(context) ||
      isDepartmentHeadHelpUser(context) ||
      groupFlags.mfoManager ||
      groupFlags.mfoDispatcher ||
      groupFlags.mfoInspector ||
      groupFlags.mfoMobile ||
      groupFlags.mfoDriver ||
      groupFlags.mfoLoader,
  );
}

function canSeeHelpAudience(context: HelpVisibilityContext, audience: HelpAudience) {
  switch (audience) {
    case "all":
      return true;
    case "executive":
      return isExecutiveHelpUser(context);
    case "department_head":
      return isExecutiveHelpUser(context) || isDepartmentHeadHelpUser(context);
    case "master":
      return (
        isExecutiveHelpUser(context) ||
        isDepartmentHeadHelpUser(context) ||
        isMasterRole(context.role) ||
        Boolean(flags(context).municipalMaster || flags(context).greenMaster || flags(context).fleetRepairTeamLeader)
      );
    case "worker":
      return (
        isWorkerOnly(context) ||
        hasCapability(context, "write_workspace_reports") ||
        Boolean(flags(context).mfoMobile || flags(context).mfoDriver || flags(context).mfoLoader)
      );
    case "hr":
      return isExecutiveHelpUser(context) || isHrHelpUser(context);
    case "procurement":
      return isProcurementHelpUser(context);
    case "fleet":
      return isFleetHelpUser(context);
    case "garbage":
      return isGarbageHelpUser(context);
    default:
      return false;
  }
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "dashboard-overview",
    title: "Нүүр самбар дээр ажлаа харах",
    summary: "Нэвтэрсний дараа өөрийн role-д зөвшөөрөгдсөн ажил, мэдэгдэл, хурдан холбоосуудыг шалгана.",
    route: "/",
    screenshot: "/help-assets/dashboard-desktop.png",
    audience: "all",
    tags: ["самбар", "нүүр", "ажил", "dashboard", "эхлэл"],
    steps: [
      {
        title: "Зүүн цэснээс “Хяналтын самбар” дарна.",
        body: "Нүүр самбар дээр таны эрхийн хүрээнд харах ёстой ажил, хэлтэс, тайлангийн товч мэдээлэл гарна.",
      },
      {
        title: "Дээд хэсгийн тоон картуудыг шалгана.",
        body: "Хугацаа хэтэрсэн, хяналт хүлээж буй, явж буй ажлын тоог харж аль хэсэг рүү орохоо сонгоно.",
      },
      {
        title: "Карт эсвэл хурдан холбоос дээр дарна.",
        body: "Дарсан хэсэг тухайн ажил, жагсаалт, тайлан эсвэл мэдэгдлийн дэлгэц рүү шилжинэ.",
      },
    ],
  },
  {
    id: "executive-control",
    title: "Удирдлагын ерөнхий хяналт",
    summary: "Захирал, CEO, ерөнхий менежер бүх алба нэгжийн явц, эрсдэл, тайланг нэг дор хянана.",
    route: "/general-dashboard",
    screenshot: "/help-assets/dashboard-desktop.png",
    audience: "executive",
    tags: ["захирал", "ceo", "general manager", "ерөнхий хяналт", "бүх алба", "статистик"],
    steps: [
      {
        title: "Зүүн цэснээс “Ерөнхий хяналт” дарна.",
        body: "Энэ дэлгэц бүх алба нэгжийн нийт ажил, гүйцэтгэл, эрсдэлийг нэгтгэн харуулна.",
      },
      {
        title: "Алба нэгжийн хэсэг дээр дарж задална.",
        body: "Тухайн хэлтсийн ажил, даалгавар, хүлээгдэж буй тайлангийн жагсаалт руу орно.",
      },
      {
        title: "Анхаарал шаардсан мөрүүдийг нээнэ.",
        body: "Хугацаа хэтэрсэн, буцаагдсан, хяналт хүлээж буй ажлуудыг шалгаад хариуцсан дарга руу чиглүүлнэ.",
      },
    ],
  },
  {
    id: "create-work",
    title: "Шинэ ажил эсвэл даалгавар үүсгэх",
    summary: "Эрхтэй хэрэглэгч “Шинэ ажил” хэсгээс ажил, даалгавар, тайлангийн урсгалаа сонгоно.",
    route: "/create",
    screenshot: "/help-assets/create-hub.png",
    audience: "department_head",
    tags: ["шинэ ажил", "үүсгэх", "даалгавар", "ажил нэмэх", "хэлтсийн дарга"],
    steps: [
      {
        title: "Зүүн цэсний “Шинэ ажил” товч дээр дарна.",
        body: "Эрхгүй хэрэглэгчид энэ товч харагдахгүй, харин дарга болон удирдлагын role дээр гарна.",
      },
      {
        title: "Үүсгэх урсгалаа сонгоно.",
        body: "Ажил үүсгэх, даалгавар нэмэх, тайлан оруулах сонголтуудаас шаардлагатай хэсгийг дарна.",
      },
      {
        title: "Хэлтэс, хариуцагч, хугацаа, тайлбараа бөглөнө.",
        body: "Хэлтсийн дарга дээр өөрийн хэлтэс автоматаар хязгаарлагдаж, зөвхөн зөвшөөрөгдсөн ажилтан сонгогдоно.",
      },
    ],
  },
  {
    id: "department-review",
    title: "Хэлтсийн ажлыг хянах, батлах",
    summary: "Хэлтсийн дарга өөрийн алба нэгжийн ажлын явц, хяналт хүлээж буй тайланг шалгана.",
    route: "/review",
    screenshot: "/help-assets/department-manager.png",
    audience: "department_head",
    tags: ["хянах", "батлах", "буцаах", "хэлтэс", "review", "тайлан"],
    steps: [
      {
        title: "Зүүн цэснээс “Мэдэгдэл” эсвэл “Тайлан” дарна.",
        body: "Хяналт хүлээж буй ажил, буцаах шаардлагатай тайлан, хугацаа хэтэрсэн даалгавар харагдана.",
      },
      {
        title: "Жагсаалтын card дээр дарж дэлгэрэнгүй нээнэ.",
        body: "Тухайн ажлын зураг, тайлбар, явц, хариуцагчийн мэдээллийг шалгана.",
      },
      {
        title: "“Батлах” эсвэл “Буцаах” үйлдлээ сонгоно.",
        body: "Буцаах үед шалтгаанаа Монгол хэлээр тодорхой бичвэл мастер засварлаад дахин илгээх боломжтой.",
      },
    ],
  },
  {
    id: "master-report",
    title: "Мастер тайлан мэдээ оруулах",
    summary: "Ахлах мастер, мастер өөрт болон багт оноогдсон ажлын гүйцэтгэлээ зурагтай илгээнэ.",
    route: "/tasks",
    screenshot: "/help-assets/master-review.png",
    audience: "master",
    tags: ["мастер", "ахлах мастер", "тайлан оруулах", "зураг", "гүйцэтгэл"],
    steps: [
      {
        title: "Зүүн цэснээс “Календарь” эсвэл “Ажлууд” дарна.",
        body: "Өөрийн алба нэгж, багт оноогдсон өнөөдрийн болон төлөвлөгдсөн ажлууд харагдана.",
      },
      {
        title: "Тайлан оруулах ажлын card дээр дарна.",
        body: "Ажлын дэлгэрэнгүй дэлгэц дээр гүйцэтгэлийн хувь, тэмдэглэл, зураг хавсаргах хэсэг гарна.",
      },
      {
        title: "Зураг, тоо хэмжээ, тайлбараа оруулаад “Илгээх” дарна.",
        body: "Илгээсний дараа тайлан хяналт руу шилжиж, буцаагдвал мэдэгдэл дээр засах шаардлага гарна.",
      },
    ],
  },
  {
    id: "worker-mobile-report",
    title: "Ажилтан утсаар тайлан илгээх",
    summary: "Field user өөрт оноогдсон ажлаа нээж зураг, тэмдэглэл, тоо хэмжээг илгээнэ.",
    route: "/tasks",
    screenshot: "/help-assets/worker-assigned.png",
    audience: "worker",
    tags: ["ажилтан", "утас", "mobile", "тайлан", "зураг", "оноогдсон ажил"],
    steps: [
      {
        title: "Доод хурдан цэснээс “Ажил” дарна.",
        body: "Зөвхөн танд оноогдсон ажил, даалгавар гарна. Бусад хэлтсийн мэдээлэл харагдахгүй.",
      },
      {
        title: "Гүйцэтгэх ажлын card дээр дарна.",
        body: "Ажлын нэр, байршил, хугацаа, шаардлагатай зураг болон тэмдэглэлийн хэсэг нээгдэнэ.",
      },
      {
        title: "Зураг хавсаргаад “Тайлан илгээх” дарна.",
        body: "Зураг тод, тайлбар богино бөгөөд ойлгомжтой байвал хяналт хурдан батлагдана.",
      },
    ],
  },
  {
    id: "notifications",
    title: "Мэдэгдлээс ажил руу орох",
    summary: "Өөрт ирсэн шинэ ажил, буцаагдсан тайлан, хяналтын хүсэлтийг мэдэгдлээс нээнэ.",
    route: "/notifications",
    screenshot: "/help-assets/notifications.png",
    audience: "all",
    tags: ["мэдэгдэл", "notification", "буцаагдсан", "шинэ ажил", "bell"],
    steps: [
      {
        title: "Зүүн цэс эсвэл доод dock дээрх “Мэдэгдэл” дарна.",
        body: "Шинэ ажил, буцаагдсан тайлан, хугацаа хэтэрсэн анхааруулга жагсаалтаар гарна.",
      },
      {
        title: "Мэдэгдлийн card дээр дарна.",
        body: "Дарсан card тухайн ажил, тайлан эсвэл хяналтын дэлгэрэнгүй дэлгэц рүү шууд очно.",
      },
      {
        title: "Шаардлагатай үйлдлээ дуусгана.",
        body: "Ажилтан бол тайлан засаж илгээнэ, дарга бол шалгаж батлах эсвэл буцаах үйлдэл хийнэ.",
      },
    ],
  },
  {
    id: "reports",
    title: "Тайлан, статистик харах",
    summary: "Удирдлага болон хэлтсийн дарга тайланг хэлтэс, нэгж, ажлаар нь шүүж харна.",
    route: "/reports",
    screenshot: "/help-assets/reports.png",
    audience: "department_head",
    tags: ["тайлан", "статистик", "excel", "csv", "шүүлт", "зураг"],
    steps: [
      {
        title: "Зүүн цэснээс “Тайлан, статистик” дарна.",
        body: "Өөрийн эрхийн хүрээнд бүх байгууллага эсвэл зөвхөн өөрийн хэлтсийн тайлан гарна.",
      },
      {
        title: "Хэлтэс, нэгжийн шүүлт сонгоно.",
        body: "Тайлангууд ажил бүрээр бүлэглэгдэж, зураг/audio хавсралтын тоо харагдана.",
      },
      {
        title: "Excel, CSV, JSON export дарна.",
        body: "Тухайн сонгосон хүрээний тайлан татагдаж, дотоод тайлангийн файлд ашиглаж болно.",
      },
    ],
  },
  {
    id: "hr-dashboard",
    title: "Хүний нөөцийн мэдээлэл харах",
    summary: "HR эрхтэй хэрэглэгч ажилтан, чөлөө, өвчтэй, сахилга, шилжилт хөдөлгөөний мэдээлэл удирдана.",
    route: "/hr",
    screenshot: "/help-assets/hr-dashboard.png",
    audience: "hr",
    tags: ["hr", "хүний нөөц", "ажилтан", "чөлөө", "сахилга", "шилжилт"],
    steps: [
      {
        title: "Зүүн цэснээс “Хүний нөөц” дарна.",
        body: "HR dashboard дээр ажилтны тоо, идэвхтэй хүсэлт, бичиг баримтын төлөв харагдана.",
      },
      {
        title: "Ажилтан, чөлөө, сахилга зэрэг tab-аа сонгоно.",
        body: "Сонгосон tab бүр тухайн төрлийн бүртгэл, хайлт, дэлгэрэнгүй мэдээлэл рүү оруулна.",
      },
      {
        title: "Бүртгэл дээр дарж дэлгэрэнгүй шалгана.",
        body: "Эрхтэй бол мэдээлэл шинэчлэх, хавсралт харах, workflow үйлдэл хийх боломжтой.",
      },
    ],
  },
  {
    id: "fleet-repair",
    title: "Засварын хүсэлт хянах",
    summary: "Авто бааз, засвар, нярав, санхүү, удирдлагын role засварын хүсэлтийн явцыг хянана.",
    route: "/fleet-repair/requests",
    screenshot: "/help-assets/fleet-repair-list.png",
    audience: "fleet",
    tags: ["засвар", "авто бааз", "машин", "fleet", "repair", "хүсэлт"],
    steps: [
      {
        title: "Зүүн цэснээс “Засварын хүсэлт” дарна.",
        body: "Таны role-д тохирох засварын хүсэлт, төлөв, дараагийн хийх үйлдэл жагсаалтаар гарна.",
      },
      {
        title: "Хүсэлтийн мөр дээр дарж дэлгэрэнгүй нээнэ.",
        body: "Машин, эвдрэл, үнийн санал, санхүү, гэрээ, засварын явцыг нэг дэлгэц дээр шалгана.",
      },
      {
        title: "Өөрийн role-ийн товчийг дарна.",
        body: "Нярав, санхүү, засварчин, менежер, CEO бүр зөвхөн өөрт зөвшөөрөгдсөн action-г гүйцэтгэнэ.",
      },
    ],
  },
  {
    id: "procurement",
    title: "Худалдан авалтын хүсэлт шийдвэрлэх",
    summary: "Нярав, худалдан авалт, санхүү, удирдлагын role хүсэлт, санал, төлбөр, шийдвэрийг хянана.",
    route: "/procurement/dashboard",
    screenshot: "/help-assets/fleet-repair-detail.png",
    audience: "procurement",
    tags: ["худалдан авалт", "procurement", "санхүү", "нярав", "үнийн санал", "төлбөр"],
    steps: [
      {
        title: "Зүүн цэснээс “Худалдан авалт” дарна.",
        body: "Нээлттэй, хүлээгдэж буй, шийдвэр шаардсан хүсэлтүүд role-оор шүүгдэж гарна.",
      },
      {
        title: "Хүсэлт дээр дарж дэлгэрэнгүй мэдээллийг шалгана.",
        body: "Бараа үйлчилгээ, үнийн санал, төсөв, гэрээ, төлбөрийн мэдээлэл нэг урсгалаар харагдана.",
      },
      {
        title: "Өөрт ногдсон үйлдлийг гүйцэтгэнэ.",
        body: "Санал нэмэх, төлбөр бүртгэх, батлах, буцаах зэрэг товч зөвхөн эрхтэй хэрэглэгчид харагдана.",
      },
    ],
  },
  {
    id: "garbage-route",
    title: "Хог тээврийн өнөөдрийн маршрут",
    summary: "Хог тээврийн дарга, диспетчер, жолооч, ачигч өнөөдрийн маршрут, цэгийн явцыг шалгана.",
    route: "/garbage-routes/today",
    screenshot: "/help-assets/garbage-route-today.png",
    audience: "garbage",
    tags: ["хог", "маршрут", "жолооч", "ачигч", "цэг", "өнөөдрийн ажил"],
    steps: [
      {
        title: "Зүүн цэснээс “Хог тээврийн маршрут” дарна.",
        body: "Дарга дээр бүх маршрут, field хэрэглэгч дээр өөрт оноогдсон өнөөдрийн маршрут харагдана.",
      },
      {
        title: "Маршрут эсвэл цэг дээр дарна.",
        body: "Цэгийн байршил, төлөв, зураг оруулах болон дуусгах үйлдэл нээгдэнэ.",
      },
      {
        title: "Ирсэн, дууссан, асуудалтай төлөвөө бүртгэнэ.",
        body: "Зураг, тэмдэглэлээ оруулснаар диспетчер болон дарга хяналтын самбараас явцыг харна.",
      },
    ],
  },
];

export function getVisibleHelpTopics(context: HelpVisibilityContext) {
  return HELP_TOPICS.filter((topic) => canSeeHelpAudience(context, topic.audience));
}

export function getHelpAudienceLabel(audience: HelpAudience) {
  switch (audience) {
    case "executive":
      return "Удирдлага";
    case "department_head":
      return "Хэлтсийн дарга";
    case "master":
      return "Мастер";
    case "worker":
      return "Ажилтан";
    case "hr":
      return "Хүний нөөц";
    case "procurement":
      return "Худалдан авалт";
    case "fleet":
      return "Авто бааз";
    case "garbage":
      return "Хог тээвэр";
    default:
      return "Бүгд";
  }
}
