import fs from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  // Reject anything that is not a plain uploaded filename.
  if (!/^[a-zA-Z0-9._-]+$/.test(file) || file.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[ext]) return new Response("Not found", { status: 404 });

  try {
    const buffer = await fs.readFile(path.join(UPLOAD_DIR, file));
    const headers = {
      "Content-Type": TYPES[ext],
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(buffer.byteLength),
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = match?.[1] ? Number(match[1]) : 0;
      let end = match?.[2] ? Number(match[2]) : buffer.length - 1;
      if (match && !match[1] && match[2]) {
        start = Math.max(0, buffer.length - Number(match[2]));
        end = buffer.length - 1;
      }
      if (!match || (!match[1] && !match[2]) || start < 0 || start >= buffer.length || end < start) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${buffer.length}` } });
      }
      end = Math.min(end, buffer.length - 1);
      return new Response(new Uint8Array(buffer.subarray(start, end + 1)), {
        status: 206,
        headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${buffer.length}` },
      });
    }
    return new Response(new Uint8Array(buffer), {
      headers,
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
