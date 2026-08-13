import { requireSession } from "@/lib/auth";
import { getChatSnapshot } from "@/lib/chat-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  const snapshot = await getChatSnapshot(session.uid);
  const unread = snapshot.messages.filter((message) => !message.readBy.includes(session.uid)).length;
  return Response.json({ unread });
}
