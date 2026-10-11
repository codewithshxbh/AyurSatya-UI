import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getInferenceAvailability, runEfficientNetInference } from "../lib/model-inference.js";

const root = process.cwd();
const pythonPath = process.platform === "win32"
  ? path.join(root, ".venv", "Scripts", "python.exe")
  : path.join(root, ".venv", "bin", "python");
const checkpointReady = fs.existsSync(pythonPath)
  && fs.existsSync(path.join(root, "ml", "artifacts", "best_efficientnet_b0.pt"));
const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("disables local inference explicitly in Vercel", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  assert.deepEqual(getInferenceAvailability(), {
    available: false,
    reason: "EfficientNet-B0 inference is not available in the Vercel runtime."
  });
  if (previous === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previous;
});

test("rejects malformed image data", async () => {
  if (!checkpointReady) return;
  await assert.rejects(() => runEfficientNetInference("not-an-image"), /data URL|inference failed|could not be decoded/i);
});

test("returns a mapped class, confidence, and genuine Grad-CAM data URL", { skip: !checkpointReady }, async () => {
  const result = await runEfficientNetInference(onePixelPng);
  const mapping = JSON.parse(fs.readFileSync(path.join(root, "ml", "artifacts", "class_to_index.json"), "utf8"));
  assert.ok(Object.hasOwn(mapping, result.className));
  assert.equal(typeof result.confidence, "number");
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
  assert.match(result.gradcamDataUrl, /^data:image\/png;base64,/);
});
