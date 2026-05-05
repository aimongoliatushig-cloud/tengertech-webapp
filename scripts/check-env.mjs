#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv.includes("--production") ? "production" : "development";
const templateMode = process.argv.includes("--template");
const explicitFileArg = process.argv.find((arg) => arg.startsWith("--file="));
const envFile = explicitFileArg
  ? explicitFileArg.slice("--file=".length)
  : mode === "production"
    ? ".env"
    : ".env.local";
const envPath = resolve(process.cwd(), envFile);

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return { exists: false, values: new Map() };
  }

  const values = new Map();
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, "").trim();
    values.set(key, value);
  }

  return { exists: true, values };
}

const required = [
  "ODOO_URL",
  "ODOO_DB",
  "ODOO_LOGIN",
  "ODOO_PASSWORD",
  "SESSION_SECRET",
  "SESSION_COOKIE_SECURE",
  "APP_BASE_URL",
  "APP_TIME_ZONE",
  "NEXT_PUBLIC_APP_TITLE",
];

const optional = [
  "ODOO_FALLBACK_URLS",
  "ODOO_RPC_TIMEOUT_MS",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "WRS_REPORT_URL",
  "WRS_REPORT_LOGIN",
  "WRS_REPORT_PASSWORD",
  "WRS_SYNC_TOKEN",
  "WRS_REPORT_BRANCH_NAME",
  "FLEET_REPAIR_MODEL",
  "FLEET_REPAIR_QUOTE_MODEL",
];

const placeholders = [
  "CHANGE_ME",
  "replace-this",
  "replace-with",
  "example.invalid",
];

function isMissing(value) {
  return !value || placeholders.some((placeholder) => value.includes(placeholder));
}

function isUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const { exists, values } = parseEnvFile(envPath);
const errors = [];
const warnings = [];

if (!exists) {
  errors.push(`${envFile} файл олдсонгүй.`);
}

for (const key of required) {
  const value = values.get(key);
  if (templateMode ? !value : isMissing(value)) {
    errors.push(`${key} тохиргоо дутуу эсвэл placeholder байна.`);
  }
}

for (const key of ["ODOO_URL", "APP_BASE_URL"]) {
  const value = values.get(key);
  if (value && !templateMode && !isUrl(value)) {
    errors.push(`${key} нь http/https URL байх ёстой.`);
  }
}

const cookieSecure = values.get("SESSION_COOKIE_SECURE");
if (cookieSecure && !["true", "false"].includes(cookieSecure)) {
  errors.push("SESSION_COOKIE_SECURE нь true эсвэл false байна.");
}
if (mode === "production" && cookieSecure !== "true") {
  errors.push("Production дээр SESSION_COOKIE_SECURE=true байх ёстой.");
}

const sessionSecret = values.get("SESSION_SECRET") || "";
if (!templateMode && sessionSecret && sessionSecret.length < 32) {
  errors.push("SESSION_SECRET хамгийн багадаа 32 тэмдэгт байх ёстой.");
}

const appBaseUrl = values.get("APP_BASE_URL") || "";
if (!templateMode && mode === "production" && appBaseUrl.startsWith("http://")) {
  warnings.push("Production APP_BASE_URL ихэвчлэн https:// байх ёстой.");
}

const publicAliases = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL"];
for (const alias of publicAliases) {
  const aliasValue = values.get(alias);
  if (aliasValue && appBaseUrl && aliasValue.replace(/\/+$/, "") !== appBaseUrl.replace(/\/+$/, "")) {
    warnings.push(`${alias} нь APP_BASE_URL-аас өөр байна. Боломжтой бол APP_BASE_URL-г canonical болго.`);
  }
}

const vapidPublic = values.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const vapidPrivate = values.get("VAPID_PRIVATE_KEY");
if ((vapidPublic && !vapidPrivate) || (!vapidPublic && vapidPrivate)) {
  warnings.push("Push notification ашиглах бол NEXT_PUBLIC_VAPID_PUBLIC_KEY болон VAPID_PRIVATE_KEY хоёул байх ёстой.");
}

for (const key of optional) {
  if (!values.has(key)) {
    warnings.push(`${key} optional боловч standard template-д байгаа эсэхийг шалга.`);
  }
}

if (errors.length) {
  console.error("Env check FAILED");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length) {
    console.warn("\nWarnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }
  process.exit(1);
}

console.log(`Env check OK (${templateMode ? "template, " : ""}${mode}, ${envFile})`);
if (warnings.length) {
  console.warn("Warnings:");
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}
