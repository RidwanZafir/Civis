import fs from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
export const UPLOAD_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

/** A report may only attach files successfully uploaded by its authenticated reporter. */
export async function ownsUploads(userId: string, urls: string[]): Promise<boolean> {
  if (new Set(urls).size !== urls.length) return false;
  const checks = await Promise.all(urls.map(async (url) => {
    const match = /^\/api\/media\/([a-zA-Z0-9-]+\.(?:jpg|png|webp|mp4|webm|mov))$/.exec(url);
    if (!match) return false;
    try {
      const metadata = JSON.parse(await fs.readFile(path.join(UPLOAD_DIR, `${match[1]}.json`), "utf8"));
      const file = await fs.stat(path.join(UPLOAD_DIR, match[1]));
      return metadata.userId === userId && file.isFile() && file.size > 0;
    } catch { return false; }
  }));
  return checks.every(Boolean);
}
