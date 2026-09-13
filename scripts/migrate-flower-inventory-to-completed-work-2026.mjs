const connection = {
  url: (process.env.ODOO_URL || "http://odoo:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: process.env.ODOO_LOGIN || "admin",
  password: process.env.ODOO_PASSWORD || "admin",
};

const flowerBeds = [
  ["GL-FL-2026-01", 800, 64000], ["GL-FL-2026-02", 430, 34400],
  ["GL-FL-2026-03", 250, 20000], ["GL-FL-2026-04", 40, 3200],
  ["GL-FL-2026-05", 23, 1840], ["GL-FL-2026-06", 580, 46400],
  ["GL-FL-2026-07", 110, 8800], ["GL-FL-2026-08", 360, 28800],
  ["GL-FL-2026-09", 220, 17600], ["GL-FL-2026-10", 180, 14400],
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
for (const [code, areaSize, flowerCount] of flowerBeds) {
  const locations = await call("municipal.green.location", "search", [[["code", "=", code]]], { limit: 1 });
  if (!locations.length) throw new Error(`Байршил олдсонгүй: ${code}`);
  const locationId = locations[0];
  const activityName = "2026 оны цэцэг тарих ажил — Цэцгийн мандал";
  const activityIds = await call("municipal.green.activity", "search", [[
    ["location_id", "=", locationId], ["activity_type", "=", "replanting"], ["name", "=", activityName],
  ]], { limit: 1 });
  const values = supported({
    location_id: locationId,
    name: activityName,
    activity_type: "replanting",
    actual_quantity: flowerCount,
    unit: "ш",
    report_note: `2026 онд хийсэн цэцэг тарих ажил: ${flowerCount} ширхэг, мандлын талбай ${areaSize} м².`,
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
    ["location_id", "=", locationId], ["asset_type", "=", "flower"], ["active", "=", true],
  ]]);
  if (assetIds.length) {
    await call("municipal.green.asset", "write", [assetIds, { active: false }]);
    deactivatedAssets += assetIds.length;
  }
}

const totalAreaM2 = flowerBeds.reduce((sum, [, area]) => sum + area, 0);
const totalFlowers = flowerBeds.reduce((sum, [, , count]) => sum + count, 0);
if (totalAreaM2 !== 2993 || totalFlowers !== 239440) throw new Error(`Нийлбэр зөрүүтэй: ${totalAreaM2} м², ${totalFlowers} ш`);
console.log(JSON.stringify({ ok: true, activities: { created, updated, total: flowerBeds.length }, deactivatedAssets, totalAreaM2, totalFlowers }, null, 2));
