/** Focused evidence regression checks. Add a running server URL to exercise the real upload/report APIs. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "civis-evidence-test-"));
const compiled = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--ignoreConfig", "lib/report-evidence.ts", "--target", "ES2022", "--module", "commonjs", "--skipLibCheck", "--outDir", temp], { encoding: "utf8" });
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
const require = createRequire(import.meta.url);
const { EVIDENCE, evidenceReady, evidenceValidation, evidenceSignatureMatches, reportStepErrors } = require(path.join(temp, "report-evidence.js"));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const success = Array.from({ length: 3 }, (_, i) => ({ status: "success", url: `/api/media/photo-${i}.jpg` }));
const values = { category: "roads", attachments: success, location: null, title: "", description: "" };

check("three completed uploads can Continue from Evidence without a location", () => assert.deepEqual(reportStepErrors(2, values), {}));
check("location is required only when leaving Location", () => assert.ok(reportStepErrors(3, values).location));
check("details are required only when leaving Details", () => assert.ok(reportStepErrors(4, { ...values, location: { lat: 1, lng: 1 } }).description));
check("optional empty attachments allow Continue", () => assert.equal(evidenceReady([]), true));
check("transfer complete without server acceptance remains blocked", () => assert.equal(evidenceReady([{ status: "uploading", url: "", progress: 100 }]), false));
check("success without a server URL remains blocked", () => assert.equal(evidenceReady([{ status: "success", url: "" }]), false));
check("one failed upload remains blocked until retry or removal", () => assert.ok(reportStepErrors(2, { ...values, attachments: [...success, { status: "error", url: "" }] }).images));
check("wrong file types and empty files are rejected", () => { assert.ok(evidenceValidation({ name: "bad.svg", type: "image/svg+xml", size: 10 })); assert.ok(evidenceValidation({ name: "empty.png", type: "image/png", size: 0 })); });
check("image and video size limits remain enforced", () => { assert.ok(evidenceValidation({ name: "big.jpg", type: "image/jpeg", size: EVIDENCE.imageMaxBytes + 1 })); assert.ok(evidenceValidation({ name: "big.mp4", type: "video/mp4", size: EVIDENCE.videoMaxBytes + 1 })); });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfX8AAAAASUVORK5CYII=", "base64");
check("magic bytes must match the declared MIME type", () => { assert.equal(evidenceSignatureMatches("image/png", png), true); assert.equal(evidenceSignatureMatches("image/jpeg", png), false); assert.equal(evidenceSignatureMatches("video/mp4", png), false); });

const base = process.argv[2];
if (base) {
  const signin = await fetch(`${base}/api/auth/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "citizen@civis.demo", password: "CivisDemo!23" }) });
  assert.equal(signin.status, 200);
  const cookie = signin.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  async function upload(files, authCookie = cookie) {
    const form = new FormData();
    files.forEach((file) => form.append("files", new Blob([file.bytes], { type: file.type }), file.name));
    const response = await fetch(`${base}/api/upload`, { method: "POST", headers: authCookie ? { Cookie: authCookie } : {}, body: form });
    return { status: response.status, data: await response.json() };
  }
  const uploaded = await upload(Array.from({ length: 3 }, (_, i) => ({ bytes: png, type: "image/png", name: `photo-${i + 1}.png` })));
  check("real server accepts three validated photos", () => { assert.equal(uploaded.status, 201); assert.equal(uploaded.data.urls.length, 3); assert.equal(new Set(uploaded.data.urls).size, 3); });
  const wrongMime = await upload([{ bytes: png, type: "image/jpeg", name: "renamed.jpg" }]);
  check("server rejects PNG content declared as JPEG", () => assert.equal(wrongMime.status, 415));
  const anonymousUpload = await upload([{ bytes: png, type: "image/png", name: "anon.png" }], "");
  check("upload requires authentication", () => assert.equal(anonymousUpload.status, 401));
  const fakeAttachment = await fetch(`${base}/api/reports`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ title: "Rejected missing attachment", description: "Checking that missing attachment URLs cannot be saved to a report.", category: "roads", severity: "low", lat: 0, lng: 0, images: ["/api/media/nonexistent.jpg"] }) });
  check("report rejects nonexistent or unowned attachments", () => assert.equal(fakeAttachment.status, 422));
  const created = await fetch(`${base}/api/reports`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evidence regression: three photos", description: "Automated regression check for uploaded photo persistence in a report. This is test data.", category: "roads", severity: "low", lat: 0, lng: 0, images: uploaded.data.urls, confirmDistinct: true }) });
  const report = await created.json();
  check("report saves after three confirmed uploads", () => assert.equal(created.status, 201, JSON.stringify(report)));
  const detail = await fetch(`${base}/api/reports/${report.id}`).then((response) => response.json());
  check("all three attachments remain persisted in the report", () => assert.deepEqual(detail.images.map((image) => image.url).sort(), uploaded.data.urls.slice().sort()));
  const media = await fetch(`${base}${uploaded.data.urls[0]}`, { headers: { Range: "bytes=0-7" } });
  check("media supports byte ranges for native video playback", () => { assert.equal(media.status, 206); assert.equal(media.headers.get("content-range"), `bytes 0-7/${png.length}`); });
  console.log(`Created test report ${report.id}`);
}
// Resolve and verify the generated target before removing this test's private temporary directory.
const resolvedTemp = fs.realpathSync(temp);
assert.ok(resolvedTemp.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
fs.rmSync(resolvedTemp, { recursive: true, force: true });
console.log(`${passed} evidence checks passed`);
