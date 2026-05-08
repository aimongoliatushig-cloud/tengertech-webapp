import "server-only";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { AppSession } from "@/lib/auth";

const execFileAsync = promisify(execFile);
const REPORT_PATH = path.join(process.cwd(), ".codex", "project-tracker", "latest.json");
const STALE_AFTER_MS = 5 * 60_000;

export type ProjectTrackerStatus = "missing" | "partial" | "mostly_done" | "done";

export type ProjectTrackerEvidence = {
  kind: string;
  path: string;
  reason: string;
};

export type ProjectTrackerSignal = {
  label: string;
  weight: number;
  evidence: ProjectTrackerEvidence[];
  missing: string;
};

export type ProjectTrackerModule = {
  key: string;
  title: string;
  department: string;
  summary: string;
  overallPercent: number;
  implementationPercent: number;
  roleActionPercent: number;
  testingPercent: number;
  status: ProjectTrackerStatus;
  evidenceCount: number;
  evidenceRefs: ProjectTrackerEvidence[];
  missingSignals: string[];
  implementation: ProjectTrackerSignal[];
  roleActions: ProjectTrackerSignal[];
  testing: ProjectTrackerSignal[];
};

export type ProjectTrackerReport = {
  generatedAt: string;
  source: string;
  prdPath: string;
  overallPercent: number;
  implementationPercent: number;
  roleActionPercent: number;
  testingPercent: number;
  modules: ProjectTrackerModule[];
  warnings: string[];
  outOfScope: string[];
};

function isProjectTrackerReport(value: unknown): value is ProjectTrackerReport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const report = value as Partial<ProjectTrackerReport>;
  return (
    typeof report.generatedAt === "string" &&
    typeof report.overallPercent === "number" &&
    Array.isArray(report.modules)
  );
}

async function readReportFile() {
  const raw = await fs.readFile(REPORT_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isProjectTrackerReport(parsed)) {
    throw new Error("PROJECT_TRACKER_REPORT_INVALID");
  }
  return parsed;
}

async function isReportFresh() {
  try {
    const stat = await fs.stat(REPORT_PATH);
    return Date.now() - stat.mtimeMs < STALE_AFTER_MS;
  } catch {
    return false;
  }
}

export async function refreshProjectTrackerReport() {
  await execFileAsync("node", ["scripts/project-scan.mjs", "--silent"], {
    cwd: process.cwd(),
    windowsHide: true,
    timeout: 60_000,
  });
  return readReportFile();
}

export async function loadProjectTrackerReport(options: { forceRefresh?: boolean } = {}) {
  if (options.forceRefresh || !(await isReportFresh())) {
    try {
      return await refreshProjectTrackerReport();
    } catch (error) {
      console.warn("Project tracker scan could not be refreshed:", error);
    }
  }

  return readReportFile();
}

export function canAccessProjectTracker(session: AppSession) {
  const flags = session.groupFlags;
  return Boolean(
    session.role === "system_admin" ||
      session.role === "director" ||
      session.role === "general_manager" ||
      session.role === "project_manager" ||
      flags?.municipalDirector ||
      flags?.municipalManager ||
      flags?.municipalDepartmentHead ||
      flags?.fleetRepairCeo ||
      flags?.fleetRepairGeneralManager ||
      flags?.fleetRepairManager ||
      flags?.hrManager ||
      flags?.municipalHr,
  );
}
