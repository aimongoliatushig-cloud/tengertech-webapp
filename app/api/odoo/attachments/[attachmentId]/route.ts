import { getSession } from "@/lib/auth";
import { fetchOdooAttachmentContent } from "@/lib/odoo";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    attachmentId: string;
  }>;
};

function inferAttachmentContentType(name: string, mimetype: string) {
  const normalizedType = mimetype.trim().toLowerCase();
  if (normalizedType && normalizedType !== "application/octet-stream") {
    return mimetype;
  }

  const normalizedName = name.trim().toLowerCase();
  if (normalizedName.endsWith(".pdf")) return "application/pdf";
  if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) return "image/jpeg";
  if (normalizedName.endsWith(".png")) return "image/png";
  if (normalizedName.endsWith(".webp")) return "image/webp";
  if (normalizedName.endsWith(".gif")) return "image/gif";
  if (normalizedName.endsWith(".mp3")) return "audio/mpeg";
  if (normalizedName.endsWith(".wav")) return "audio/wav";
  if (normalizedName.endsWith(".m4a")) return "audio/mp4";
  return mimetype || "application/octet-stream";
}

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
  const contentType = inferAttachmentContentType(attachment.name, attachment.mimetype);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    },
  });
}
