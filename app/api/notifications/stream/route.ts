import { authorize } from "@/lib/auth";
import { notificationSignature } from "@/lib/notifications";

/**
 * Server-sent notification stream.
 *
 * The database is the source of truth, so the stream is a thin change feed: it
 * re-reads a cheap signature (row count, newest timestamp, unread count) and
 * pushes it when it moves. Nothing is stored in memory that a reload would
 * lose, and a dropped connection simply reconnects with the latest state.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });
  const userId = auth.user.id;
  const encoder = new TextEncoder();
  let poll: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      let last = "";
      try {
        const initial = notificationSignature(userId);
        last = JSON.stringify(initial);
        send("ready", initial);
      } catch {
        send("ready", { total: 0, latest: null, unread: 0 });
      }

      poll = setInterval(() => {
        if (closed) return;
        try {
          const signature = notificationSignature(userId);
          const key = JSON.stringify(signature);
          if (key !== last) {
            last = key;
            send("notifications", signature);
          }
        } catch {
          // A transient database error must not tear down the stream.
        }
      }, 4_000);

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (poll) clearInterval(poll);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      });
    },
    cancel() {
      if (poll) clearInterval(poll);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
