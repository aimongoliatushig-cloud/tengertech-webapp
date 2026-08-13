import { promises as fs } from "node:fs";
import path from "node:path";
import { getSessionRoleLabel, requireSession } from "@/lib/auth";
import { addChatMessage, getChatRecipientIds } from "@/lib/chat-store";
import { loadHrEmployeeDirectory } from "@/lib/odoo";
import { notifyPushEvent } from "@/lib/push-notifications";

export const runtime = "nodejs";
const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|gif)|audio\/(webm|ogg|mpeg|mp4|wav)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|text\/plain)$/;

export async function POST(request: Request) {
  const session = await requireSession();
  const form = await request.formData();
  const file = form.get("file");
  const conversationId = String(form.get("conversationId") || "");
  const body = String(form.get("body") || "");
  if (!(file instanceof File) || !conversationId || file.size <= 0 || file.size > MAX_SIZE || !ALLOWED.test(file.type)) return Response.json({ error: "Файлын төрөл эсвэл хэмжээ зөвшөөрөгдөхгүй байна (дээд хэмжээ 15MB)." }, { status: 400 });
  const id = crypto.randomUUID();
  const directory = path.join(process.cwd(), "data", "chat-media");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, id), Buffer.from(await file.arrayBuffer()));
  try {
    const message = await addChatMessage({ userId: session.uid, author: session.name, roleLabel: getSessionRoleLabel(session), conversationId, body, attachment: { id, name: file.name.slice(0, 180), mimeType: file.type, size: file.size } });
    const employees = await loadHrEmployeeDirectory().catch(() => []);
    const allUserIds = employees.flatMap((item) => item.active && item.userId ? [item.userId] : []);
    const userIds = await getChatRecipientIds(conversationId, session.uid, allUserIds);
    if (userIds.length) await notifyPushEvent({ eventType: "chat_message", title: session.name, body: body.trim() || "Зураг, дуу эсвэл файл илгээлээ.", targetUrl: "/chat", userIds }).catch((error) => console.warn("Chat upload push failed:", error));
    return Response.json({ message });
  } catch (error) { await fs.unlink(path.join(directory, id)).catch(() => undefined); throw error; }
}
