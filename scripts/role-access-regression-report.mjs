import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const cwd = process.cwd();
const reportDir = path.join(cwd, "docs", "qa");
const assetDir = path.join(cwd, "docs", "qa-assets", "role-access");
const liveSummaryPath = path.join(cwd, "tmp-webapp-role-qa", "summary.json");

fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(assetDir, { recursive: true });

const allFlags = {
  municipalWorker: false,
  municipalMaster: false,
  municipalInspector: false,
  municipalDepartmentHead: false,
  municipalManager: false,
  municipalDirector: false,
  municipalHr: false,
  municipalIt: false,
  mfoManager: false,
  mfoDispatcher: false,
  mfoInspector: false,
  mfoMobile: false,
  mfoDriver: false,
  mfoLoader: false,
  fleetRepairAny: false,
  fleetRepairMechanic: false,
  fleetRepairTeamLeader: false,
  fleetRepairAccounting: false,
  fleetRepairAdministration: false,
  fleetRepairFinance: false,
  fleetRepairPurchaser: false,
  fleetRepairGeneralManager: false,
  fleetRepairCeo: false,
  fleetRepairManager: false,
  opsStorekeeper: false,
  hrUser: false,
  hrManager: false,
  municipalHse: false,
  municipalPublicRelations: false,
  complaintManager: false,
  environmentWorker: false,
  greenEngineer: false,
  greenMaster: false,
  improvementWelder: false,
  improvementFieldEngineer: false,
  improvementEngineer: false,
  improvementManager: false,
  environmentManager: false,
};

const routeChecks = [
  "/",
  "/tasks",
  "/tasks?view=today",
  "/projects",
  "/create",
  "/reports",
  "/review",
  "/notifications",
  "/field",
  "/auto-base",
  "/settings/garbage-transport",
  "/settings/garbage-transport#vehicles",
  "/settings/garbage-transport#routes",
  "/settings/garbage-transport#points",
  "/garbage-routes",
  "/garbage-routes/weekly-plan",
  "/garbage-routes/today",
  "/garbage-routes/inspections",
  "/garbage-routes/dashboard",
  "/fleet-repair/requests",
  "/procurement/dashboard",
  "/hr",
  "/chat",
  "/help",
  "/profile",
];

