import { getSession } from "@/lib/auth";
import type { AppSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function jsonError(message = "Мэдээлэл ачаалж чадсангүй.", status = 500) {
  return Response.json({ error: message }, { status });
}

export async function withSession<T>(handler: (session: AppSession) => Promise<T>) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  try {
    return Response.json(await handler(session));
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Мэдээлэл ачаалж чадсангүй.";
    const status = message.includes("эрх") ? 403 : 500;
    return jsonError(message, status);
  }
}

export function numberParam(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function formFiles(formData: FormData, name = "file") {
  return formData.getAll(name).filter((value): value is File => value instanceof File && value.size > 0);
}
