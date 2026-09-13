const connection = {
  url: (process.env.ODOO_URL || "http://odoo:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: process.env.ODOO_LOGIN || "admin",
  password: process.env.ODOO_PASSWORD || "admin",
};

const flowerBeds = [
  ["GL-FL-2026-01", "Тэмээтэй хөшөө", "Чингисийн өргөн чөлөө", "", 800, 64000],
  ["GL-FL-2026-02", "Хаан банкны урд талбай", "Чингисийн өргөн чөлөө", "", 430, 34400],
  ["GL-FL-2026-03", "Наадам центрийн урд талбай", "Чингисийн өргөн чөлөө", "", 250, 20000],
  ["GL-FL-2026-04", "Жетро дэлгүүрийн уулзвар", "Чингисийн өргөн чөлөө", "", 40, 3200],
  ["GL-FL-2026-05", "Засаг даргын Тамгын газрын үүд", "Чингисийн өргөн чөлөө", "", 23, 1840],
  ["GL-FL-2026-06", "Чингисийн өргөн чөлөөнөөс Төв цэнгэлдэхийн тойрог хүртэл", "Чингисийн өргөн чөлөө", "", 580, 46400],
  ["GL-FL-2026-07", "ХУД-ийн өндөрлөг", "Чингисийн өргөн чөлөө", "", 110, 8800],
  ["GL-FL-2026-08", "Бурхан багшийн цэцэрлэгт хүрээлэн", "Зайсан", "", 360, 28800],
  ["GL-FL-2026-09", "Янгиртай хөшөө орчим", "13-р хороо", "13-р хороо", 220, 17600],
  ["GL-FL-2026-10", "Соёлын ордны орчим", "ЧӨЧ-өөс Цэнгэлдэхийн уулзвар", "", 180, 14400],
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

async function call(model, method, args = [], kwargs = {}) {
  return jsonRpc("object", "execute_kw", [connection.db, uid, connection.password, model, method, args, kwargs]);
}

async function modelFields(model) {
  return call(model, "fields_get", [], { attributes: ["type"] });
}

function supported(values, fields) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => key in fields));
}

async function upsert(model, domain, values, fields) {
  const ids = await call(model, "search", [domain], { limit: 1 });
  if (ids.length) {
    await call(model, "write", [ids, supported(values, fields)]);
    return { id: ids[0], created: false };
  }
  return { id: await call(model, "create", [supported(values, fields)]), created: true };
}

const departmentIds = await call("hr.department", "search", [[
  ["name", "ilike", "Ногоон байгууламж"],
  ["name", "ilike", "цэвэрлэгээ үйлчилгээ"],
]], { limit: 1 });
if (!departmentIds.length) throw new Error("Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс олдсонгүй.");

const [locationFields, assetFields] = await Promise.all([
  modelFields("municipal.green.location"),
  modelFields("municipal.green.asset"),
]);

let createdLocations = 0;
let updatedLocations = 0;
let createdAssets = 0;
let updatedAssets = 0;

for (const [code, name, areaName, khoroo, areaSize, flowerCount] of flowerBeds) {
  const location = await upsert("municipal.green.location", [["code", "=", code]], {
    code,
    name,
    location_type: "street",
    asset_group: "flower",
    department_id: departmentIds[0],
    district: "Хан-Уул дүүрэг",
    khoroo: khoroo || false,
    address: areaName,
    area_size: areaSize,
    area_unit: "м²",
    note: "2026 оны цэцгийн мандлын талбай, цэцгийн тоо хэмжээ.",
    active: true,
  }, locationFields);
  location.created ? createdLocations++ : updatedLocations++;

  const asset = await upsert("municipal.green.asset", [
    ["location_id", "=", location.id],
    ["asset_type", "=", "flower"],
    ["name", "=", "Цэцгийн мандал"],
  ], {
    location_id: location.id,
    name: "Цэцгийн мандал",
    asset_type: "flower",
    quantity: flowerCount,
    unit: "ш",
    condition: "healthy",
    active: true,
  }, assetFields);
  asset.created ? createdAssets++ : updatedAssets++;
}

console.log(JSON.stringify({
  ok: true,
  locations: { created: createdLocations, updated: updatedLocations, total: flowerBeds.length },
  assets: { created: createdAssets, updated: updatedAssets, total: flowerBeds.length },
  totalAreaM2: flowerBeds.reduce((sum, row) => sum + row[4], 0),
  totalFlowers: flowerBeds.reduce((sum, row) => sum + row[5], 0),
}, null, 2));
