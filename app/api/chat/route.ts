import { getSessionRoleLabel, requireSession } from "@/lib/auth";
import { addChatMessage, createChatConversation, getChatSnapshot, markChatRead } from "@/lib/chat-store";
import { loadHrEmployeeDirectory } from "@/lib/odoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function directory() {
  const employees = await loadHrEmployeeDirectory().catch(() => []);
  return employees.filter((item) => item.active && item.userId).map((item) => ({
    id: item.userId as number, name: item.name, department: item.departmentName,
    jobTitle: item.jobTitle, photoUrl: item.photoUrl,
  }));
}

export async function GET() {
  const session = await requireSession();
  const [snapshot, employees] = await Promise.all([getChatSnapshot(session.uid), directory()]);
  return Response.json({ ...snapshot, employees, currentUserId: session.uid });
}

export async function POST(request: Request) {
  const session = await requireSession();
  const input = await request.json() as { action?: string; conversationId?: string; body?: string; memberIds?: number[]; name?: string };
  try {
    if (input.action === "conversation") {
      const validIds = new Set((await directory()).map((item) => item.id));
      const memberIds = (input.memberIds ?? []).map(Number).filter((id) => validIds.has(id));
      return Response.json({ conversation: await createChatConversation({ userId: session.uid, memberIds, name: input.name }) });
    }
    if (input.action === "read" && input.conversationId) {
      await markChatRead(session.uid, input.conversationId);
      return Response.json({ ok: true });
    }
    if (input.action === "message" && input.conversationId) {
      const message = await addChatMessage({ userId: session.uid, author: session.name, roleLabel: getSessionRoleLabel(session), conversationId: input.conversationId, body: input.body ?? "" });
      return Response.json({ message });
    }
    return Response.json({ error: "Буруу хүсэлт байна." }, { status: 400 });
  } catch (error) {
    const denied = error instanceof Error && error.message === "CHAT_ACCESS_DENIED";
    return Response.json({ error: denied ? "Энэ чатад хандах эрхгүй байна." : "Хүсэлтийг гүйцэтгэж чадсангүй." }, { status: denied ? 403 : 400 });
  }
}
