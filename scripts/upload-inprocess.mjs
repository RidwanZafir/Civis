/**
 * Exercise the real upload, media and report handlers without opening a network connection.
 * Uses an isolated temporary SQLite database and storage directory. Only Next's request-cookie
 * context is supplied by a test adapter; authentication, SQL, multipart parsing and handlers are real.
 * Run from the project root: node scripts/upload-inprocess.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { File } from "node:buffer";

const workspace = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "civis-upload-inprocess-"));
const output = path.join(temp, "compiled");
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;
const rootModule = new Module(path.join(workspace, "scripts", "upload-inprocess.mjs"));
rootModule.filename = path.join(workspace, "scripts", "upload-inprocess.mjs");
rootModule.paths = Module._nodeModulePaths(workspace);
let db;
let currentSession;
let passed = 0;

async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

try {
  fs.writeFileSync(path.join(temp, "tsconfig.json"), JSON.stringify({
    extends: path.join(workspace, "tsconfig.json"),
    compilerOptions: { noEmit: false, noEmitOnError: true, incremental: false, module: "Node16", moduleResolution: "Node16", rootDir: workspace, outDir: output },
    files: ["app/api/upload/route.ts", "app/api/media/[file]/route.ts", "app/api/reports/route.ts", "lib/auth.ts", "lib/repo.ts"].map((file) => path.join(workspace, file)),
    include: [],
  }));
  const compile = spawnSync(process.execPath, [path.join(workspace, "node_modules/typescript/bin/tsc"), "--project", path.join(temp, "tsconfig.json")], { encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  fs.mkdirSync(path.join(temp, "lib"));
  fs.copyFileSync(path.join(workspace, "lib/schema.sql"), path.join(temp, "lib/schema.sql"));
  if (fs.existsSync(path.join(workspace, "lib/emergency/schema.sql"))) {
    fs.mkdirSync(path.join(temp, "lib/emergency"));
    fs.copyFileSync(path.join(workspace, "lib/emergency/schema.sql"), path.join(temp, "lib/emergency/schema.sql"));
  }
  process.chdir(temp);
  globalThis.File ??= File;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith("@/")) return originalResolve.call(this, path.join(output, request.slice(2)), parent, isMain, options);
    try { return originalResolve.call(this, request, parent, isMain, options); }
    catch (error) {
      if (request.startsWith(".") || path.isAbsolute(request)) throw error;
      return originalResolve.call(this, request, rootModule, isMain, options);
    }
  };
  Module._load = function (request, parent, isMain) {
    if (request === "next/headers") return {
      cookies: async () => ({ get: (name) => name === "civis_session" && currentSession ? { name, value: currentSession } : undefined }),
    };
    return originalLoad.call(this, request, parent, isMain);
  };

  db = require(path.join(output, "lib/db.js"));
  const auth = require(path.join(output, "lib/auth.js"));
  const repository = require(path.join(output, "lib/repo.js"));
  const upload = require(path.join(output, "app/api/upload/route.js"));
  const media = require(path.join(output, "app/api/media/[file]/route.js"));
  const reports = require(path.join(output, "app/api/reports/route.js"));
  const ownership = require(path.join(output, "lib/upload-server.js"));
  const userId = "usr_ananya";
  const reporterSession = auth.createSession(userId).token;
  currentSession = reporterSession;
  const storage = path.join(temp, "data", "uploads");
  const diskFiles = () => fs.existsSync(storage) ? fs.readdirSync(storage).sort() : [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfX8AAAAASUVORK5CYII=", "base64");
  const image = (index = 0) => ({ bytes: png, type: "image/png", name: `photo-${index + 1}.png` });
  async function uploadFiles(files) {
    const body = new FormData();
    for (const file of files) body.append("files", new File([file.bytes], file.name, { type: file.type }));
    const response = await upload.POST(new Request("https://civis.test/api/upload", { method: "POST", body }));
    return { response, data: await response.json() };
  }
  function reportRequest(images) {
    return new Request("https://civis.test/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: "Three photos regression check", description: "This temporary automated report checks persistence of three uploaded images in the real SQL database.",
      category: "roads", severity: "low", lat: 0, lng: 0, images, confirmDistinct: true,
    }) });
  }

  const three = await uploadFiles([image(0), image(1), image(2)]);
  await check("actual handler atomically uploads three photos and returns distinct usable URLs", () => {
    assert.equal(three.response.status, 201);
    assert.equal(three.data.urls.length, 3);
    assert.equal(new Set(three.data.urls).size, 3);
    assert.equal(diskFiles().length, 6); // Three media files plus their ownership metadata.
    for (const url of three.data.urls) assert.match(url, /^\/api\/media\/[\w-]+\.png$/);
  });
  await check("real authenticated ownership metadata authorizes all three files", async () => assert.equal(await ownership.ownsUploads(userId, three.data.urls), true));
  await check("actual media handler reads uploaded bytes and correct content type", async () => {
    const response = await media.GET(new Request("https://civis.test/media"), { params: Promise.resolve({ file: three.data.urls[0].split("/").pop() }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  });
  await check("actual media handler supports byte ranges for native playback", async () => {
    const response = await media.GET(new Request("https://civis.test/media", { headers: { Range: "bytes=0-7" } }), { params: Promise.resolve({ file: three.data.urls[0].split("/").pop() }) });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 0-7/${png.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png.subarray(0, 8));
  });
  await check("actual media handler rejects traversal and invalid ranges", async () => {
    const traversal = await media.GET(new Request("https://civis.test/media"), { params: Promise.resolve({ file: "../civis.db" }) });
    assert.equal(traversal.status, 404);
    const range = await media.GET(new Request("https://civis.test/media", { headers: { Range: "bytes=999999-" } }), { params: Promise.resolve({ file: three.data.urls[0].split("/").pop() }) });
    assert.equal(range.status, 416);
  });
  await check("a mismatched second file fails the batch without saving its valid first file", async () => {
    const before = diskFiles();
    const result = await uploadFiles([image(4), { bytes: png, type: "image/jpeg", name: "renamed.jpg" }]);
    assert.equal(result.response.status, 415);
    assert.deepEqual(diskFiles(), before);
  });
  await check("unsupported type, empty file, oversized image and excess file count stay rejected", async () => {
    const before = diskFiles();
    assert.equal((await uploadFiles([{ bytes: Buffer.from("svg"), type: "image/svg+xml", name: "bad.svg" }])).response.status, 415);
    assert.equal((await uploadFiles([{ bytes: Buffer.alloc(0), type: "image/png", name: "empty.png" }])).response.status, 422);
    assert.equal((await uploadFiles([{ bytes: Buffer.alloc(8 * 1024 * 1024 + 1), type: "image/png", name: "large.png" }])).response.status, 413);
    assert.equal((await uploadFiles(Array.from({ length: 7 }, (_, index) => image(index)))).response.status, 422);
    assert.deepEqual(diskFiles(), before);
  });
  await check("actual authentication rejects an anonymous upload and leaves storage untouched", async () => {
    currentSession = undefined;
    const before = diskFiles();
    assert.equal((await uploadFiles([image()])).response.status, 401);
    assert.deepEqual(diskFiles(), before);
    currentSession = reporterSession;
  });
  await check("another real account cannot save this reporter's attachments", async () => {
    currentSession = auth.createSession("usr_rahul").token;
    const result = await reports.POST(reportRequest(three.data.urls));
    assert.equal(result.status, 422);
    currentSession = reporterSession;
  });
  await check("missing and duplicate attachment URLs cannot be saved", async () => {
    assert.equal((await reports.POST(reportRequest(["/api/media/missing.png"]))).status, 422);
    assert.equal((await reports.POST(reportRequest([three.data.urls[0], three.data.urls[0]]))).status, 422);
  });
  let reportId;
  await check("actual report POST saves all three successful attachments to the isolated SQL database", async () => {
    const response = await reports.POST(reportRequest(three.data.urls));
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    reportId = result.id;
    assert.ok(reportId);
  });
  await check("actual repository still reads all three attachments after report creation", () => {
    const detail = repository.reportDetail(reportId);
    assert.deepEqual(detail.images.map((item) => item.url).sort(), three.data.urls.slice().sort());
    assert.equal(db.get("SELECT COUNT(*) AS n FROM report_images WHERE report_id = ?", [reportId]).n, 3);
  });
  await check("empty optional attachment arrays still create a valid report", async () => {
    const response = await reports.POST(reportRequest([]));
    assert.equal(response.status, 201, await response.text());
  });
  console.log(`${passed} HTTP-free handler integration checks passed; production database and uploads were not modified.`);
} finally {
  Module._load = originalLoad;
  Module._resolveFilename = originalResolve;
  if (db) db.getDb().close();
  delete globalThis.__civisDb;
  process.chdir(workspace);
  const resolved = fs.realpathSync(temp);
  const allowedParent = fs.realpathSync(os.tmpdir()) + path.sep;
  assert.ok(resolved.startsWith(allowedParent) && path.basename(resolved).startsWith("civis-upload-inprocess-"));
  fs.rmSync(resolved, { recursive: true, force: true });
}
