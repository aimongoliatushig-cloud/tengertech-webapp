import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const writeMode =
  process.env.MUTATION_QA_WRITE === "1" &&
  process.env.MUTATION_QA_CONFIRM === "CREATE_AND_CLEANUP";

loadEnvFile(".env");
loadEnvFile(".env.local");

const connection = {
  url: (process.env.ODOO_URL || "http://localhost:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: process.env.ODOO_LOGIN || "admin",
  password: process.env.ODOO_PASSWORD || "admin",
};

const requiredModels = [
  {
    model: "project.project",
    label: "Ажил",
    fields: ["name"],
    requiredRights: ["read", "create", "write", "unlink"],
  },
  {
    model: "project.task",
    label: "Даалгавар",
    fields: ["name", "project_id", "user_ids", "date_deadline"],
    requiredRights: ["read", "create", "write", "unlink"],
  },
  {
    model: "mfo.crew.team",
    label: "Баг",
    fields: ["name"],
    optionalFields: [
      "active",
      "operation_type",
      "member_user_ids",
      "user_ids",
      "member_employee_ids",
      "employee_ids",
    ],
    requiredRights: ["read", "create", "write", "unlink"],
  },
  {
    model: "mfo.subdistrict",
    label: "Хороо",
    fields: ["name"],
    optionalFields: ["active", "district_id"],
    requiredRights: ["read", "create", "write", "unlink"],
  },
  {
    model: "mfo.collection.point",
    label: "Хогийн цэг",
    fields: ["name"],
    optionalFields: [
      "active",
      "subdistrict_id",
      "district_id",
      "operation_type",
      "point_type",
    ],
    requiredRights: ["read", "create", "write", "unlink"],
  },
  {
    model: "ops.work.unit",
    label: "Хэмжих нэгж",
    fields: ["name"],
    optionalFields: ["code", "category", "active"],
    requiredRights: ["read", "create", "write", "unlink"],
  },
];

const startedAt = Date.now();
const uid = await authenticate();
if (!uid) {
  fail("Odoo authenticate failed. ODOO_LOGIN/ODOO_PASSWORD шалгана уу.");
}

const checks = [];
for (const spec of requiredModels) {
  checks.push(await checkModel(spec));
}

let writeResult = null;
if (writeMode) {
  writeResult = await runCreateAndCleanup();
}

const failures = checks.flatMap((check) => check.errors.map((error) => `${check.model}: ${error}`));
if (writeResult?.errors?.length) {
  failures.push(...writeResult.errors.map((error) => `write-mode: ${error}`));
}

const summary = {
  ok: failures.length === 0,
  mode: writeMode ? "create-and-cleanup" : "preflight",
  elapsedMs: Date.now() - startedAt,
  odoo: {
    url: connection.url,
    db: connection.db,
    login: connection.login,
    uid,
  },
  checks,
  writeResult,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  process.exitCode = 1;
}

function loadEnvFile(fileName) {
  const filePath = path.join(cwd, fileName);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function jsonRpc(service, method, args) {
  const response = await fetch(`${connection.url}/jsonrpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: `${service}-${method}-${Date.now()}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.data?.message || payload.error.message || "Unknown Odoo error");
  }
  return payload.result;
}

async function authenticate() {
  return jsonRpc("common", "authenticate", [
    connection.db,
    connection.login,
    connection.password,
    {},
  ]);
}

async function executeKw(model, method, args = [], kwargs = {}) {
  return jsonRpc("object", "execute_kw", [
    connection.db,
    uid,
    connection.password,
    model,
    method,
    args,
    kwargs,
  ]);
}

async function checkModel(spec) {
  const errors = [];
  const rights = {};
  let fields = {};
  try {
    fields = await executeKw(spec.model, "fields_get", [], {
      attributes: ["type", "readonly", "required", "selection"],
    });
  } catch (error) {
    errors.push(`fields_get failed: ${error.message}`);
  }

  for (const right of spec.requiredRights) {
    try {
      rights[right] = Boolean(
        await executeKw(spec.model, "check_access_rights", [right], {
          raise_exception: false,
        }),
      );
      if (!rights[right]) {
        errors.push(`${right} access missing`);
      }
    } catch (error) {
      rights[right] = false;
      errors.push(`${right} access check failed: ${error.message}`);
    }
  }

  const missingFields = spec.fields.filter((field) => !fields[field]);
  if (missingFields.length) {
    errors.push(`required fields missing: ${missingFields.join(", ")}`);
  }

  const optionalPresent = Object.fromEntries(
    (spec.optionalFields || []).map((field) => [field, Boolean(fields[field])]),
  );

  return {
    label: spec.label,
    model: spec.model,
    ok: errors.length === 0,
    rights,
    requiredFields: spec.fields,
    optionalPresent,
    errors,
  };
}

function recoverableFieldName(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.match(/Invalid field '([^']+)'/)?.[1] ||
    message.match(/Unknown field '([^']+)'/)?.[1] ||
    message.match(/Wrong value for [\w.]+\.([A-Za-z_][\w]*):/)?.[1] ||
    message.match(/Wrong value for ([A-Za-z_][\w]*):/)?.[1] ||
    null
  );
}

async function createWithFallback(model, values, requiredFields = ["name"]) {
  const remaining = { ...values };
  const required = new Set(requiredFields);
  for (;;) {
    try {
      return await executeKw(model, "create", [remaining]);
    } catch (error) {
      const fieldName = recoverableFieldName(error);
      if (!fieldName || required.has(fieldName) || !(fieldName in remaining)) {
        throw error;
      }
      delete remaining[fieldName];
    }
  }
}

async function unlinkQuietly(model, id) {
  if (!id) {
    return;
  }
  try {
    await executeKw(model, "unlink", [[id]]);
  } catch (error) {
    return error.message;
  }
}

async function runCreateAndCleanup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const created = [];
  const errors = [];
  try {
    const subdistrictId = await createWithFallback("mfo.subdistrict", {
      name: `QA Codex хороо ${stamp}`,
      active: true,
    });
    created.push(["mfo.subdistrict", subdistrictId]);

    const collectionPointId = await createWithFallback("mfo.collection.point", {
      name: `QA Codex цэг ${stamp}`,
      active: true,
      subdistrict_id: subdistrictId,
      operation_type: "garbage",
      point_type: "container",
    });
    created.push(["mfo.collection.point", collectionPointId]);

    const unitId = await createWithFallback("ops.work.unit", {
      name: `QA Codex нэгж ${stamp}`,
      code: `qa_codex_${Date.now()}`,
      category: "other",
      active: true,
    });
    created.push(["ops.work.unit", unitId]);

    const teamId = await createWithFallback("mfo.crew.team", {
      name: `QA Codex баг ${stamp}`,
      active: true,
      operation_type: "street_cleaning",
    });
    created.push(["mfo.crew.team", teamId]);

    const projectId = await createWithFallback("project.project", {
      name: `QA Codex ажил ${stamp}`,
    });
    created.push(["project.project", projectId]);

    const taskId = await createWithFallback("project.task", {
      name: `QA Codex даалгавар ${stamp}`,
      project_id: projectId,
      ops_measurement_unit_id: unitId,
    }, ["name", "project_id"]);
    created.push(["project.task", taskId]);
  } catch (error) {
    errors.push(error.message);
  } finally {
    for (const [model, id] of [...created].reverse()) {
      const cleanupError = await unlinkQuietly(model, id);
      if (cleanupError) {
        errors.push(`cleanup ${model}#${id}: ${cleanupError}`);
      }
    }
  }

  return {
    createdCount: created.length,
    cleanedCount: created.length,
    errors,
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
