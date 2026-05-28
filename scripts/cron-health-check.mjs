import fs from "node:fs";
import path from "node:path";

const ODOO_URL = process.env.ODOO_URL || "http://localhost:8069";
const ODOO_DB = process.env.ODOO_DB || "odoo19_admin";
const ODOO_LOGIN = process.env.ODOO_LOGIN || "admin";
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || "admin";
const ODOO_CONFIG_PATH =
  process.env.ODOO_CONFIG_PATH || "C:\\Program Files\\Odoo 19.0.20260415\\server\\odoo.conf";
const REPAIR = process.argv.includes("--repair");
const TRIGGER = process.argv.includes("--trigger");

const HR_EMPLOYEE_CODE_FALLBACK_CODE = [
  "employee_model = env['hr.employee'].sudo()",
  "if 'x_mn_employee_code' in employee_model._fields:",
  "    employees = employee_model.with_context(active_test=False).search([('x_mn_employee_code', '=', False)])",
  "    sequence = env['ir.sequence'].sudo()",
  "    for employee in employees:",
  "        employee.write({'x_mn_employee_code': sequence.next_by_code('hr.custom.mn.employee') or ('EMP-%05d' % employee.id)})",
].join("\n");

const JOBS = [
  {
    module: "hr_custom_mn",
    name: "ir_cron_hr_custom_mn_backfill_employee_codes",
    label: "HR employee code backfill",
    cronName: "HR MN: ажилтны код нөхөх",
    model: "hr.employee",
    code: "model.cron_hr_custom_mn_refresh_employee_codes()",
    fallbackCode: HR_EMPLOYEE_CODE_FALLBACK_CODE,
    intervalNumber: 1,
    intervalType: "days",
  },
  {
    module: "municipal_repair_workflow",
    name: "ir_cron_auto_base_deadline_reminders",
    label: "Auto-base deadline reminders",
    cronName: "Авто бааз - даатгал, улсын үзлэгийн сануулга",
    model: "fleet.vehicle",
    code: "model._cron_send_deadline_reminders()",
    intervalNumber: 1,
    intervalType: "days",
  },
  {
    module: "municipal_repair_workflow",
    name: "ir_cron_garbage_weight_fetch",
    label: "Garbage weight import retry runner",
    cronName: "Авто бааз - хог ачилтын жин татах",
    model: "municipal.garbage.sync.log",
    code: "model._cron_fetch_weight_reports()",
    intervalNumber: 1,
    intervalType: "hours",
  },
  {
    module: "municipal_repair_workflow",
    name: "ir_cron_garbage_fuel_fetch",
    label: "Garbage fuel import retry runner",
    cronName: "Авто бааз - шатахууны мэдээлэл татах",
    model: "municipal.garbage.sync.log",
    code: "model._cron_fetch_fuel_reports()",
    intervalNumber: 1,
    intervalType: "hours",
  },
];

async function jsonRpc(service, method, args) {
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
  });
  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.data?.message || payload.error.message || "Odoo JSON-RPC failed");
  }
  return payload.result;
}

async function executeKw(uid, model, method, args, kwargs = {}) {
  return jsonRpc("object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs]);
}

function sameCronConfig(cron, job, modelId) {
  const acceptedCodes = [job.code, job.fallbackCode].filter(Boolean);
  return (
    Boolean(cron.active) &&
    cron.interval_number === job.intervalNumber &&
    cron.interval_type === job.intervalType &&
    acceptedCodes.includes(cron.code) &&
    Array.isArray(cron.model_id) &&
    cron.model_id[0] === modelId
  );
}

function expectedCodeMatches(cron, job) {
  const acceptedCodes = [job.code, job.fallbackCode].filter(Boolean);
  return acceptedCodes.includes(cron?.code);
}

function parseOdooDatetime(value) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNextcallStale(cron, job) {
  if (!cron?.active) {
    return false;
  }
  const nextcall = parseOdooDatetime(cron.nextcall);
  if (!nextcall) {
    return true;
  }
  const now = Date.now();
  const graceMs = job.intervalType === "hours" ? 3 * 60 * 60 * 1000 : 36 * 60 * 60 * 1000;
  return nextcall < now - graceMs;
}

function cronTriggerFailed(result) {
  return result?.tag === "display_exception" || result?.params?.tag === "display_exception";
}

function normalizeFilesystemPath(value) {
  return path.resolve(value).toLowerCase();
}

function readAddonsPathHealth() {
  const workspaceAddonsPath = normalizeFilesystemPath(path.join(process.cwd(), "odoo_addons"));
  if (!fs.existsSync(ODOO_CONFIG_PATH)) {
    return {
      configPath: ODOO_CONFIG_PATH,
      configFound: false,
      workspaceAddonsPath,
      addonsPaths: [],
      includesWorkspaceAddons: false,
    };
  }

  const config = fs.readFileSync(ODOO_CONFIG_PATH, "utf8");
  const line = config
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith("addons_path"));
  const addonsPaths = line
    ? line
        .split("=")
        .slice(1)
        .join("=")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const normalizedAddonsPaths = addonsPaths.map(normalizeFilesystemPath);
  return {
    configPath: ODOO_CONFIG_PATH,
    configFound: true,
    workspaceAddonsPath,
    addonsPaths,
    includesWorkspaceAddons: normalizedAddonsPaths.includes(workspaceAddonsPath),
  };
}

