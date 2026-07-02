import { getSession } from "@/lib/auth";
import { fetchOdooAttachmentContent } from "@/lib/odoo";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    attachmentId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { attachmentId } = await context.params;
  const numericId = Number(attachmentId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return new Response("Invalid attachment id", { status: 400 });
  }

  const attachment = await fetchOdooAttachmentContent(numericId, {
    login: session.login,
    password: session.password,
  }).catch(() => null);

  if (!attachment?.datas) {
    return new Response("Attachment not found", { status: 404 });
  }

  const body = Buffer.from(attachment.datas, "base64");
  const mimetype = attachment.mimetype?.startsWith("image/")
    ? attachment.mimetype
    : "image/jpeg";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": mimetype,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=600",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        attachment.name || `album-${numericId}.jpg`,
      )}`,
    },
  });
}
