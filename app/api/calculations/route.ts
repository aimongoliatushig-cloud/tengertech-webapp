import { getSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { createCalculation, getCalculation, getWorkPackage, LABOR_HISTORY_MODEL, LABOR_RATE_MODEL, listCalculations, listLaborRates, listMaterials, listWorkPackages, MATERIAL_MODEL, PACKAGE_MODEL, PRICE_MODEL, rpc, updateCalculation, workPackageUpdateValues, workPackageValues, type CalculationPayload } from "@/lib/calculations";

export const dynamic = "force-dynamic";
const IMPROVEMENT = "Тохижилтын хэлтэс";

function isExecutive(role: string) { return ["system_admin", "director", "general_manager"].includes(role); }
async function authorize(write = false) {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 }) };
  const department = await loadSessionDepartmentName(session);
  const allowed = isExecutive(session.role) || department === IMPROVEMENT || department === "Тохижилт үйлчилгээ" || Boolean(session.groupFlags?.improvementManager);
  if (!allowed) return { error: Response.json({ error: "Тохижилтын тооцоолол ашиглах эрхгүй байна." }, { status: 403 }) };
  if (write && !["system_admin", "director", "general_manager", "project_manager"].includes(session.role) && !session.groupFlags?.improvementManager) return { error: Response.json({ error: "Тооцоолол засах эрхгүй байна." }, { status: 403 }) };
  return { session };
}
function errorResponse(error: unknown) { console.error(error); return Response.json({ error: error instanceof Error ? error.message : "Үйлдэл амжилтгүй." }, { status: 500 }); }

export async function GET(request: Request) {
  const auth = await authorize(); if ("error" in auth) return auth.error;
  const query = new URL(request.url).searchParams;
  try {
    if (query.get("resource") === "materials") return Response.json(await listMaterials(auth.session!, query));
    if (query.get("resource") === "prices") return Response.json(await rpc(auth.session!, PRICE_MODEL, "search_read", [[]], { fields: ["material_id", "old_price", "price", "effective_date", "source", "changed_by", "create_date"], order: "effective_date desc, id desc", limit: 1000 }));
    if (query.get("resource") === "packages") { const packageId = Number(query.get("package_id")); return Response.json(packageId ? await getWorkPackage(auth.session!, packageId) : await listWorkPackages(auth.session!, query)); }
    if (query.get("resource") === "labor_rates") return Response.json(await listLaborRates(auth.session!));
    if (query.get("resource") === "labor_history") return Response.json(await rpc(auth.session!, LABOR_HISTORY_MODEL, "search_read", [[]], { fields: ["labor_rate_id", "old_rate", "rate", "effective_date", "changed_by"], order: "effective_date desc, id desc", limit: 1000 }));
    const id = Number(query.get("id"));
    return Response.json(id > 0 ? await getCalculation(auth.session!, id) : await listCalculations(auth.session!, query));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await authorize(true); if ("error" in auth) return auth.error;
  try {
    const body = await request.json();
    if (body.action === "copy") return Response.json({ id: await rpc<number>(auth.session!, "municipal.calculation", "copy", [Number(body.id)], {}) });
    if (body.action === "copy_package") return Response.json({ id: await rpc<number>(auth.session!, PACKAGE_MODEL, "copy", [Number(body.id)], {}) });
    if (body.resource === "package") return Response.json({ id: await rpc<number>(auth.session!, PACKAGE_MODEL, "create", [workPackageValues(body)]) }, { status: 201 });
    if (body.resource === "labor_rate") { if (auth.session!.role !== "system_admin") return Response.json({ error: "Ажлын хөлсний санг зөвхөн администратор өөрчилнө." }, { status: 403 }); return Response.json({ id: await rpc<number>(auth.session!, LABOR_RATE_MODEL, "create", [{ name: body.name, unit: body.unit, current_rate: Number(body.current_rate || 0), active: body.active !== false }]) }); }
    if (body.resource === "material") {
      if (auth.session!.role !== "system_admin") return Response.json({ error: "Материалын санг зөвхөн администратор өөрчилнө." }, { status: 403 });
      return Response.json({ id: await rpc<number>(auth.session!, MATERIAL_MODEL, "create", [{ name: body.name, category: body.category, unit: body.unit, current_price: Number(body.current_price || 0), price_source: "Гараар оруулсан үнэ", price_effective_date: new Date().toISOString().slice(0, 10), description: body.description || false, active: body.active !== false }]) });
    }
    if (body.resource === "package") return Response.json({ ok: await rpc<boolean>(auth.session!, PACKAGE_MODEL, "write", [[Number(body.id)], workPackageUpdateValues(body)]) });
    if (body.resource === "labor_rate") { if (auth.session!.role !== "system_admin") return Response.json({ error: "Ажлын хөлсний санг зөвхөн администратор өөрчилнө." }, { status: 403 }); return Response.json({ ok: await rpc<boolean>(auth.session!, LABOR_RATE_MODEL, "write", [[Number(body.id)], { name: body.name, unit: body.unit, current_rate: Number(body.current_rate || 0), active: body.active !== false }]) }); }
    return Response.json({ id: await createCalculation(auth.session!, body as CalculationPayload) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  const auth = await authorize(true); if ("error" in auth) return auth.error;
  try {
    const body = await request.json();
    if (body.resource === "package") return Response.json({ ok: await rpc<boolean>(auth.session!, PACKAGE_MODEL, "write", [[Number(body.id)], workPackageUpdateValues(body)]) });
    if (body.resource === "labor_rate") { if (auth.session!.role !== "system_admin") return Response.json({ error: "Ажлын хөлсний санг зөвхөн администратор өөрчилнө." }, { status: 403 }); return Response.json({ ok: await rpc<boolean>(auth.session!, LABOR_RATE_MODEL, "write", [[Number(body.id)], { name: body.name, unit: body.unit, current_rate: Number(body.current_rate || 0), active: body.active !== false }]) }); }
    if (body.resource === "material") {
      if (auth.session!.role !== "system_admin") return Response.json({ error: "Материалын санг зөвхөн администратор өөрчилнө." }, { status: 403 });
      return Response.json({ ok: await rpc<boolean>(auth.session!, MATERIAL_MODEL, "write", [[Number(body.id)], { name: body.name, category: body.category, unit: body.unit, current_price: Number(body.current_price || 0), price_source: "Гараар шинэчилсэн үнэ", price_effective_date: new Date().toISOString().slice(0, 10), description: body.description || false, active: body.active !== false }]) });
    }
    return Response.json({ ok: await updateCalculation(auth.session!, Number(body.id), body as CalculationPayload) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  const auth = await authorize(true); if ("error" in auth) return auth.error;
  try { const query = new URL(request.url).searchParams; const id = Number(query.get("id")); return Response.json({ ok: await rpc<boolean>(auth.session!, query.get("resource") === "package" ? PACKAGE_MODEL : "municipal.calculation", "unlink", [[id]]) }); }
  catch (error) { return errorResponse(error); }
}
