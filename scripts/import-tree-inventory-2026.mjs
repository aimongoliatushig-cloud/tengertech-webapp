const connection = {
  url: (process.env.ODOO_URL || "http://odoo:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: process.env.ODOO_LOGIN || "admin",
  password: process.env.ODOO_PASSWORD || "admin",
};

const locations = [
  {
    code: "TR-CH-2026-01",
    name: "Чингисийн өргөн чөлөө — Энхтайвны гүүрээс 120 мянгатын автобусны буудал хүртэл",
    address: "Энхтайвны гүүрний зүүн талаас 120 мянгатын автобусны буудлын зүүн тал хүртэл",
    trees: [["Монос", 99], ["Шар хуайс", 138], ["Буйлс", 34], ["Гүйлс", 23], ["Тэхийн шээг", 60], ["Голтбор", 33]],
  },
  {
    code: "TR-CH-2026-02",
    name: "Чингисийн өргөн чөлөө — Улаан тоосгоны ургамлан хашлага",
    address: "Улаан тоосгонд ургамлан хашлаганд таригдсан, 250 урт метр",
    trees: [["Хайлаас", 3237]],
  },
  {
    code: "TR-CH-2026-03",
    name: "Чингисийн өргөн чөлөө — Хан-Уулын өндөрлөг",
    address: "Хан-Уулын өндөрлөг",
    trees: [["Үрэл", 28], ["Буйлс", 30], ["Шар хуайс", 80]],
  },
  {
    code: "TR-AJ-2026-01",
    name: "Ажилчны гудамж — үндсэн хэсэг",
    address: "Ажилчны гудамж",
    trees: [["Монос", 39], ["Буйлс", 123], ["Шар хуайс", 88], ["Улиас", 250]],
  },
  {
    code: "TR-AJ-2026-02",
    name: "Ажилчны гудамж — зүүн тал",
    address: "Ажилчны гудамжны зүүн тал",
    trees: [["Буйлс", 105], ["Хайлаас", 100]],
  },
  {
    code: "TR-ER-2026-01",
    name: "Эрчим хүчний гудамж",
    address: "Эрчим хүчний гудамж",
    trees: [["Шар хуайс", 165]],
  },
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
const supported = (values, fields) => Object.fromEntries(Object.entries(values).filter(([key]) => key in fields));
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
  call("municipal.green.location", "fields_get", [], { attributes: ["type"] }),
  call("municipal.green.asset", "fields_get", [], { attributes: ["type"] }),
]);

let createdLocations = 0;
let updatedLocations = 0;
let createdAssets = 0;
let updatedAssets = 0;
for (const row of locations) {
  const location = await upsert("municipal.green.location", [["code", "=", row.code]], {
    code: row.code,
    name: row.name,
    location_type: "street",
    asset_group: "tree",
    department_id: departmentIds[0],
    district: "Хан-Уул дүүрэг",
    address: row.address,
    area_size: 0,
    area_unit: "м²",
    note: "2026 оны тарьсан модны нэр төрөл, тооллого.",
    active: true,
  }, locationFields);
  location.created ? createdLocations++ : updatedLocations++;
  for (const [name, quantity] of row.trees) {
    const asset = await upsert("municipal.green.asset", [
      ["location_id", "=", location.id],
      ["asset_type", "=", "tree"],
      ["name", "=", name],
    ], {
      location_id: location.id,
      name,
      asset_type: "tree",
      quantity,
      unit: "ш",
      condition: "healthy",
      active: true,
    }, assetFields);
    asset.created ? createdAssets++ : updatedAssets++;
  }
}

const totalTrees = locations.flatMap((row) => row.trees).reduce((sum, [, quantity]) => sum + quantity, 0);
if (totalTrees !== 4632) throw new Error(`Нийлбэр зөрүүтэй: ${totalTrees}`);
console.log(JSON.stringify({
  ok: true,
  locations: { created: createdLocations, updated: updatedLocations, total: locations.length },
  assets: { created: createdAssets, updated: updatedAssets, total: locations.flatMap((row) => row.trees).length },
  species: [...new Set(locations.flatMap((row) => row.trees.map(([name]) => name)))],
  totalTrees,
}, null, 2));
