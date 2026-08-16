import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";
import { canViewGarbageWeightReports } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_MODELS = new Set([
  "municipal.garbage.fuel.report",
  "municipal.garbage.weight.report",
  "fleet.vehicle.odometer",
]);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  const departmentName = await loadSessionDepartmentName(session);
  if (!canViewGarbageWeightReports(session, departmentName)) {
    return Response.json({ error: "Зураг нэмэх эрхгүй байна." }, { status: 403 });
  }

  const formData = await request.formData();
  const model = String(formData.get("model") || "");
  const recordId = Number(formData.get("recordId"));
  const image = formData.get("image");
  if (!ALLOWED_MODELS.has(model) || !Number.isInteger(recordId) || recordId <= 0) {
    return Response.json({ error: "Тайлангийн мөр буруу байна." }, { status: 400 });
  }
  if (!(image instanceof File) || !ALLOWED_TYPES.has(image.type) || image.size <= 0) {
    return Response.json({ error: "JPG, PNG эсвэл WEBP зураг сонгоно уу." }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Зураг 8 MB-аас бага байх шаардлагатай." }, { status: 413 });
  }

  const exists = await executeOdooKw<number>(model, "search_count", [[["id", "=", recordId]]], {}, {
    login: session.login,
    password: session.password,
  });
  if (!exists) return Response.json({ error: "Тайлангийн мөр олдсонгүй." }, { status: 404 });

  const datas = Buffer.from(await image.arrayBuffer()).toString("base64");
  const attachmentId = await executeOdooKw<number>("ir.attachment", "create", [[{
    name: image.name || `fleet-report-${recordId}.jpg`,
    type: "binary",
    datas,
    mimetype: image.type,
    res_model: model,
    res_id: recordId,
  }]], {}, {
    login: session.login,
    password: session.password,
  });
  return Response.json({ ok: true, attachmentId });
}
