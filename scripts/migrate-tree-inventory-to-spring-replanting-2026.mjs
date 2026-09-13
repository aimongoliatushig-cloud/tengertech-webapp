const connection = {
  url: (process.env.ODOO_URL || "http://odoo:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: process.env.ODOO_LOGIN || "admin",
  password: process.env.ODOO_PASSWORD || "admin",
};

const records = [
  ["TR-CH-2026-01", "Монос", 99], ["TR-CH-2026-01", "Шар хуайс", 138],
  ["TR-CH-2026-01", "Буйлс", 34], ["TR-CH-2026-01", "Гүйлс", 23],
  ["TR-CH-2026-01", "Тэхийн шээг", 60], ["TR-CH-2026-01", "Голтбор", 33],
  ["TR-CH-2026-02", "Хайлаас", 3237],
  ["TR-CH-2026-03", "Үрэл", 28], ["TR-CH-2026-03", "Буйлс", 30],
  ["TR-CH-2026-03", "Шар хуайс", 80],
  ["TR-AJ-2026-01", "Монос", 39], ["TR-AJ-2026-01", "Буйлс", 123],
  ["TR-AJ-2026-01", "Шар хуайс", 88], ["TR-AJ-2026-01", "Улиас", 250],
  ["TR-AJ-2026-02", "Буйлс", 105], ["TR-AJ-2026-02", "Хайлаас", 100],
  ["TR-ER-2026-01", "Шар хуайс", 165],
];

let rpcId = 0;
async function jsonRpc(service, method, args) {
  const response = await fetch(`${connection.url}/jsonrpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "call", params: { service, method, args } }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.data?.message || payload.error.message || "Odoo RPC error");
  return payload.result;
}

const uid = await jsonRpc("common", "authenticate", [connection.db, connection.login, connection.password, {}]);
if (!uid) throw new Error("Odoo нэвтрэлт амжилтгүй.");
const call = (model, method, args = [], kwargs = {}) => jsonRpc("object", "execute_kw", [connection.db, uid, connection.password, model, method, args, kwargs]);
const activityFields = await call("municipal.green.activity", "fields_get", [], { attributes: ["type"] });
const supported = (values) => Object.fromEntries(Object.entries(values).filter(([key]) => key in activityFields));

let created = 0;
let updated = 0;
let deactivatedAssets = 0;
for (const [code, treeName, quantity] of records) {
  const locations = await call("municipal.green.location", "search", [[["code", "=", code]]], { limit: 1 });
  if (!locations.length) throw new Error(`Байршил олдсонгүй: ${code}`);
  const locationId = locations[0];
  const activityName = `2026 оны хаврын нөхөн тарилт — ${treeName}`;
  const activityIds = await call("municipal.green.activity", "search", [[
    ["location_id", "=", locationId],
    ["activity_type", "=", "replanting"],
    ["name", "=", activityName],
  ]], { limit: 1 });
  const values = supported({
    location_id: locationId,
    name: activityName,
    activity_type: "replanting",
    actual_quantity: quantity,
    unit: "ш",
    report_note: `2026 оны хавар нөхөн тарьсан ${treeName}: ${quantity} ширхэг.`,
    requires_photo: false,
    state: "done",
  });
  if (activityIds.length) {
    await call("municipal.green.activity", "write", [activityIds, values]);
    updated++;
  } else {
    await call("municipal.green.activity", "create", [values]);
    created++;
  }

  const assetIds = await call("municipal.green.asset", "search", [[
    ["location_id", "=", locationId],
    ["asset_type", "=", "tree"],
    ["name", "=", treeName],
    ["active", "=", true],
  ]]);
  if (assetIds.length) {
    await call("municipal.green.asset", "write", [assetIds, { active: false }]);
    deactivatedAssets += assetIds.length;
  }
}

const totalTrees = records.reduce((sum, [, , quantity]) => sum + quantity, 0);
if (totalTrees !== 4632) throw new Error(`Нийлбэр зөрүүтэй: ${totalTrees}`);
console.log(JSON.stringify({ ok: true, activities: { created, updated, total: records.length }, deactivatedAssets, totalTrees }, null, 2));
