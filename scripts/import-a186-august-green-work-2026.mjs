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
const activityFields = await call("municipal.green.activity", "fields_get", [], { attributes: ["type"] });
const supported = (values) => Object.fromEntries(Object.entries(values).filter(([key]) => key in activityFields));

let created = 0;
let updated = 0;
for (const [code, workName, activityType, quantity, unit, note] of works) {
  const locationIds = await call("municipal.green.location", "search", [[["code", "=", code]]], { limit: 1 });
  if (!locationIds.length) throw new Error(`Байршил олдсонгүй: ${code}`);
  const name = `А/186 · 2026.08 · ${workName}`;
  const existing = await call("municipal.green.activity", "search", [[
    ["location_id", "=", locationIds[0]], ["name", "=", name], ["actual_quantity", "=", quantity], ["unit", "=", unit],
  ]], { limit: 1 });
  const values = supported({
    location_id: locationIds[0], name, activity_type: activityType,
    planned_date: "2026-08-31 23:59:00", done_datetime: "2026-08-31 23:59:00",
    actual_quantity: quantity, unit, report_note: note, requires_photo: false, state: "done",
  });
  if (existing.length) {
    await call("municipal.green.activity", "write", [existing, values]);
    updated++;
  } else {
    await call("municipal.green.activity", "create", [values]);
    created++;
  }
}

console.log(JSON.stringify({ ok: true, activities: { created, updated, total: works.length }, excluded: ["Улиас 151/158 ш зөрүүтэй", "Усны 50,443 хэмжээний нэгж тодорхойгүй"] }, null, 2));
