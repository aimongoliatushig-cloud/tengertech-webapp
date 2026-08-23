const connection = {
  url: (process.env.ODOO_URL || "http://odoo:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: process.env.ODOO_LOGIN || "admin",
  password: process.env.ODOO_PASSWORD || "admin",
};

const locations = [
  ["GL-2026-01", "Энхтайваны гүүрний зүүн тал", "15-р хороо", 134, 47.9051306, 106.9119722],
  ["GL-2026-02", "120 мянгатын Хаан банкны орчим", "15-р хороо", 930, 47.9028167, 106.9110861],
  ["GL-2026-03", "120 мянгатын Хаан банкны урд уулзвар", "15-р хороо", null, 47.9024056, 106.9110167],
  ["GL-2026-04", "120 мянгат Жетро дэлгүүрийн орчим", "1-р хороо", 1035, 47.9003611, 106.9092472],
  ["GL-2026-05", "Тэмээтэй хөшөө", "", null, 47.899625, 106.9092944],
  ["GL-2026-06", "То вангийн гэрлэн дохионоос Алдар талбайн буудал хүртэл замын хойд тал", "2-р хороо", 635, 47.8991944, 106.9006306],
  ["GL-2026-07", "Соёлын төв ордны хойд хэсэг", "", null, 47.8988528, 106.8991028],
  ["GL-2026-08", "Билэгт зам ХХК-ийн урд хэсэг", "3-р хороо", 104, 47.8991222, 106.8976222],
  ["GL-2026-09", "Сүмбэр товар, Соёлын ордон орчим", "19-р хороо", 332.5, 47.8988278, 106.8970694],
  ["GL-2026-10", "Сэргээн засах хүүхдийн клиникийн замын хойд тал", "", 306, 47.8990889, 106.8946167],
  ["GL-2026-11", "Дүүргийн гэрлэн дохионоос үйлдвэрийн цагаан хаалга хүртэл /Шаравын гудамж/", "19, 20-р хороо", 698, 47.8976, 106.8962917],
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
if (!uid) throw new Error("Odoo нэвтрэлт амжилтгүй. ODOO_LOGIN/ODOO_PASSWORD тохиргоог шалгана уу.");

async function call(model, method, args = [], kwargs = {}) {
  return jsonRpc("object", "execute_kw", [connection.db, uid, connection.password, model, method, args, kwargs]);
}

async function fields(model) {
  return call(model, "fields_get", [], { attributes: ["type"] });
}

function supported(values, modelFields) {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => key in modelFields && value !== undefined));
}

async function upsertOne(model, domain, values, modelFields) {
  const ids = await call(model, "search", [domain], { limit: 1 });
  if (ids.length) {
    await call(model, "write", [ids, supported(values, modelFields)]);
    return { id: ids[0], created: false };
  }
  const id = await call(model, "create", [supported(values, modelFields)]);
  return { id, created: true };
}

const departmentIds = await call("hr.department", "search", [[
  ["name", "ilike", "Ногоон байгууламж"],
  ["name", "ilike", "цэвэрлэгээ үйлчилгээ"],
]], { limit: 1 });
if (!departmentIds.length) throw new Error("Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс олдсонгүй.");
const departmentId = departmentIds[0];

const [locationFields, projectFields, taskFields] = await Promise.all([
  fields("municipal.green.location"),
  fields("project.project"),
  fields("project.task"),
]);

const projectName = "2026 оны зүлэгжүүлэлт, арчилгааны төлөвлөгөө";
const projectResult = await upsertOne("project.project", [
  ["name", "=", projectName],
  ["ops_department_id", "=", departmentId],
], {
  name: projectName,
  ops_department_id: departmentId,
  privacy_visibility: "employees",
  date_start: "2026-04-01",
  date: "2026-10-31",
  description: "14 байршилд 7,145.9 м² зүлэгжүүлэх жилийн төлөвлөгөө. Одоогоор 11 байршилд зүлэг тарьж, арчилгааны үе шат үргэлжилж байна.",
}, projectFields);

