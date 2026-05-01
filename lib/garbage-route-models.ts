export const ODOO_MODELS = {
  weeklyRoutePlan: "mfo.planning.template",
  weeklyRoutePlanLine: "mfo.planning.template.line",
  dailyRouteTask: "project.task",
  routePointLine: "mfo.stop.execution.line",
  inspectionReport: "mfo.issue.report",
  proofImage: "mfo.proof.image",
  issueReport: "mfo.issue.report",
  planningOverride: "mfo.planning.override",
  route: "mfo.route",
  routeLine: "mfo.route.line",
  vehicle: "fleet.vehicle",
  employee: "hr.employee",
  crewTeam: "mfo.crew.team",
  garbagePoint: "mfo.collection.point",
  project: "project.project",
  attachment: "ir.attachment",
} as const;

export const GARBAGE_STATUS_LABELS: Record<string, string> = {
  draft: "Төлөвлөгдсөн",
  dispatched: "Төлөвлөгдсөн",
  in_progress: "Явцтай",
  submitted: "Дутуу",
  verified: "Дууссан",
  cancelled: "Цуцлагдсан",
  changed: "Өөрчлөгдсөн",
  problem: "Асуудалтай",
};

export const POINT_STATUS_LABELS: Record<string, string> = {
  draft: "Хүлээгдэж байна",
  arrived: "Очсон",
  done: "Дууссан",
  skipped: "Дутуу",
  issue: "Асуудалтай",
};

export const WEEKDAY_LABELS: Record<string, string> = {
  "0": "Даваа",
  "1": "Мягмар",
  "2": "Лхагва",
  "3": "Пүрэв",
  "4": "Баасан",
  "5": "Бямба",
  "6": "Ням",
};

export const ISSUE_TYPE_LABELS = [
  "Хог байхгүй",
  "Зам хаалттай",
  "Машин эвдэрсэн",
  "Иргэн саад болсон",
  "Цэг олдоогүй",
  "Бусад",
] as const;

export const CHANGE_REASON_LABELS = [
  "Машин эвдэрсэн",
  "Жолооч өвдсөн",
  "Ачигч ирээгүй",
  "Маршрут өөрчлөгдсөн",
  "Яаралтай ажил гарсан",
  "Бусад",
] as const;
