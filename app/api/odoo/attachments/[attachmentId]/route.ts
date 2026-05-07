import { getSession } from "@/lib/auth";
import { fetchOdooAttachmentContent } from "@/lib/odoo";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    attachmentId: string;
  }>;
};

function resolveContentType(name: string, mimetype: string, body: Buffer) {
  const normalizedName = name.toLowerCase();
  const normalizedType = mimetype.toLowerCase();
  if (normalizedType && normalizedType !== "application/octet-stream") {
    return mimetype;
  }
  if (normalizedName.endsWith(".pdf") || body.subarray(0, 4).toString("utf8") === "%PDF") {
    return "application/pdf";
  }
  return mimetype || "application/octet-stream";
}

export async function GET(request: Request, context: RouteContext) {
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
  const contentType = resolveContentType(attachment.name, attachment.mimetype, body);
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    },
  });
}
