import { promises as fs } from "node:fs";
import path from "node:path";
import { requireSession } from "@/lib/auth";
import { canAccessChatAttachment, getChatSnapshot } from "@/lib/chat-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(); const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await canAccessChatAttachment(session.uid, id))) return new Response("Not found", { status: 404 });
  const snapshot = await getChatSnapshot(session.uid); const attachment = snapshot.messages.find((item) => item.attachment?.id === id)?.attachment;
  if (!attachment) return new Response("Not found", { status: 404 });
  const data = await fs.readFile(path.join(process.cwd(), "data", "chat-media", id)).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data, { headers: { "Content-Type": attachment.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`, "Cache-Control": "private, max-age=3600" } });
}
