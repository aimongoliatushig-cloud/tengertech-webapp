import { getSession } from "@/lib/auth";
import { confirmTrialEmployee, type HrEmployeeTrialConfirmationInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ id: string }>;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

export async function POST(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    const { id } = await ctx.params;
    const formData = await request.formData();
    const input: HrEmployeeTrialConfirmationInput = {
      employeeId: Number(id),
      permanentDate: getString(formData, "permanentDate"),
      orderNumber: getString(formData, "orderNumber"),
      note: getString(formData, "note"),
      files: getFiles(formData, "files"),
    };
    const employee = await confirmTrialEmployee(session, input);
    return Response.json({ employee }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Энэ үйлдлийг зөвхөн хүний нөөцийн мэргэжилтэн хийх эрхтэй.", 403);
    }
    return jsonError(error instanceof Error ? error.message : "Ажилтныг жинхлэхэд алдаа гарлаа.", 400);
  }
}