async function main() {
  const uid = await jsonRpc("common", "authenticate", [ODOO_DB, ODOO_LOGIN, ODOO_PASSWORD, {}]);
  if (!uid) {
    throw new Error("Odoo authentication failed");
  }

  const modelNames = [...new Set(JOBS.map((job) => job.model))];
  const models = await executeKw(
    uid,
    "ir.model",
    "search_read",
    [[["model", "in", modelNames]]],
    { fields: ["model", "name"], limit: modelNames.length },
  );
  const modelByName = new Map(models.map((model) => [model.model, model]));

  const xmlIds = await executeKw(
    uid,
    "ir.model.data",
    "search_read",
    [[["module", "in", [...new Set(JOBS.map((job) => job.module))]], ["name", "in", JOBS.map((job) => job.name)]]],
    { fields: ["module", "name", "model", "res_id"], limit: JOBS.length },
  );
  const xmlIdByKey = new Map(xmlIds.map((record) => [`${record.module}.${record.name}`, record]));
  const cronIds = xmlIds.filter((record) => record.model === "ir.cron").map((record) => record.res_id);
  const crons = cronIds.length
    ? await executeKw(
        uid,
        "ir.cron",
        "read",
        [cronIds],
        {
          fields: [
            "name",
            "active",
            "model_id",
            "interval_number",
            "interval_type",
            "nextcall",
            "lastcall",
            "code",
            "user_id",
          ],
        },
      )
    : [];
  const cronById = new Map(crons.map((cron) => [cron.id, cron]));

  const addonsPathHealth = readAddonsPathHealth();
  const results = [];
  for (const job of JOBS) {
    const key = `${job.module}.${job.name}`;
    const model = modelByName.get(job.model);
    const xmlId = xmlIdByKey.get(key);
    const cron = xmlId && xmlId.model === "ir.cron" ? cronById.get(xmlId.res_id) : null;
    let repaired = false;
    let trigger = null;

    if (REPAIR && model) {
      const canUseWorkspaceCode = addonsPathHealth.includesWorkspaceAddons;
      const canUseFallbackCode = Boolean(job.fallbackCode);
      const shouldRepair = canUseWorkspaceCode || canUseFallbackCode;
      if (!shouldRepair) {
        results.push({
          id: key,
          label: job.label,
          model: job.model,
          modelExists: Boolean(model),
          cronExists: Boolean(cron),
          active: Boolean(cron?.active),
          interval: cron ? `${cron.interval_number} ${cron.interval_type}` : "",
          expectedInterval: `${job.intervalNumber} ${job.intervalType}`,
          codeMatches: expectedCodeMatches(cron, job),
          nextcall: cron?.nextcall || "",
          nextcallStale: isNextcallStale(cron, job),
          lastcall: cron?.lastcall || "",
          user: Array.isArray(cron?.user_id) ? cron.user_id[1] : "",
          repaired,
          trigger,
          repairSkipped: "workspace-addons-path-missing",
        });
        continue;
      }
      const values = {
        name: job.cronName,
        model_id: model.id,
        state: "code",
        code: canUseWorkspaceCode ? job.code : job.fallbackCode,
        interval_number: job.intervalNumber,
        interval_type: job.intervalType,
        active: true,
        user_id: 1,
      };
      if (cron) {
        if (!sameCronConfig(cron, job, model.id)) {
          await executeKw(uid, "ir.cron", "write", [[cron.id], values]);
          repaired = true;
        }
      } else {
        const cronId = await executeKw(uid, "ir.cron", "create", [values]);
        await executeKw(uid, "ir.model.data", "create", [
          {
            module: job.module,
            name: job.name,
            model: "ir.cron",
            res_id: cronId,
            noupdate: true,
          },
        ]);
        repaired = true;
      }
    }

    if (TRIGGER && cron?.active) {
      const startedAt = Date.now();
      try {
        const triggerResult = await executeKw(uid, "ir.cron", "method_direct_trigger", [[cron.id]]);
        trigger = {
          ok: !cronTriggerFailed(triggerResult),
          ms: Date.now() - startedAt,
          resultTag: triggerResult?.tag || "",
          error:
            triggerResult?.params?.data?.debug ||
            triggerResult?.params?.data?.message ||
            triggerResult?.params?.message ||
            "",
        };
      } catch (error) {
        trigger = { ok: false, ms: Date.now() - startedAt, error: error.message };
      }
    }

    const nextcallStale = isNextcallStale(cron, job);
    results.push({
      id: key,
      label: job.label,
      model: job.model,
      modelExists: Boolean(model),
      cronExists: Boolean(cron),
      active: Boolean(cron?.active),
      interval: cron ? `${cron.interval_number} ${cron.interval_type}` : "",
      expectedInterval: `${job.intervalNumber} ${job.intervalType}`,
      codeMatches: expectedCodeMatches(cron, job),
      codeMode:
        job.fallbackCode && cron?.code === job.fallbackCode
          ? "fallback"
          : cron?.code === job.code
            ? "model-method"
            : "unknown",
      nextcall: cron?.nextcall || "",
      nextcallStale,
      lastcall: cron?.lastcall || "",
      user: Array.isArray(cron?.user_id) ? cron.user_id[1] : "",
      repaired,
      trigger,
    });
  }

  const failing = results.filter(
    (result) =>
      !result.modelExists ||
      !result.cronExists ||
      !result.active ||
      result.interval !== result.expectedInterval ||
      !result.codeMatches ||
      result.nextcallStale ||
      result.trigger?.ok === false,
  );

  const ok = failing.length === 0 && addonsPathHealth.includesWorkspaceAddons;
  console.log(JSON.stringify({ ok, repaired: REPAIR, addonsPathHealth, results }, null, 2));
  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
