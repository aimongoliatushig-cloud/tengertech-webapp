import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".codex", "project-tracker");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "latest.json");
const TEXT_EXTENSIONS = new Set([
  ".csv",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".ts",
  ".tsx",
  ".xml",
]);
const EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  ".tmp-pptx-check",
  ".tmp-pptx-guide",
  "tmp-full-qa",
  "tmp-garbage-route-screens",
  "tmp-hr-screens",
  "tmp-login-ui-screens",
  "tmp-role-scope-screens",
  "tmp-role-ui-screens",
  "webapp-intro-video",
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function relative(filePath) {
  return toPosix(path.relative(ROOT, filePath));
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("tmp-") || EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

const files = walk(ROOT).map((filePath) => ({
  path: relative(filePath),
  content: readFile(filePath),
}));

function evidence(kind, reason, predicate, limit = 8) {
  return files
    .filter(predicate)
    .slice(0, limit)
    .map((file) => ({
      kind,
      path: file.path,
      reason,
    }));
}

function pathIncludes(fragment) {
  const normalized = toPosix(fragment).toLowerCase();
  return (file) => file.path.toLowerCase().includes(normalized);
}

function contentMatches(pattern, pathFragment = "") {
  const normalizedPath = pathFragment ? toPosix(pathFragment).toLowerCase() : "";
  return (file) =>
    (!normalizedPath || file.path.toLowerCase().includes(normalizedPath)) &&
    pattern.test(file.content);
}

function signal(label, weight, evidences, missing) {
  return {
    label,
    weight,
    evidence: evidences,
    missing,
  };
}

function scoreSignals(signals) {
  const totalWeight = signals.reduce((sum, item) => sum + item.weight, 0);
  const readyWeight = signals
    .filter((item) => item.evidence.length > 0)
    .reduce((sum, item) => sum + item.weight, 0);
  return totalWeight ? Math.round((readyWeight / totalWeight) * 100) : 0;
}

function statusFor(percent) {
  if (percent >= 100) return "done";
  if (percent >= 80) return "mostly_done";
  if (percent > 0) return "partial";
  return "missing";
}

function moduleReport(config) {
  const implementationPercent = scoreSignals(config.implementation);
  const roleActionPercent = scoreSignals(config.roleActions);
  const testingPercent = scoreSignals(config.testing);
  const overallPercent = Math.round(
    implementationPercent * 0.5 + roleActionPercent * 0.25 + testingPercent * 0.25,
  );
  const allSignals = [
    ...config.implementation,
    ...config.roleActions,
    ...config.testing,
  ];
  const evidenceRefs = allSignals.flatMap((item) => item.evidence);
  const missingSignals = allSignals
    .filter((item) => item.evidence.length === 0)
    .map((item) => item.missing);

  return {
    key: config.key,
    title: config.title,
    department: config.department,
    summary: config.summary,
    overallPercent,
    implementationPercent,
    roleActionPercent,
    testingPercent,
    status: statusFor(overallPercent),
    evidenceCount: evidenceRefs.length,
    evidenceRefs,
    missingSignals,
    implementation: config.implementation,
    roleActions: config.roleActions,
    testing: config.testing,
  };
}

const qaEvidence = evidence("qa", "QA болон тестийн файл", pathIncludes("qa"));
const roleQaEvidence = evidence("qa", "Role workflow QA script", pathIncludes("webapp-role-qa.mjs"));

const configs = [
  {
    key: "work-task-report",
    title: "Ажил / Даалгавар / Тайлан",
    department: "Бүх үндсэн хэлтэс",
    summary: "Гурван үндсэн хэлтсийн ажлын төлөвлөлт, даалгавар, явц, тайлан, хяналт.",
    implementation: [
      signal("Project/task дэлгэц", 15, evidence("ui", "Project/task route", pathIncludes("app/projects")), "Project/task дэлгэцийн нотолгоо алга"),
      signal("Task detail/report UI", 15, evidence("ui", "Task detail/report component", pathIncludes("app/tasks")), "Task detail/report UI алга"),
      signal("Field mobile flow", 15, evidence("ui", "Field worker route", pathIncludes("app/field")), "Field mobile flow алга"),
      signal("Workspace report export", 10, evidence("api", "Workspace report export API", pathIncludes("app/api/workspace-report")), "Workspace report export API алга"),
      signal("Task Word/PDF export", 10, evidence("api", "Task export API", pathIncludes("app/api/tasks")), "Task Word/PDF export API алга"),
      signal("Odoo task/work model", 15, evidence("odoo", "Odoo work/task model", contentMatches(/municipal\.work|project\.task|ops\.task\.report/)), "Odoo work/task model нотолгоо алга"),
      signal("Progress/status logic", 10, evidence("logic", "Progress/status logic", contentMatches(/progress|stageBucket|statusKey/, "lib")), "Progress/status logic алга"),
      signal("Reports dashboard", 10, evidence("ui", "Reports page", pathIncludes("app/reports")), "Reports page алга"),
    ],
    roleActions: [
      signal("Manager create/review", 30, evidence("role", "Manager capabilities", contentMatches(/create_tasks|view_quality_center|review/i, "lib")), "Manager create/review role нотолгоо алга"),
      signal("Worker report submit", 25, evidence("role", "Worker report capability", contentMatches(/write_workspace_reports|canSubmitWorkspaceReport/, "lib")), "Worker report submit role нотолгоо алга"),
      signal("Master department scope", 20, evidence("role", "Master scope logic", contentMatches(/isMasterRole|departmentScope/, "app")), "Master department scope алга"),
      signal("Report approval/return", 25, evidence("workflow", "Report action UI", contentMatches(/approve|return|review|буцаах|батлах/i, "app/tasks")), "Report approval/return нотолгоо алга"),
    ],
    testing: [
      signal("Role QA", 35, roleQaEvidence, "Role QA script алга"),
      signal("Report export API", 25, evidence("api", "Report export API", pathIncludes("app/api/reports/export")), "Report export API алга"),
      signal("QA acceptance docs", 20, qaEvidence, "QA acceptance doc алга"),
      signal("Build/lint scripts", 20, evidence("config", "Build/lint scripts", contentMatches(/"build"|"lint"/, "package.json")), "Build/lint scripts алга"),
    ],
  },
  {
    key: "procurement",
    title: "Худалдан авалт",
    department: "Санхүү болон үндсэн хэлтсүүд",
    summary: "Task-linked request, quote collection, finance payment, receiving, parts/material usage.",
    implementation: [
      signal("Procurement UI", 15, evidence("ui", "Procurement route", pathIncludes("app/procurement")), "Procurement UI алга"),
      signal("Procurement server actions", 10, evidence("api", "Procurement action", pathIncludes("app/procurement/actions.ts")), "Procurement action алга"),
      signal("Procurement library", 10, evidence("logic", "Procurement lib", pathIncludes("lib/procurement.ts")), "Procurement lib алга"),
      signal("Odoo procurement model", 15, evidence("odoo", "Odoo procurement model", contentMatches(/municipal\.procurement|procurement/i, "odoo_addons")), "Odoo procurement model алга"),
      signal("Quote/payment fields", 15, evidence("odoo", "Quote/payment fields", contentMatches(/quote|paid_amount|payment|supplier|amount_total/i, "odoo_addons")), "Quote/payment field нотолгоо алга"),
      signal("Receiving/parts usage", 15, evidence("odoo", "Receiving/parts usage", contentMatches(/received|receipt|part|сэлбэг/i, "odoo_addons")), "Receiving/parts usage нотолгоо алга"),
      signal("Security/access", 10, evidence("security", "Procurement security", contentMatches(/procurement|purchase|finance|storekeeper/i, "security")), "Procurement security алга"),
      signal("Reports/dashboard", 10, evidence("ui", "Procurement dashboard", pathIncludes("app/procurement/dashboard")), "Procurement dashboard алга"),
    ],
    roleActions: [
      signal("Department head request", 20, evidence("role", "Department head procurement", contentMatches(/department_head|municipalDepartmentHead|requested_by/i)), "Department head request нотолгоо алга"),
      signal("Purchase manager quote", 20, evidence("role", "Quote collection", contentMatches(/quote_collection|purchase_manager|quote/i)), "Purchase manager quote нотолгоо алга"),
      signal("Finance payment", 25, evidence("role", "Finance payment", contentMatches(/finance|paid_amount|record_payment|payment/i)), "Finance payment нотолгоо алга"),
      signal("Storekeeper receiving", 20, evidence("role", "Storekeeper receiving", contentMatches(/storekeeper|opsStorekeeper|received|receipt/i)), "Storekeeper receiving нотолгоо алга"),
      signal("High-value approval", 15, evidence("role", "High-value approval", contentMatches(/ceo|legal|contract|1000000|high_value/i)), "High-value approval нотолгоо алга"),
    ],
    testing: [
      signal("Procurement requirement doc", 25, evidence("doc", "Procurement requirements", pathIncludes("procurement_requirements.md")), "Procurement requirement doc алга"),
      signal("Role QA", 25, roleQaEvidence, "Role QA script алга"),
      signal("Procurement UI files", 25, evidence("ui", "Procurement UI", pathIncludes("app/procurement")), "Procurement UI test target алга"),
      signal("Static checks", 25, evidence("config", "Build/lint scripts", contentMatches(/"build"|"lint"/, "package.json")), "Static check script алга"),
    ],
  },
  {
    key: "fleet-garbage",
    title: "Авто бааз, хог тээвэрлэлт",
    department: "Авто бааз, хог тээвэрлэлт",
    summary: "Vehicle registry, driver assignment, fleet repair, garbage collection route execution, weight/fuel import.",
    implementation: [
      signal("Auto base UI", 10, evidence("ui", "Auto base route", pathIncludes("app/auto-base")), "Auto base UI алга"),
      signal("Fleet repair UI", 10, evidence("ui", "Fleet repair route", pathIncludes("app/fleet-repair")), "Fleet repair UI алга"),
      signal("Garbage routes UI", 10, evidence("ui", "Garbage route route", pathIncludes("app/garbage-routes")), "Garbage routes UI алга"),
      signal("Garbage route APIs", 15, evidence("api", "Garbage route API", pathIncludes("app/api/garbage-routes")), "Garbage route API алга"),
      signal("Fleet repair APIs", 10, evidence("api", "Fleet repair API", pathIncludes("app/api/fleet-repair")), "Fleet repair API алга"),
      signal("Vehicle/repair Odoo models", 15, evidence("odoo", "Vehicle/repair model", contentMatches(/fleet\.vehicle|municipal\.repair|vehicle/i, "odoo_addons")), "Vehicle/repair Odoo model алга"),
      signal("Garbage route Odoo models", 15, evidence("odoo", "Garbage route model", contentMatches(/mfo\.route|mfo\.stop|mfo\.proof|mfo\.issue/i, "odoo_addons")), "Garbage route Odoo model алга"),
      signal("Weight/fuel import", 15, evidence("integration", "Weight/fuel import", contentMatches(/GARBAGE_|weight|fuel|garbage.*sync/i)), "Weight/fuel import нотолгоо алга"),
    ],
    roleActions: [
      signal("Driver/loader execution", 25, evidence("role", "Driver/loader role", contentMatches(/mfoDriver|mfoLoader|driver|loader/i)), "Driver/loader execution нотолгоо алга"),
      signal("Department head route planning", 20, evidence("role", "Weekly planning", contentMatches(/weekly|planning|generate-today|route/i, "app/garbage-routes")), "Route planning role нотолгоо алга"),
      signal("Mechanic repair workflow", 20, evidence("role", "Mechanic workflow", contentMatches(/mechanic|diagnosed|repair|done/i)), "Mechanic workflow нотолгоо алга"),
      signal("Inspection workflow", 15, evidence("role", "Inspection workflow", contentMatches(/inspection|issue|inspector/i)), "Inspection workflow нотолгоо алга"),
      signal("Procurement repair link", 20, evidence("integration", "Repair procurement link", contentMatches(/procurement|part|сэлбэг/i, "odoo_addons/municipal_repair_workflow")), "Repair procurement link алга"),
    ],
    testing: [
      signal("Garbage route requirements", 20, evidence("doc", "Garbage route build doc", pathIncludes("garbage-route-planning-build.md")), "Garbage route requirement doc алга"),
      signal("Auto base requirements", 20, evidence("doc", "Auto base addendum", pathIncludes("auto-base-user-requirements-addendum.md")), "Auto base requirement doc алга"),
      signal("Garbage route screenshots/QA", 20, evidence("qa", "Garbage route QA artifacts", pathIncludes("tmp-garbage-route-screens")), "Garbage route QA artifact алга"),
      signal("Role QA", 20, roleQaEvidence, "Role QA script алга"),
      signal("Static checks", 20, evidence("config", "Build/lint scripts", contentMatches(/"build"|"lint"/, "package.json")), "Static check script алга"),
    ],
  },
  {
    key: "green-improvement",
    title: "Ногоон байгууламж, тохижилт үйлчилгээ",
    department: "Ногоон байгууламж, тохижилт үйлчилгээ",
    summary: "Green area and improvement/service work through shared projects, tasks, mobile reporting, manager review.",
    implementation: [
      signal("Shared project/task UI", 20, evidence("ui", "Shared project/task route", pathIncludes("app/projects")), "Shared project/task UI алга"),
      signal("Field report UI", 15, evidence("ui", "Field route", pathIncludes("app/field")), "Field report UI алга"),
      signal("Environment Odoo addon", 20, evidence("odoo", "Environment addon", pathIncludes("odoo_addons/municipal_environment_services")), "Environment addon алга"),
      signal("Green/improvement models", 15, evidence("odoo", "Green/improvement model", contentMatches(/municipal\.green|municipal\.improvement|green|improvement/i)), "Green/improvement model алга"),
      signal("Department group mapping", 10, evidence("logic", "Department groups", contentMatches(/Ногоон|Тохижилт|green|improvement/i, "lib/department-groups")), "Department group mapping алга"),
      signal("Reports coverage", 10, evidence("ui", "Reports route", pathIncludes("app/reports")), "Reports coverage алга"),
      signal("Role access flags", 10, evidence("role", "Environment role flags", contentMatches(/environment|greenMaster|improvement/i, "lib/roles")), "Environment role flags алга"),
    ],
    roleActions: [
      signal("Manager/master review", 30, evidence("role", "Manager/master review", contentMatches(/greenMaster|improvementManager|environmentManager|review/i)), "Manager/master review нотолгоо алга"),
      signal("Worker/mobile report", 30, evidence("role", "Worker/mobile report", contentMatches(/environmentWorker|greenEngineer|improvementWelder|write_workspace_reports/i)), "Worker/mobile report нотолгоо алга"),
      signal("Department filtered reports", 20, evidence("role", "Department report filtering", contentMatches(/department|filterByDepartment|matchesDepartmentGroup/i, "app/reports")), "Department report filtering алга"),
      signal("Task assignment", 20, evidence("role", "Task assignment", contentMatches(/assigned|employee|leader|responsible/i, "app/projects")), "Task assignment нотолгоо алга"),
    ],
    testing: [
      signal("Workflow task/report skill", 25, evidence("doc", "Workflow task/report guardrail", pathIncludes("workflow_task_report_side")), "Workflow task/report doc алга"),
      signal("Role QA", 25, roleQaEvidence, "Role QA script алга"),
      signal("Reports page", 25, evidence("ui", "Reports page", pathIncludes("app/reports")), "Reports page алга"),
      signal("Static checks", 25, evidence("config", "Build/lint scripts", contentMatches(/"build"|"lint"/, "package.json")), "Static check script алга"),
    ],
  },
  {
    key: "road-cleaning",
    title: "Зам цэвэрлэгээ",
    department: "Зам цэвэрлэгээ",
    summary: "Cleaning area registration, today work generation, mobile execution, before/after proof, master review.",
    implementation: [
      signal("Road cleaning API", 15, evidence("api", "Road cleaning API", pathIncludes("app/api/road-cleaning")), "Road cleaning API алга"),
      signal("Cleaning area store", 15, evidence("logic", "Cleaning area store", pathIncludes("lib/road-cleaning-area-store.ts")), "Cleaning area store алга"),
      signal("Cleaning Odoo model", 20, evidence("odoo", "Cleaning Odoo model", contentMatches(/municipal\.cleaning\.area|cleaning_area|цэвэр/i, "odoo_addons")), "Cleaning Odoo model алга"),
      signal("Cleaning views", 10, evidence("odoo", "Cleaning views", pathIncludes("municipal_cleaning_views.xml")), "Cleaning views алга"),
      signal("Shared work model", 15, evidence("odoo", "Shared work model", contentMatches(/municipal\.work|project\.task/i, "odoo_addons")), "Shared work model алга"),
      signal("Mobile field flow", 15, evidence("ui", "Mobile field flow", pathIncludes("app/field")), "Mobile field flow алга"),
      signal("Review/return fields", 10, evidence("workflow", "Review/return fields", contentMatches(/review|returned|approve|return|буцаах/i)), "Review/return нотолгоо алга"),
    ],
    roleActions: [
      signal("Master create/review", 35, evidence("role", "Master create/review", contentMatches(/master|review|approve|return/i)), "Master create/review нотолгоо алга"),
      signal("Employee own work", 35, evidence("role", "Employee own work", contentMatches(/employee_id|assigned|own|mfoMobile|worker/i)), "Employee own work нотолгоо алга"),
      signal("Manager/admin overview", 15, evidence("role", "Manager/admin overview", contentMatches(/municipalManager|system_admin|manager/i)), "Manager/admin overview нотолгоо алга"),
      signal("Return reason", 15, evidence("validation", "Return reason", contentMatches(/reason|review_note|return/i)), "Return reason нотолгоо алга"),
    ],
    testing: [
      signal("Road cleaning requirements", 30, evidence("doc", "Road cleaning skill", pathIncludes("road_area_cleaning_mvp")), "Road cleaning requirement doc алга"),
      signal("Road cleaning API target", 25, evidence("api", "Road cleaning API", pathIncludes("app/api/road-cleaning")), "Road cleaning API target алга"),
      signal("Role QA", 20, roleQaEvidence, "Role QA script алга"),
      signal("Static checks", 25, evidence("config", "Build/lint scripts", contentMatches(/"build"|"lint"/, "package.json")), "Static check script алга"),
    ],
  },
  {
    key: "hr",
    title: "Хүний нөөц",
    department: "Хүний нөөц",
    summary: "Employee registry, leave/sick/trip, discipline, orders/contracts, offboarding, reports without attendance scope.",
    implementation: [
      signal("HR UI", 15, evidence("ui", "HR route", pathIncludes("app/hr")), "HR UI алга"),
      signal("HR API", 10, evidence("api", "HR API", pathIncludes("app/api/hr")), "HR API алга"),
      signal("HR addon", 15, evidence("odoo", "HR custom addon", pathIncludes("odoo_addons/hr_custom_mn")), "HR addon алга"),
      signal("Employee registry", 10, evidence("odoo", "Employee model", contentMatches(/hr\.employee|employee/i, "odoo_addons/hr_custom_mn")), "Employee registry нотолгоо алга"),
      signal("Leave/sick/trip", 15, evidence("odoo", "Leave/timeoff model", contentMatches(/leave|sick|trip|timeoff/i)), "Leave/sick/trip нотолгоо алга"),
      signal("Discipline", 15, evidence("odoo", "Discipline model", contentMatches(/discipline|сахилга/i)), "Discipline нотолгоо алга"),
      signal("Clearance/offboarding", 10, evidence("api", "Clearance/offboarding", contentMatches(/clearance|terminate|archive|offboarding/i)), "Clearance/offboarding нотолгоо алга"),
      signal("HR reports", 10, evidence("ui", "HR reports", pathIncludes("app/hr/reports")), "HR reports алга"),
    ],
    roleActions: [
      signal("HR manager access", 30, evidence("role", "HR manager role", contentMatches(/hrManager|municipalHr|canAccessHr/i)), "HR manager access нотолгоо алга"),
      signal("Employee limited own access", 20, evidence("role", "Employee access", contentMatches(/own|employee|hrUser/i)), "Employee limited access нотолгоо алга"),
      signal("Department head HR view", 20, evidence("role", "Department HR scope", contentMatches(/department|municipalDepartmentHead/i)), "Department head HR view нотолгоо алга"),
      signal("Director/general manager view", 15, evidence("role", "Director HR view", contentMatches(/director|general_manager|municipalDirector/i)), "Director HR view нотолгоо алга"),
      signal("No attendance in HR scope", 15, evidence("doc", "No attendance HR rule", contentMatches(/without attendance|No attendance|attendance/i, ".codex/skills/hr-manager-no-attendance")), "No-attendance HR rule нотолгоо алга"),
    ],
    testing: [
      signal("HR requirements", 25, evidence("doc", "HR requirements", pathIncludes("hr_requirements.md")), "HR requirements doc алга"),
      signal("HR screens QA artifacts", 20, evidence("qa", "HR screen QA artifacts", pathIncludes("tmp-hr-screens")), "HR screen QA artifact алга"),
      signal("Role QA", 25, roleQaEvidence, "Role QA script алга"),
      signal("Static checks", 30, evidence("config", "Build/lint scripts", contentMatches(/"build"|"lint"/, "package.json")), "Static check script алга"),
    ],
  },
  {
    key: "dashboard-reports-notifications",
    title: "Самбар / Тайлан / Мэдэгдэл",
    department: "Удирдлага ба бүх хэлтэс",
    summary: "General dashboard, department reports, procurement/fleet/HR summaries, push notifications, readiness tracking.",
    implementation: [
      signal("General dashboard", 15, evidence("ui", "General dashboard", pathIncludes("app/general-dashboard")), "General dashboard алга"),
      signal("Department reports", 15, evidence("ui", "Reports page", pathIncludes("app/reports")), "Reports page алга"),
      signal("Procurement dashboard", 10, evidence("ui", "Procurement dashboard", pathIncludes("app/procurement/dashboard")), "Procurement dashboard алга"),
      signal("Fleet dashboard", 10, evidence("ui", "Fleet dashboard", pathIncludes("app/fleet-repair/dashboard")), "Fleet dashboard алга"),
      signal("Garbage dashboard", 10, evidence("ui", "Garbage dashboard", pathIncludes("app/garbage-routes/dashboard")), "Garbage dashboard алга"),
      signal("HR reports/dashboard", 10, evidence("ui", "HR reports/dashboard", contentMatches(/dashboard|reports/i, "app/hr")), "HR reports/dashboard алга"),
      signal("Push notification addon/API", 15, evidence("notification", "Push notification code", contentMatches(/push|notification|web-push/i)), "Push notification code алга"),
      signal("Completion tracker", 15, evidence("tracker", "Project tracker", pathIncludes("project-tracker")), "Project tracker алга"),
    ],
    roleActions: [
      signal("Executive dashboard access", 25, evidence("role", "Executive dashboard access", contentMatches(/canAccessGeneralDashboard|municipalDirector|general_manager/i)), "Executive dashboard access алга"),
      signal("Manager department reports", 25, evidence("role", "Manager report access", contentMatches(/departmentScopedMode|matchesDepartmentGroup|canWriteReports/i, "app/reports")), "Manager report access алга"),
      signal("HR dashboard/report access", 20, evidence("role", "HR dashboard/report access", contentMatches(/canViewHr|canAccessHr|hrManager/i)), "HR dashboard/report access алга"),
      signal("Notification counts/menu", 15, evidence("role", "Notification menu", contentMatches(/notificationCount|notifications|review/i, "app")), "Notification menu нотолгоо алга"),
      signal("Finance/procurement visibility", 15, evidence("role", "Finance/procurement visibility", contentMatches(/fleetRepairFinance|procurement|finance/i)), "Finance/procurement visibility алга"),
    ],
    testing: [
      signal("UI acceptance doc", 25, evidence("doc", "UI acceptance doc", pathIncludes("municipal-ui-acceptance.md")), "UI acceptance doc алга"),
      signal("Role QA", 25, roleQaEvidence, "Role QA script алга"),
      signal("Full QA runner", 20, evidence("qa", "Full QA runner", pathIncludes("tmp-full-qa-runner.mjs")), "Full QA runner алга"),
      signal("Static checks", 30, evidence("config", "Build/lint scripts", contentMatches(/"build"|"lint"/, "package.json")), "Static check script алга"),
    ],
  },
];

const modules = configs.map(moduleReport);
const overallPercent = modules.length
  ? Math.round(modules.reduce((sum, item) => sum + item.overallPercent, 0) / modules.length)
  : 0;
const implementationPercent = modules.length
  ? Math.round(modules.reduce((sum, item) => sum + item.implementationPercent, 0) / modules.length)
  : 0;
const roleActionPercent = modules.length
  ? Math.round(modules.reduce((sum, item) => sum + item.roleActionPercent, 0) / modules.length)
  : 0;
const testingPercent = modules.length
  ? Math.round(modules.reduce((sum, item) => sum + item.testingPercent, 0) / modules.length)
  : 0;

const report = {
  generatedAt: new Date().toISOString(),
  source: "repo-scan",
  prdPath: "docs/municipal-erp-prd-roadmap.md",
  overallPercent,
  implementationPercent,
  roleActionPercent,
  testingPercent,
  modules,
  warnings: [
    "100% нь зөвхөн код байгаа эсэхээр биш, дүрийн үйлдэл болон тестийн нотолгоотой үед бүрэн гэж тооцогдоно.",
    "Энэ тайлан нь repository evidence дээр үндэслэсэн автомат үнэлгээ бөгөөд Odoo database upgrade ажиллуулдаггүй.",
  ],
  outOfScope: [
    "Иргэдийн санал гомдол",
    "Бүрэн санхүү/accounting модуль",
    "Бүрэн агуулах/inventory модуль",
    "Нийтийн порталын нэмэлт боломжууд",
  ],
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (!process.argv.includes("--silent")) {
  console.log(`Project tracker scan written: ${relative(OUTPUT_FILE)}`);
  console.log(`Overall readiness: ${overallPercent}%`);
}