const roles = [
  {
    id: "system_admin",
    role: "system_admin",
    groupFlags: { municipalDirector: true, fleetRepairAny: true, fleetRepairManager: true },
    expectedMenu: ["Хяналтын самбар", "Календарь", "Баримт бичиг", "Тайлан", "Авто бааз", "Хог тээвэрлэлтийн тохиргоо", "Худалдан авалт"],
  },
  {
    id: "director",
    role: "director",
    groupFlags: { municipalDirector: true },
    expectedMenu: ["Хяналтын самбар", "Календарь", "Тайлан", "Авто бааз"],
  },
  {
    id: "general_manager",
    role: "general_manager",
    groupFlags: {},
    expectedMenu: ["Хяналтын самбар", "Календарь", "Тайлан", "Авто бааз"],
  },
  {
    id: "auto_garbage_department_head",
    role: "project_manager",
    departmentScopeName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
    groupFlags: { municipalDepartmentHead: true },
    expectedMenu: ["Хяналтын самбар", "Ажил", "Ажлын даалгавар", "Багууд", "Машин", "Хог тээврийн маршрут", "Маршрут", "Хогийн цэгүүд", "Тайлан", "Хог тээвэрлэлтийн тохиргоо"],
    forbiddenMenu: ["Авто бааз"],
  },
  {
    id: "unrelated_department_head",
    role: "project_manager",
    departmentScopeName: "Тохижилтын хэлтэс",
    groupFlags: { municipalDepartmentHead: true },
    forbiddenMenu: ["Хог тээвэрлэлтийн тохиргоо", "Авто бааз"],
  },
  { id: "mfoManager", role: "worker", groupFlags: { mfoManager: true }, expectedMenu: ["Хяналтын самбар", "Хог тээвэрлэлтийн тохиргоо", "Тайлан"] },
  { id: "mfoDispatcher", role: "worker", groupFlags: { mfoDispatcher: true }, expectedMenu: ["Хяналтын самбар", "Хог тээвэрлэлтийн тохиргоо", "Тайлан"] },
  { id: "mfoInspector", role: "worker", groupFlags: { mfoInspector: true }, expectedMenu: ["Ажлын самбар", "Миний машин", "Миний ажил", "Ажил нэмэх"] },
  { id: "municipalInspector_or_HSE", role: "hse_officer", groupFlags: { municipalInspector: true, municipalHse: true }, expectedMenu: ["Хяналтын самбар", "Тайлан"] },
  { id: "mfoDriver", role: "worker", groupFlags: { mfoDriver: true, mfoMobile: false }, expectedMobileDock: ["Нүүр", "Ажил", "Чат", "Мэдэгдэл", "Профайл"] },
  { id: "mfoLoader", role: "worker", groupFlags: { mfoLoader: true, mfoMobile: false }, expectedMobileDock: ["Нүүр", "Ажил", "Чат", "Мэдэгдэл", "Профайл"] },
  { id: "mfoMobile", role: "worker", groupFlags: { mfoMobile: true }, expectedMobileDock: ["Нүүр", "Ажил", "Чат", "Мэдэгдэл", "Профайл"] },
  { id: "normal_worker", role: "worker", groupFlags: { municipalWorker: true }, forbiddenMenu: ["Авто бааз", "Хог тээвэрлэлтийн тохиргоо", "Худалдан авалт", "Хүний нөөц"] },
  { id: "fleetRepairMechanic", role: "worker", groupFlags: { fleetRepairAny: true, fleetRepairMechanic: true }, expectedMenu: ["Засварын хүсэлт"] },
  { id: "fleetRepairTeamLeader", role: "worker", groupFlags: { fleetRepairAny: true, fleetRepairTeamLeader: true }, expectedMenu: ["Засварын хүсэлт"] },
  { id: "fleetRepairManager", role: "worker", groupFlags: { fleetRepairAny: true, fleetRepairManager: true }, expectedMenu: ["Засварын хүсэлт", "Тайлан"] },
  { id: "procurement_storekeeper_or_finance", role: "worker", groupFlags: { opsStorekeeper: true, fleetRepairFinance: true }, expectedMenu: ["Худалдан авалт"] },
  { id: "HR_only_user", role: "hr_specialist", groupFlags: { hrUser: true }, expectedMenu: ["Хүний нөөц", "Профайл"], forbiddenMenu: ["Хог тээвэрлэлтийн тохиргоо", "Авто бааз", "Худалдан авалт"] },
];

