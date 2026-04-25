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
  });

  if (!attachment) {
    return new Response("Attachment not found", { status: 404 });
  }

  const body = Buffer.from(attachment.datas, "base64");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimetype,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    },
  });
}
