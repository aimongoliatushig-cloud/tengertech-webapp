import { uploadPointProof } from "@/lib/garbage-routes";
import { formFiles, jsonError, numberParam, withSession } from "../../../_utils";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const stopLineId = numberParam(id);
  if (!stopLineId) {
    return jsonError("Маршрут олдсонгүй.", 404);
  }
  const formData = await request.formData();
  const file = formFiles(formData)[0];
  if (!file) {
    return jsonError("Зураг хавсаргах үед алдаа гарлаа.", 400);
  }
  return withSession((session) => uploadPointProof(session, stopLineId, "after", file));
}
