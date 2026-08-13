import { requireSession } from "@/lib/auth";
import { getChatSnapshot } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession();
  const encoder = new TextEncoder();
  let signature = "";
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const emit = async () => {
        try {
          const snapshot = await getChatSnapshot(session.uid);
          const next = snapshot.messages.at(-1)?.id || "empty";
          if (next !== signature) {
            signature = next;
            controller.enqueue(encoder.encode(`event: chat\ndata: ${JSON.stringify({ latestId: next })}\n\n`));
          } else {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }
        } catch { /* connection cleanup handles closed streams */ }
      };
      await emit();
      timer = setInterval(() => void emit(), 1500);
    },
    cancel() { if (timer) clearInterval(timer); },
  });
  request.signal.addEventListener("abort", () => { if (timer) clearInterval(timer); }, { once: true });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