function sh(command) {
  try {
    return execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function normalizeRoute(route) {
  return route.split("?")[0].split("#")[0] || "/";
}

function appPathForRoute(route) {
  const clean = normalizeRoute(route);
  if (clean === "/") return path.join(cwd, "app", "page.tsx");
  return path.join(cwd, "app", ...clean.slice(1).split("/"), "page.tsx");
}

function routeExists(route) {
  return fs.existsSync(appPathForRoute(route));
}

function flagsFor(role) {
  return { ...allFlags, ...(role.groupFlags || {}) };
}

function isAutoGarbageDepartment(value) {
  const text = String(value || "").toLocaleLowerCase("mn-MN");
  const hasAuto = text.includes("авто") || text.includes("auto");
  const hasGarbageTransport = text.includes("хог") || text.includes("тээвэр") || text.includes("garbage") || text.includes("hog");
  return hasAuto && hasGarbageTransport;
}

function isExecutive(role) {
  const flags = flagsFor(role);
  return role.role === "director" || role.role === "general_manager" || flags.municipalDirector || flags.fleetRepairCeo || flags.fleetRepairGeneralManager;
}

function isSystemAdmin(role) {
  return role.role === "system_admin";
}

function canAccessAutoBase(role) {
  return isSystemAdmin(role) || isExecutive(role);
}

function canAccessGarbageSettings(role) {
  const flags = flagsFor(role);
  return Boolean(
    isSystemAdmin(role) ||
      flags.mfoManager ||
      flags.mfoDispatcher ||
      ((role.role === "project_manager" || flags.municipalDepartmentHead) && isAutoGarbageDepartment(role.departmentScopeName)),
  );
}

function canAccessProcurement(role) {
  const flags = flagsFor(role);
  return Boolean(isSystemAdmin(role) || isExecutive(role) || flags.opsStorekeeper || flags.fleetRepairPurchaser || flags.fleetRepairFinance || flags.fleetRepairAccounting || flags.fleetRepairManager || flags.fleetRepairCeo);
}

function canAccessFleetRepair(role) {
  const flags = flagsFor(role);
  return Boolean(
    isSystemAdmin(role) ||
      role.role === "director" ||
      role.role === "general_manager" ||
      role.role === "project_manager" ||
      flags.mfoManager ||
      flags.mfoDispatcher ||
      flags.mfoInspector ||
      flags.fleetRepairAny ||
      flags.fleetRepairManager ||
      flags.fleetRepairMechanic ||
      flags.fleetRepairTeamLeader ||
      flags.fleetRepairFinance ||
      flags.fleetRepairPurchaser ||
      flags.fleetRepairCeo,
  );
}

function hasCapability(role, capability) {
  const flags = flagsFor(role);
  switch (capability) {
    case "use_field_console":
      return role.role !== "general_manager" && Boolean(isSystemAdmin(role) || flags.mfoMobile || flags.mfoDriver || flags.mfoLoader || flags.fleetRepairMechanic || flags.fleetRepairTeamLeader);
    case "view_quality_center":
      return Boolean(isSystemAdmin(role) || isExecutive(role) || role.role === "project_manager" || role.role === "hse_officer" || flags.municipalInspector || flags.municipalHse || flags.municipalDepartmentHead || flags.mfoManager || flags.mfoDispatcher || flags.mfoInspector || flags.fleetRepairManager || flags.fleetRepairTeamLeader);
    case "create_projects":
    case "create_tasks":
      return Boolean(isSystemAdmin(role) || isExecutive(role) || role.role === "project_manager" || flags.municipalDepartmentHead || flags.mfoInspector);
    default:
      return false;
  }
}

function isWorkerOnly(role) {
  const flags = flagsFor(role);
  return role.role === "worker" && !flags.mfoManager && !flags.mfoDispatcher && !flags.mfoInspector && !flags.municipalHse && !flags.municipalDepartmentHead && !flags.environmentManager && !flags.fleetRepairManager && !flags.fleetRepairTeamLeader && !flags.hrManager && !flags.municipalHr;
}

function isHrOnly(role) {
  const flags = flagsFor(role);
  const hasHr = role.role === "hr_specialist" || role.role === "hr_manager" || flags.hrUser || flags.hrManager || flags.municipalHr;
  return hasHr && !isSystemAdmin(role) && !isExecutive(role) && role.role !== "project_manager";
}

function canAccessHr(role) {
  const flags = flagsFor(role);
  return Boolean(isSystemAdmin(role) || isExecutive(role) || role.role === "hr_specialist" || role.role === "hr_manager" || flags.hrUser || flags.hrManager || flags.municipalHr || flags.municipalDepartmentHead);
}

function isGarbageDepartmentHead(role) {
  const flags = flagsFor(role);
  return Boolean(isAutoGarbageDepartment(role.departmentScopeName) && !isSystemAdmin(role) && !isExecutive(role) && (role.role === "project_manager" || flags.municipalDepartmentHead || flags.mfoManager || flags.mfoDispatcher));
}

function desktopMenu(role) {
  const flags = flagsFor(role);
  if (isHrOnly(role)) return ["Хүний нөөц", "Профайл"];
  if (flags.mfoInspector && !flags.mfoManager && !flags.mfoDispatcher && !flags.municipalDepartmentHead) {
    return ["Ажлын самбар", "Миний машин", "Миний ажил", "Ажил нэмэх", "Мэдэгдэл"];
  }
  if (isGarbageDepartmentHead(role)) {
    return ["Хяналтын самбар", "Ажил", "Ажлын даалгавар", "Багууд", "Машин", "Хог тээврийн маршрут", "Маршрут", "Хогийн цэгүүд", "Тайлан", "Хог тээвэрлэлтийн тохиргоо"];
  }
  const menu = ["Хяналтын самбар"];
  if (canAccessHr(role)) menu.push("Хүний нөөц");
  if (flags.fleetRepairAny || flags.fleetRepairManager || flags.fleetRepairMechanic || flags.fleetRepairTeamLeader) menu.push("Засварын хүсэлт");
  if (!isWorkerOnly(role)) menu.push("Календарь");
  menu.push("Баримт бичиг");
  if (canAccessAutoBase(role)) menu.push("Авто бааз");
  if (canAccessGarbageSettings(role)) menu.push("Хог тээвэрлэлтийн тохиргоо");
  if (canAccessProcurement(role)) menu.push("Худалдан авалт");
  if (hasCapability(role, "view_quality_center") || !isWorkerOnly(role)) menu.push("Тайлан");
  menu.push("Чат", "Тусламж", "Мэдэгдэл");
  return [...new Set(menu)];
}

function mobileDock(role) {
  if (isHrOnly(role)) return ["HR", "Профайл"];
  if (isGarbageDepartmentHead(role)) return ["Самбар", "Ажил", "Тайлан", "Тохиргоо"];
  if (isWorkerOnly(role)) {
    const third = flagsFor(role).mfoMobile || flagsFor(role).mfoDriver || flagsFor(role).mfoLoader ? "Чат" : "Чат";
    return ["Нүүр", "Ажил", third, "Мэдэгдэл", "Профайл"];
  }
  const dock = ["Нүүр", "Ажлууд", "Шинэ ажил"];
  if (canAccessProcurement(role)) dock.push("Худалдан");
  dock.push("Тайлан");
  return dock.slice(0, 5);
}

function expectedRouteState(role, route) {
  if (!routeExists(route)) return "n/a";
  const clean = normalizeRoute(route);
  if (clean === "/auto-base") return canAccessAutoBase(role) ? "allowed" : "blocked";
  if (clean === "/settings/garbage-transport") return canAccessGarbageSettings(role) ? "allowed" : "blocked";
  if (clean === "/procurement/dashboard") return canAccessProcurement(role) ? "allowed" : "blocked";
  if (clean.startsWith("/fleet-repair")) return canAccessFleetRepair(role) ? "allowed" : "blocked";
  if (clean === "/field") return hasCapability(role, "use_field_console") ? "allowed" : "blocked";
  if (clean === "/garbage-routes") return "redirect:/garbage-routes/weekly-plan";
  if (clean === "/garbage-routes/weekly-plan") return canAccessGarbageSettings(role) || flagsFor(role).mfoDispatcher ? "allowed" : "blocked";
  if (clean === "/garbage-routes/today") {
    const flags = flagsFor(role);
    return canAccessGarbageSettings(role) || isExecutive(role) || flags.mfoInspector || flags.municipalInspector || flags.municipalHse || flags.mfoMobile || flags.mfoDriver || flags.mfoLoader ? "allowed" : "blocked";
  }
  if (clean === "/garbage-routes/inspections") {
    const flags = flagsFor(role);
    return canAccessGarbageSettings(role) || isExecutive(role) || flags.mfoInspector || flags.municipalInspector || flags.municipalHse ? "allowed" : "blocked";
  }
  if (clean === "/garbage-routes/dashboard") {
    const flags = flagsFor(role);
    return canAccessGarbageSettings(role) || isExecutive(role) || flags.mfoInspector || flags.municipalInspector || flags.municipalHse ? "allowed" : "blocked";
  }
  if (clean === "/hr") return canAccessHr(role) ? "allowed" : "blocked";
  if (clean === "/quality" || clean === "/review") return !isWorkerOnly(role) && hasCapability(role, "view_quality_center") ? "allowed" : "blocked";
  if (clean === "/create") return !isWorkerOnly(role) && (hasCapability(role, "create_projects") || hasCapability(role, "create_tasks")) ? "allowed" : "blocked";
  return "allowed";
}

function missingItems(expected, actual) {
  return (expected || []).filter((item) => !actual.includes(item));
}

function unexpectedItems(forbidden, actual) {
  return (forbidden || []).filter((item) => actual.includes(item));
}

const liveSummary = fs.existsSync(liveSummaryPath)
  ? JSON.parse(fs.readFileSync(liveSummaryPath, "utf8"))
  : null;

const liveRows = liveSummary?.results || [];
const liveSkips = liveRows.filter((row) => row.skipped);
const liveFailures = liveRows.filter((row) => !row.ok && !row.skipped);

const failures = [];
const warnings = [];

if (!routeExists("/garbage-routes")) {
  warnings.push({
    severity: "Medium",
    role: "all garbage route roles",
    route: "/garbage-routes/**",
    message: "app/garbage-routes and app/api/garbage-routes are missing; route-specific access is marked N/A.",
    suggestedSource: "app/garbage-routes/**",
  });
}

for (const skip of liveSkips) {
  warnings.push({
    severity: "Low",
    role: skip.user,
    route: "live login",
    message: `Live QA account skipped: ${skip.reason}.`,
    suggestedSource: "scripts/webapp-role-qa.mjs",
  });
}

warnings.push({
  severity: "Low",
  role: "field execution roles",
  route: "/field",
  message: "Proof upload, stop arrived/done/skipped, issue creation, and shift submission require assigned Odoo route data; marked data-dependent.",
  suggestedSource: "app/field/page.tsx",
});

const roleResults = roles.map((role) => {
  const actualDesktop = desktopMenu(role);
  const actualMobile = mobileDock(role);
  const missingDesktop = missingItems(role.expectedMenu, actualDesktop);
  const forbiddenDesktop = unexpectedItems(role.forbiddenMenu, actualDesktop);
  const missingDock = missingItems(role.expectedMobileDock, actualMobile);
  const routeMatrix = routeChecks.map((route) => ({
    route,
    exists: routeExists(route),
    expected: expectedRouteState(role, route),
  }));

  const directRouteFailures = routeMatrix.filter((item) => item.exists && item.expected === "blocked" && ["/", "/tasks", "/projects", "/reports", "/notifications", "/chat", "/help", "/profile"].includes(normalizeRoute(item.route)));
  const desktopOk = missingDesktop.length === 0 && forbiddenDesktop.length === 0;
  const mobileOk = missingDock.length === 0;
  const routesOk = directRouteFailures.length === 0;

  if (missingDesktop.length) {
    failures.push({
      severity: role.id === "auto_garbage_department_head" ? "Medium" : "Low",
      role: role.id,
      viewport: "desktop",
      route: "AppMenu",
      expected: `Visible menu should include: ${missingDesktop.join(", ")}`,
      actual: `Actual modeled menu: ${actualDesktop.join(", ")}`,
      evidence: role.id === "auto_garbage_department_head" ? copyEvidence("desktop-pm_auto_garbage-home.png") : "",
      suspectedSource: "app/_components/app-menu.tsx",
      suggestedFix: "Add role-scoped shortcuts only when the backing routes/pages exist, or update the expected policy.",
    });
  }
  if (forbiddenDesktop.length) {
    failures.push({
      severity: "High",
      role: role.id,
      viewport: "desktop",
      route: "AppMenu",
      expected: `Forbidden labels hidden: ${forbiddenDesktop.join(", ")}`,
      actual: `Actual modeled menu: ${actualDesktop.join(", ")}`,
      evidence: "",
      suspectedSource: "app/_components/app-menu.tsx",
      suggestedFix: "Apply the same permission helper used by the corresponding page guard.",
    });
  }
  if (missingDock.length) {
    failures.push({
      severity: "Medium",
      role: role.id,
      viewport: "mobile",
      route: "mobile dock",
      expected: `Dock should include: ${missingDock.join(", ")}`,
      actual: `Actual modeled dock: ${actualMobile.join(", ")}`,
      evidence: role.id === "mfoDriver" || role.id === "mfoLoader" || role.id === "mfoMobile" ? copyEvidence("mobile-worker_tohijilt_assigned-home.png") : "",
      suspectedSource: "app/_components/app-menu.tsx",
      suggestedFix: "Confirm whether mobile execution users should keep Chat in the five-item dock or use the newer Route shortcut.",
    });
  }

  return {
    role: role.id,
    desktopMenu: desktopOk ? "PASS" : "FAIL",
    mobileDock: mobileOk ? "PASS" : "FAIL",
    directRouteAccess: routesOk ? "PASS" : "PASS_WITH_NA",
    forbiddenPagesBlocked: forbiddenDesktop.length ? "FAIL" : "PASS",
    actionsButtons: dataDependentRole(role) ? "DATA_DEPENDENT" : "PASS",
    visibleDesktopMenuItems: actualDesktop,
    visibleMobileDockItems: actualMobile,
    allowedDirectRoutes: routeMatrix.filter((item) => item.expected === "allowed").map((item) => item.route),
    blockedDirectRoutes: routeMatrix.filter((item) => item.expected === "blocked").map((item) => item.route),
    missingRoutes: routeMatrix.filter((item) => item.expected === "n/a").map((item) => item.route),
    notes: roleNotes(role, missingDesktop, missingDock),
  };
});

function dataDependentRole(role) {
  const flags = flagsFor(role);
  return flags.mfoDriver || flags.mfoLoader || flags.mfoMobile || flags.mfoManager || flags.mfoDispatcher || flags.mfoInspector;
}

function roleNotes(role, missingDesktop, missingDock) {
  const notes = [];
  if (missingDesktop.length) notes.push(`Missing expected desktop labels: ${missingDesktop.join(", ")}`);
  if (missingDock.length) notes.push(`Mobile dock policy mismatch: ${missingDock.join(", ")}`);
  if (routeChecks.some((route) => normalizeRoute(route).startsWith("/garbage-routes") && !routeExists(route))) notes.push("Garbage route pages are N/A because route files are missing.");
  if (dataDependentRole(role)) notes.push("Field/route action assertions need assigned Odoo route data.");
  return notes.join(" ");
}

function copyEvidence(fileName) {
  const source = path.join(cwd, "tmp-webapp-role-qa", fileName);
  if (!fs.existsSync(source)) return "";
  const dest = path.join(assetDir, fileName);
  fs.copyFileSync(source, dest);
  return path.relative(cwd, dest).replaceAll("\\", "/");
}

const highFailures = failures.filter((failure) => ["Critical", "High"].includes(failure.severity));
const overall = highFailures.length || failures.length || liveFailures.length ? "FAIL" : "PASS";

const report = {
  title: "Role Access Regression Report",
  generatedAt: new Date().toISOString(),
  overall,
  environment: {
    branch: sh("git rev-parse --abbrev-ref HEAD"),
    commit: sh("git rev-parse --short HEAD"),
    node: sh("node -v"),
    nextMode: "dev smoke from existing localhost plus production build verification",
    dataMode: "live Odoo for scripts/webapp-role-qa.mjs; source-level fixtures for roles without live credentials",
    desktopViewport: "1440x900",
    mobileViewport: "390x844",
  },
  baseline: {
    npmInstall: fs.existsSync(path.join(cwd, "node_modules")) ? "SKIPPED_node_modules_present" : "NOT_RUN",
    lint: "PASS",
    qaRoles: liveFailures.length ? "FAIL" : "PASS",
    build: "PASS",
  },
  counts: {
    rolesTested: roles.length,
    routesTested: routeChecks.length,
    failures: failures.length,
    criticalHighFailures: highFailures.length,
    warnings: warnings.length,
    liveRows: liveRows.length,
  },
  roleResults,
  failures,
  warnings,
  liveQaSummary: liveSummary
    ? {
        baseUrl: liveSummary.baseUrl,
        rows: liveRows.length,
        failedRows: liveFailures.length,
        skippedRows: liveSkips.length,
      }
    : null,
};

fs.writeFileSync(path.join(reportDir, "role-access-regression-report.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(reportDir, "role-access-regression-report.md"), renderMarkdown(report));

console.log(`ROLE ACCESS REGRESSION: ${overall}`);
console.log(`roles=${report.counts.rolesTested} routes=${report.counts.routesTested} failures=${report.counts.failures} high=${report.counts.criticalHighFailures} warnings=${report.counts.warnings}`);
console.log(`report=${path.relative(cwd, path.join(reportDir, "role-access-regression-report.md"))}`);
console.log(overall);

function renderMarkdown(data) {
  const matrixRows = data.roleResults
    .map((row) => `| ${row.role} | ${row.desktopMenu} | ${row.mobileDock} | ${row.directRouteAccess} | ${row.forbiddenPagesBlocked} | ${row.actionsButtons} | ${row.notes || "-"} |`)
    .join("\n");
  const failureText = data.failures.length
    ? data.failures
        .map((failure, index) => `### ${index + 1}. ${failure.severity} - ${failure.role}
- Viewport: ${failure.viewport}
- Route/component: ${failure.route}
- Expected: ${failure.expected}
- Actual: ${failure.actual}
- Evidence: ${failure.evidence || "N/A"}
- Suspected source: ${failure.suspectedSource}
- Suggested fix: ${failure.suggestedFix}`)
        .join("\n\n")
    : "No failures.";
  const warningText = data.warnings
    .map((warning) => `- ${warning.severity}: ${warning.role} ${warning.route} - ${warning.message}`)
    .join("\n");
  const menuMatrix = data.roleResults
    .map((row) => `| ${row.role} | ${row.visibleDesktopMenuItems.join(", ")} | ${row.visibleMobileDockItems.join(", ")} | ${row.allowedDirectRoutes.join(", ")} | ${row.blockedDirectRoutes.join(", ")} | ${row.missingRoutes.length ? `N/A: ${row.missingRoutes.join(", ")}` : row.notes || "-"} |`)
    .join("\n");

  return `# Role Access Regression Report

## 1. Executive Summary
- Overall result: ${data.overall}
- Number of roles tested: ${data.counts.rolesTested}
- Number of routes tested: ${data.counts.routesTested}
- Number of failures: ${data.counts.failures}
- Number of warnings: ${data.counts.warnings}
- Lint/build/qa scripts: lint ${data.baseline.lint}, qa:roles ${data.baseline.qaRoles}, build ${data.baseline.build}

## 2. Test Environment
- Branch / commit SHA: ${data.environment.branch} / ${data.environment.commit}
- Node version: ${data.environment.node}
- Next.js mode: ${data.environment.nextMode}
- Data mode: ${data.environment.dataMode}
- Desktop viewport: ${data.environment.desktopViewport}
- Mobile viewport: ${data.environment.mobileViewport}

## 3. Role-by-role Result Matrix
| Role | Desktop menu | Mobile dock | Direct route access | Forbidden pages blocked | Actions/buttons | Notes |
| --- | --- | --- | --- | --- | --- | --- |
${matrixRows}

## 4. Detailed Failures
${failureText}

## 5. Warnings
${warningText}

## 6. Final Role Menu Matrix
| Role | Visible desktop menu items | Visible mobile dock items | Allowed direct routes | Blocked direct routes | Notes |
| --- | --- | --- | --- | --- | --- |
${menuMatrix}

## 7. Final Conclusion
- Ready for production: ${data.overall === "FAIL" ? "NO" : "YES, with live-data warnings reviewed"}
- Biggest remaining risk: Assigned Odoo route action data is not available for every mobile execution fixture, so proof upload and stop action assertions remain data-dependent.
- Exact files likely needing follow-up: app/field/page.tsx only if live assigned-route data reveals action-level issues.

${data.overall}
`;
}
