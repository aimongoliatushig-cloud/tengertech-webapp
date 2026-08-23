const connection = {
  url: (process.env.ODOO_URL || "http://odoo:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: process.env.ODOO_LOGIN || "admin",
  password: process.env.ODOO_PASSWORD || "admin",
};

const catalog = [
  ["lawn_plant_restore", "Зүлэг тарих, нөхөн сэргээх", [
    ["soil_prepare", "Хөрс бэлтгэх, тэгшлэх", "м²"],
    ["topsoil_spread", "Хар шороо/шимт хөрс дэвсэх", "м³"],
    ["seed_sowing", "Үр тарих", "м²"],
    ["turf_laying", "Өнхрүүш зүлэг дэвсэх", "м²"],
    ["loosen_reseed", "Сийрүүлэх, үр нөхөх", "м²"],
  ]],
  ["lawn_watering", "Усалгаа", [
    ["lawn_water", "Зүлэг услах", "м² / л"],
    ["watering_vehicle", "Усалгааны машин ажиллуулах", "машин/цаг"],
    ["irrigation_check", "Усалгааны систем шалгах", "удаа"],
  ]],
  ["lawn_mowing", "Хадалт", [
    ["lawn_mow", "Зүлэг хадах", "м²"],
    ["edge_mow", "Ирмэг хэсэг хадах", "м"],
    ["mown_grass_clean", "Хадсан өвс цэвэрлэх", "м²"],
  ]],
  ["lawn_fertilizing", "Бордоо, тэжээл", [
    ["fertilizer_spread", "Бордоо цацах", "м² / кг"],
    ["organic_fertilizer", "Органик бордоо хийх", "м² / кг"],
    ["liquid_fertilizer", "Шингэн бордоо цацах", "м² / л"],
  ]],
  ["lawn_cleaning", "Хог, цэвэрлэгээ", [
    ["litter_pick", "Зүлгэн дээрх хог түүх", "м²"],
    ["leaf_branch_clean", "Навч, мөчир цэвэрлэх", "м²"],
    ["grass_transport", "Хадсан өвс ачих, зөөвөрлөх", "м³ / тн"],
  ]],
  ["lawn_aeration", "Сийрүүлэлт, агааржуулалт", [
    ["lawn_loosen", "Зүлэг сийрүүлэх", "м²"],
    ["lawn_aerate", "Агааржуулах", "м²"],
    ["dry_patch_clean", "Хатсан хэсгийг цэвэрлэх", "м²"],
  ]],
  ["lawn_weed_care", "Хог ургамлын арчилгаа", [
    ["weed_hand_pick", "Хог ургамал гараар түүх", "м²"],
    ["weed_remove", "Хог ургамал устгах", "м²"],
  ]],
  ["lawn_restoration", "Нөхөн сэргээлт", [
    ["bare_patch_restore", "Халцарсан хэсэг нөхөх", "м²"],
    ["reseed", "Үр дахин тарих", "м²"],
    ["soil_refill", "Шороо нөхөх", "м³"],
    ["turf_restore", "Зүлэг нөхөн дэвсэх", "м²"],
  ]],
  ["lawn_edging", "Ирмэг засалт", [
    ["edge_shape", "Зүлэгний ирмэг хэлбэржүүлэх", "м"],
    ["curb_edge_trim", "Зам, бордюр дагуух зүлэг засах", "м"],
  ]],
  ["lawn_seasonal", "Улирлын ажил", [
    ["spring_recovery", "Хаврын сэргээх арчилгаа", "м²"],
    ["autumn_cleaning", "Намрын цэвэрлэгээ", "м²"],
    ["winter_prepare", "Өвөлжилтөд бэлтгэх", "м²"],
  ]],
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
const call = (model, method, args = [], kwargs = {}) =>
  jsonRpc("object", "execute_kw", [connection.db, uid, connection.password, model, method, args, kwargs]);

async function upsert(model, domain, values) {
  const ids = await call(model, "search", [domain], { limit: 1 });
  if (ids.length) {
    await call(model, "write", [ids, values]);
    return { id: ids[0], created: false };
  }
  return { id: await call(model, "create", [values]), created: true };
}

const departmentIds = await call("hr.department", "search", [[
  ["name", "ilike", "Ногоон байгууламж"],
  ["name", "ilike", "цэвэрлэгээ үйлчилгээ"],
]], { limit: 1 });
if (!departmentIds.length) throw new Error("Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс олдсонгүй.");
const departmentId = departmentIds[0];

let categoriesCreated = 0;
let categoriesUpdated = 0;
let unitsCreated = 0;
let unitsUpdated = 0;
let templatesCreated = 0;
let templatesUpdated = 0;
const unitCache = new Map();

for (const [categoryCode, categoryName, subworks] of catalog) {
  const category = await upsert("green.clean.work.category", [["code", "=", categoryCode]], {
    code: categoryCode,
    name: categoryName,
    section: "green",
    sequence: (catalog.findIndex((item) => item[0] === categoryCode) + 1) * 10,
    active: true,
  });
  category.created ? categoriesCreated++ : categoriesUpdated++;

  for (const [subworkCode, subworkName, unitName] of subworks) {
    let unit = unitCache.get(unitName);
    if (!unit) {
      unit = await upsert("green.clean.unit", [["code", "=", unitName]], {
        code: unitName,
        name: unitName,
        active: true,
      });
      unitCache.set(unitName, unit);
      unit.created ? unitsCreated++ : unitsUpdated++;
    }

    const templateCode = `GC-LAWN-${subworkCode.toUpperCase()}`;
    const template = await upsert("green.clean.work.template", [["code", "=", templateCode]], {
      code: templateCode,
      name: subworkName,
      department_id: departmentId,
      category_id: category.id,
      unit_id: unit.id,
      work_kind: "one_time",
      frequency: "daily",
      daily_planned_quantity: 0,
      total_planned_quantity: 0,
      start_date: "2026-01-01",
      end_date: false,
      requires_photo: true,
      requires_gps: true,
      requires_approval: true,
      active: true,
    });
    template.created ? templatesCreated++ : templatesUpdated++;
  }
}

console.log(JSON.stringify({
  ok: true,
  categories: { created: categoriesCreated, updated: categoriesUpdated, total: catalog.length },
  units: { created: unitsCreated, updated: unitsUpdated, total: unitCache.size },
  subworkTemplates: {
    created: templatesCreated,
    updated: templatesUpdated,
    total: catalog.reduce((sum, item) => sum + item[2].length, 0),
  },
}, null, 2));
