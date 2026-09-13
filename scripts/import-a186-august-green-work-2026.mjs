const connection = {
  url: (process.env.ODOO_URL || "http://odoo:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: process.env.ODOO_LOGIN || "admin",
  password: process.env.ODOO_PASSWORD || "admin",
};

const works = [
  ["GREEN-01", "Ургамлан хашлага хэлбэржүүлэлт", "pruning", 2400, "м", "Тус бүр 3-4 удаагийн давтамжтай. Чингисийн өргөн чөлөө."],
  ["GREEN-04", "Ургамлан хашлага хэлбэржүүлэлт", "pruning", 980, "м", "Тус бүр 3-4 удаагийн давтамжтай. Ажилчны гудамж."],
  ["GREEN-03", "Ургамлан хашлага хэлбэржүүлэлт", "pruning", 180, "м", "Тус бүр 3-4 удаагийн давтамжтай. Эрчим хүчний гудамж."],
  ["GREEN-01", "Бут сөөг хэлбэржүүлэлт", "pruning", 8600, "ш", "Тус бүр 3-4 удаагийн давтамжтай. Чингисийн өргөн чөлөө."],
  ["GREEN-04", "Бут сөөг хэлбэржүүлэлт", "pruning", 1960, "ш", "Тус бүр 3-4 удаагийн давтамжтай. Ажилчны гудамж."],
  ["GREEN-03", "Бут сөөг хэлбэржүүлэлт", "pruning", 840, "ш", "Тус бүр 3-4 удаагийн давтамжтай. Эрчим хүчний гудамж."],
  ["GREEN-01", "Зүлэг хадалт", "care", 16800, "м²", "Чингисийн өргөн чөлөөний зүлэгт талбайд 4 удаа хадалт хийсэн."],
  ["GL-FL-2026-01", "Зүлэг хадалт", "care", 2800, "м²", "Тэмээтэй хөшөөний талбайд 3 удаа хадалт хийсэн."],
  ["GREEN-04", "Зүлэг хадалт", "care", 18925, "м²", "Ажилчны гудамжинд 3 удаа хадалт хийсэн."],
  ["GREEN-03", "Зүлэг хадалт", "care", 3201, "м²", "Эрчим хүчний гудамжинд 2 удаа хадалт хийсэн."],
  ["GREEN-02", "Зүлэг хадалт", "care", 680, "м²", "Б.Шаравын гудамжинд 2 удаа хадалт хийсэн."],
  ["GREEN-01", "Цэцгийн мандлын зэрлэг ургамал устгал", "care", 3053, "м²", "Ногоон байгууламжийн 11 байршилд 3 удаагийн давтамжтай хийсэн."],
  ["GREEN-01", "Бордоотой усалгаа", "watering", 3, "удаа", "Мод, сөөгний ургалтыг сайжруулах гумин бордоотой усалгааг агротехнологийн дагуу хийсэн."],
  ["GREEN-01", "Ногоон байгууламжийн хуваарьт усалгаа", "watering", 84, "рейс", "Нийт 84 рейс. Тайланд бичсэн 50,443 усны хэмжээг нэгж тодорхойгүй тул тоон гүйцэтгэлд оруулаагүй."],
  ["GREEN-01", "Ногоон байгууламжийн хог ачилт тээвэрлэлт", "street_cleaning", 102.4, "м³", "2026 оны 8 сард нийт 32 рейсээр ачиж тээвэрлэсэн."],
  ["GREEN-01", "Нэмэлт 33 байршлын ургамлан хашлага хэлбэржүүлэлт", "pruning", 130, "м", "2026.08.09-11-нд өгсөн үүрэг даалгаврын хүрээнд 33 байршилд хийсэн."],
  ["GREEN-01", "Нэмэлт хэлбэржүүлэлтийн хог ачилт тээвэрлэлт", "street_cleaning", 8.5, "тн", "Хэлбэржүүлэлтээс гарсан хогийг 4 рейсээр ачиж тээвэрлэсэн."],
  ["GREEN-03", "Ногоон байгууламжийн тросс чангалах", "other", 25, "м", "Эрчим хүчний гудамжинд хийсэн."],
  ["GREEN-01", "Ногоон байгууламжийн тросс шинээр хийх", "other", 1060, "м", "5-р бичилд шинээр хийж, 50 м чангалсан, 6 м холбож боосон, 6 шон засварласан."],
  ["GREEN-01", "Ногоон байгууламжийн тросс шинээр хийх", "other", 16, "м", "Хүүхдийн сэргээн засах төвийн урд шинээр хийж, 6 м чангалж засварласан."],
  ["GREEN-01", "Ногоон байгууламжийн тросс чангалах", "other", 19, "м", "Соёлын ордны урд 19 м чангалж, 3 м холбосон."],
  ["GREEN-01", "Ногоон байгууламжийн тороос чангалах", "other", 4.5, "м", "75 дугаар сургуулийн өмнө хийсэн."],
];

let rpcId = 0;
async function jsonRpc(service, method, args) {
  const response = await fetch(`${connection.url}/jsonrpc`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "call", params: { service, method, args } }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.data?.message || payload.error.message || "Odoo RPC error");
  return payload.result;
}
const uid = await jsonRpc("common", "authenticate", [connection.db, connection.login, connection.password, {}]);
if (!uid) throw new Error("Odoo нэвтрэлт амжилтгүй.");
const call = (model, method, args = [], kwargs = {}) => jsonRpc("object", "execute_kw", [connection.db, uid, connection.password, model, method, args, kwargs]);
const [projectFields, taskFields] = await Promise.all([
  call("project.project", "fields_get", [], { attributes: ["type"] }),
  call("project.task", "fields_get", [], { attributes: ["type"] }),
]);
const supported = (values, fields) => Object.fromEntries(
  Object.entries(values).filter(([key, value]) => key in fields && value !== undefined),
);