const stageRows = await call("project.task.type", "search_read", [[]], { fields: ["name", "fold"], limit: 200 });
const doneStage = stageRows.find((row) => row.fold) || stageRows.find((row) => /дуус/i.test(row.name));
const progressStage = stageRows.find((row) => /хийгдэж|ажиллаж|явц/i.test(row.name)) || stageRows.find((row) => !row.fold);

let createdLocations = 0;
let updatedLocations = 0;
let createdTasks = 0;
let updatedTasks = 0;

for (const [code, name, khoroo, area, latitude, longitude] of locations) {
  const missingArea = area == null;
  const locationResult = await upsertOne("municipal.green.location", [["code", "=", code]], {
    code,
    name,
    location_type: "street",
    department_id: departmentId,
    district: "Хан-Уул дүүрэг",
    khoroo,
    address: name,
    gps_latitude: latitude,
    gps_longitude: longitude,
    area_size: area ?? 0,
    area_unit: "м²",
    note: missingArea
      ? "2026 онд зүлэг тарьсан, арчилгаа хийгдэж байгаа. Эх файлд талбайн хэмжээ хоосон тул хэмжээг тодруулах шаардлагатай."
      : "2026 онд зүлэг тарьсан, арчилгаа хийгдэж байгаа.",
    active: true,
  }, locationFields);
  locationResult.created ? createdLocations++ : updatedLocations++;

  const common = {
    project_id: projectResult.id,
    ops_department_id: departmentId,
    ops_planned_quantity: area ?? 0,
    ops_measurement_unit: "м²",
    ops_measurement_unit_code: "м²",
    green_clean_location_name: name,
    green_clean_khoroo: khoroo,
    green_clean_area_name: name,
    green_clean_gps_latitude: latitude,
    green_clean_gps_longitude: longitude,
    green_clean_requires_gps: true,
    description: missingArea
      ? "Талбайн хэмжээ эх Excel файлд хоосон. Хэмжилт хийж төлөвлөгөөт м²-ыг нөхөж оруулна."
      : `${area} м² талбай.`,
  };

  const phases = [
    { key: "Бэлтгэл", name: `${name} — зүлэг тарих бэлтгэл ажил`, deadline: "2026-04-30", done: true },
    { key: "Тарилт", name: `${name} — зүлэг тарих`, deadline: "2026-05-31", done: true },
    { key: "Арчилгаа", name: `${name} — зүлэг арчилгаа (6–10 сар)`, deadline: "2026-10-31", done: false },
  ];

  for (const phase of phases) {
    const values = {
      ...common,
      name: phase.name,
      date_deadline: phase.deadline,
      ops_completed_quantity: phase.done ? (area ?? 0) : 0,
      stage_id: phase.done ? doneStage?.id : progressStage?.id,
      green_clean_work_kind: phase.key === "Арчилгаа" ? "recurring" : "one_time",
      green_clean_scheduled_date: phase.key === "Бэлтгэл" ? "2026-04-01" : phase.key === "Тарилт" ? "2026-05-01" : "2026-06-01",
    };
    const taskResult = await upsertOne("project.task", [
      ["project_id", "=", projectResult.id],
      ["name", "=", phase.name],
    ], values, taskFields);
    taskResult.created ? createdTasks++ : updatedTasks++;
  }
}

console.log(JSON.stringify({
  ok: true,
  project: { id: projectResult.id, created: projectResult.created, name: projectName },
  locations: { created: createdLocations, updated: updatedLocations, total: locations.length },
  tasks: { created: createdTasks, updated: updatedTasks, total: locations.length * 3 },
  knownAreaM2: locations.reduce((sum, item) => sum + (item[3] || 0), 0),
  missingAreaLocations: locations.filter((item) => item[3] == null).map((item) => item[1]),
}, null, 2));
