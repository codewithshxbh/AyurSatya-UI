import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_CLASS_LABELS, createPredictionResult, displayClassLabel, humanizeUserText } from "../lib/prediction-result.js";

const mappingPath = path.join(process.cwd(), "ml", "artifacts", "class_to_index.json");

test("JavaScript class allowlist matches the 12 required labels in checkpoint order", () => {
  assert.deepEqual(SUPPORTED_CLASS_LABELS, [
    "Kalanchoe_Healthy",
    "Kalanchoe_Web_Blight",
    "Kalanchoe_Yellow",
    "Kalanchoe_Yellow_Blight",
    "Neem_Healthy",
    "Neem_Spot",
    "Neem_Web_Blight",
    "Neem_Yellow",
    "Tulsi_Downy_Mildew",
    "Tulsi_Healthy",
    "Tulsi_Web_Blight",
    "Tulsi_Yellow_Spot",
  ]);
});

test("local class_to_index.json matches the allowlist and contiguous indices", {
  skip: !fs.existsSync(mappingPath)
}, () => {
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
  assert.deepEqual(Object.keys(mapping).sort(), [...SUPPORTED_CLASS_LABELS].sort());
  for (const [index, label] of SUPPORTED_CLASS_LABELS.entries()) {
    assert.equal(mapping[label], index);
  }
});

test("automatic detection maps each class to crop and condition without a selected crop", () => {
  for (const className of SUPPORTED_CLASS_LABELS) {
    const result = createPredictionResult({ className, confidence: 0.8, gradcamDataUrl: "" }, "colab");
    assert.equal(result.crop, className.split("_")[0]);
    assert.equal(result.condition, className.split("_").slice(1).join(" "));
    assert.equal(result.healthy, result.condition === "Healthy");
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  }
});

test("user-facing class labels never keep dataset underscores", () => {
  assert.equal(displayClassLabel("Tulsi_Downy_Mildew"), "Tulsi Downy Mildew");
  assert.equal(displayClassLabel("Neem_Web_Blight"), "Neem Web Blight");
  assert.equal(
    humanizeUserText("Those findings are not treated here as proof that a Tulsi_Downy_Mildew prediction is P. belbahrii."),
    "Those findings are not treated here as proof that a Tulsi Downy Mildew prediction is P. belbahrii."
  );
  assert.equal(humanizeUserText("disease_context"), "disease context");
});

test("invalid model classes and non-finite confidence are rejected", () => {
  const invalid = createPredictionResult({ className: "Mango_Healthy", confidence: 0.99, gradcamDataUrl: "" }, "colab");
  assert.equal(invalid.crop, null);
  assert.equal(invalid.model.status, "prediction_unavailable");
  const nonFinite = createPredictionResult({ className: "Neem_Healthy", confidence: Number.NaN, gradcamDataUrl: "" }, "colab");
  assert.equal(nonFinite.confidence, null);
});
