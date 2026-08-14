import { promises as fs } from "node:fs";
import path from "node:path";
import { getSessionRoleLabel, requireSession } from "@/lib/auth";
import { addChatMessage, createChatConversation, deleteChatMessage, getChatRecipientIds, getChatSnapshot, markChatRead, updateChatPresence } from "@/lib/chat-store";
import { loadHrEmployeeDirectory } from "@/lib/odoo";
import { notifyPushEvent } from "@/lib/push-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTORY_CACHE_TTL_MS = 5 * 60 * 1000;
type ChatDirectoryEmployee = { id: number; name: string; department: string; jobTitle: string; photoUrl: string };
let directoryCache: { expiresAt: number; employees: ChatDirectoryEmployee[] } | null = null;

async function directory(): Promise<ChatDirectoryEmployee[]> {
  if (directoryCache && directoryCache.expiresAt > Date.now()) {
    return directoryCache.employees;
  }
  const employees = await loadHrEmployeeDirectory().catch(() => []);
  const mapped = employees.filter((item) => item.active && item.userId).map((item) => ({
    id: item.userId as number, name: item.name, department: item.departmentName,
    jobTitle: item.jobTitle, photoUrl: item.photoUrl,
  }));
  directoryCache = { expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS, employees: mapped };
  return mapped;
}

export async function GET(request: Request) {
  const session = await requireSession();
  const view = new URL(request.url).searchParams.get("view");
  if (view === "directory") {
    return Response.json({ employees: await directory(), currentUserId: session.uid });
  }
  if (view === "snapshot") {
    const snapshot = await getChatSnapshot(session.uid);
    return Response.json({ ...snapshot, currentUserId: session.uid });
  }
  const [snapshot, employees] = await Promise.all([getChatSnapshot(session.uid), directory()]);
  return Response.json({ ...snapshot, employees, currentUserId: session.uid });
}

export async function POST(request: Request) {
  const session = await requireSession();
  const input = await request.json() as { action?: string; conversationId?: string; messageId?: string; body?: string; memberIds?: number[]; name?: string };
  try {
    if (input.action === "presence") {
      await updateChatPresence(session.uid);
      return Response.json({ ok: true });
    }
    if (input.action === "conversation") {
      const validIds = new Set((await directory()).map((item) => item.id));
      const memberIds = (input.memberIds ?? []).map(Number).filter((id) => validIds.has(id));
      return Response.json({ conversation: await createChatConversation({ userId: session.uid, memberIds, name: input.name }) });
    }
    if (input.action === "read" && input.conversationId) {
      await markChatRead(session.uid, input.conversationId);
      return Response.json({ ok: true });
    }
    if (input.action === "delete" && input.messageId) {
      const message = await deleteChatMessage(session.uid, input.messageId);
      if (message.attachment?.id) await fs.unlink(path.join(process.cwd(), "data", "chat-media", message.attachment.id)).catch(() => undefined);
      return Response.json({ ok: true });
    }
    if (input.action === "message" && input.conversationId) {
      const message = await addChatMessage({ userId: session.uid, author: session.name, roleLabel: getSessionRoleLabel(session), conversationId: input.conversationId, body: input.body ?? "" });
      const employees = await directory();
      const userIds = await getChatRecipientIds(input.conversationId, session.uid, employees.map((item) => item.id));
      if (userIds.length) await notifyPushEvent({ eventType: "chat_message", title: session.name, body: message.body || "Хавсралт илгээлээ.", targetUrl: "/chat", userIds }).catch((error) => console.warn("Chat push failed:", error));
      return Response.json({ message });
    }
    return Response.json({ error: "Буруу хүсэлт байна." }, { status: 400 });
  } catch (error) {
    const denied = error instanceof Error && ["CHAT_ACCESS_DENIED", "CHAT_DELETE_DENIED"].includes(error.message);
    return Response.json({ error: denied ? "Энэ чатад хандах эрхгүй байна." : "Хүсэлтийг гүйцэтгэж чадсангүй." }, { status: denied ? 403 : 400 });
  }
}