const departmentIds = await call("hr.department", "search", [[
  ["name", "ilike", "Ногоон байгууламж"],
  ["name", "ilike", "цэвэрлэгээ үйлчилгээ"],
]], { limit: 1 });
if (!departmentIds.length) throw new Error("Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс олдсонгүй.");
const departmentId = departmentIds[0];

const projectName = "ХУД Засаг даргын 2026 оны А/186 захирамж (8 сарын тайлан)";
let projectIds = await call("project.project", "search", [[
  ["name", "=", projectName], ["ops_department_id", "=", departmentId],
]], { limit: 1 });
let projectCreated = false;
if (!projectIds.length) {
  const projectId = await call("project.project", "create", [supported({
    name: projectName,
    ops_department_id: departmentId,
    mfo_operation_type: "green_maintenance",
    privacy_visibility: "employees",
    date_start: "2026-08-01",
    date: "2026-08-31",
    description: "2026 оны 8 дугаар сарын А/186 захирамжийн баталгаатай ногоон байгууламжийн ажлын гүйцэтгэл.",
  }, projectFields)]);
  projectIds = [projectId];
  projectCreated = true;
} else {
  await call("project.project", "write", [projectIds, supported({
    ops_department_id: departmentId,
    mfo_operation_type: "green_maintenance",
    date_start: "2026-08-01",
    date: "2026-08-31",
  }, projectFields)]);
}
const projectId = projectIds[0];

const stages = await call("project.task.type", "search_read", [[]], {
  fields: ["name", "fold"], order: "sequence asc, id asc", limit: 200,
});
const doneStage = stages.find((stage) => stage.fold) || stages.find((stage) => /дуус|done/i.test(stage.name));
if (!doneStage) throw new Error("Дууссан төлөвийн шат олдсонгүй.");

let created = 0;
let updated = 0;
for (const [code, workName, activityType, quantity, unit, note] of works) {
  const locationRows = await call("municipal.green.location", "search_read", [[["code", "=", code]]], {
    fields: ["name", "khoroo"], limit: 1,
  });
  if (!locationRows.length) throw new Error(`Байршил олдсонгүй: ${code}`);
  const location = locationRows[0];
  const name = `А/186 · 2026.08 · ${workName} · ${location.name}`;
  const taskIds = await call("project.task", "search", [[
    ["project_id", "=", projectId], ["name", "=", name],
  ]], { limit: 1 });
  const values = supported({
    name,
    project_id: projectId,
    ops_department_id: departmentId,
    mfo_operation_type: "green_maintenance",
    mfo_state: "verified",
    stage_id: doneStage.id,
    date_deadline: "2026-08-31 23:59:00",
    mfo_shift_date: "2026-08-31",
    ops_planned_quantity: quantity,
    ops_completed_quantity: quantity,
    ops_measurement_unit: unit,
    ops_measurement_unit_code: unit,
    green_clean_work_kind: "one_time",
    green_clean_scheduled_date: "2026-08-31",
    green_clean_location_name: location.name,
    green_clean_khoroo: location.khoroo || "",
    description: `Байршлын код: ${code}\nАжлын ангилал: ${activityType}\nГүйцэтгэл: ${quantity} ${unit}\n${note}`,
  }, taskFields);
  if (taskIds.length) {
    await call("project.task", "write", [taskIds, values]);
    updated++;
  } else {
    await call("project.task", "create", [values]);
    created++;
  }
}

const importedTaskIds = await call("project.task", "search", [[
  ["project_id", "=", projectId], ["name", "ilike", "А/186 · 2026.08 ·"],
]]);
if (importedTaskIds.length !== works.length) {
  throw new Error(`Шилжилтийн шалгалт амжилтгүй: ${works.length}-оос ${importedTaskIds.length} даалгавар байна.`);
}

// project/task руу бүрэн, давхардалгүй шилжсэний дараа мэдээллийн сангийн
// өмнөх буруу байршуулсан хуулбаруудыг арилгана.
const oldActivityIds = await call("municipal.green.activity", "search", [[
  ["name", "ilike", "А/186 · 2026.08 ·"],
]]);
if (oldActivityIds.length) {
  await call("municipal.green.activity", "unlink", [oldActivityIds]);
}

console.log(JSON.stringify({
  ok: true,
  project: { id: projectId, created: projectCreated, name: projectName },
  tasks: { created, updated, total: importedTaskIds.length },
  removedGreenRegistryActivities: oldActivityIds.length,
  excluded: ["Улиас 151/158 ш зөрүүтэй", "Усны 50,443 хэмжээний нэгж тодорхойгүй"],
}, null, 2));
