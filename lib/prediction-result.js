export const SUPPORTED_CLASS_LABELS = [
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
];

export const SUPPORTED_CROPS = {
  Neem: { scientific: "Azadirachta indica", family: "Meliaceae" },
  Tulsi: { scientific: "Ocimum tenuiflorum", family: "Lamiaceae" },
  Kalanchoe: { scientific: "Kalanchoe pinnata", family: "Crassulaceae" }
};

const MIN_HEATMAP_PAYLOAD = 32;

const SNAKE_CASE_TOKEN = /\b[A-Za-z]+(?:_[A-Za-z0-9]+)+\b/g;

export function parsePredictedClass(className) {
  const rawClassName = typeof className === "string" ? className.trim() : "";
  const normalizedClassName = rawClassName.replace(/\s+/g, "_");
  const canonicalClassName = normalizedClassName
    .split("_")
    .map((part) => part.toLowerCase())
    .join("_");
  const supportedClassName = SUPPORTED_CLASS_LABELS.find(
    (label) => label.toLowerCase() === canonicalClassName
  );
  if (!supportedClassName) return null;
  const [crop, ...conditionParts] = supportedClassName.split("_");
  const condition = conditionParts.join(" ");
  return {
    className: supportedClassName,
    crop,
    condition,
    healthy: condition.toLowerCase() === "healthy",
    scientific: SUPPORTED_CROPS[crop]?.scientific || null,
    family: SUPPORTED_CROPS[crop]?.family || null
  };
}

export function displayClassLabel(className) {
  const parsed = parsePredictedClass(className);
  if (parsed) return `${parsed.crop} ${parsed.condition}`;
  return typeof className === "string" ? className.replaceAll("_", " ").replace(/\s+/g, " ").trim() : "";
}

export function humanizeUserText(value) {
  if (typeof value !== "string" || !value) return value;
  return value.replace(SNAKE_CASE_TOKEN, (token) => displayClassLabel(token));
}

export function isGenuineHeatmap(value) {
  if (typeof value !== "string") return false;
  if (!value.startsWith("data:image/png;base64,") && !value.startsWith("data:image/jpeg;base64,")) {
    return false;
  }
  const payload = value.slice(value.indexOf(",") + 1);
  return payload.length >= MIN_HEATMAP_PAYLOAD && /^[A-Za-z0-9+/=]+$/.test(payload);
}

export function createPredictionResult(prediction, provider = "colab") {
  const parsed = parsePredictedClass(prediction?.className);
  const confidence = prediction?.confidence;
  const validConfidence =
    typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1;

  if (!parsed || !validConfidence) {
    console.error("Incompatible EfficientNet prediction", {
      rawClassName: prediction?.className,
      confidence: prediction?.confidence,
      provider
    });
    return createUnavailableModelResult(
      "The inference result did not contain a valid class label and confidence for the 12 supported classes.",
      "prediction_unavailable",
      provider
    );
  }

  const hasGradcam = isGenuineHeatmap(prediction?.gradcamDataUrl);

  return {
    className: parsed.className,
    crop: parsed.crop,
    disease: parsed.condition,
    condition: parsed.condition,
    healthy: parsed.healthy,
    scientificName: parsed.scientific,
    family: parsed.family,
    confidence,
    summary: `EfficientNet-B0 classified this leaf as ${parsed.crop} / ${parsed.condition}. Automatic identification currently supports only Neem, Tulsi, and Kalanchoe.`,
    explanation: parsed.healthy
      ? "The predicted class is a supported healthy-leaf label. This is not a taxonomic identification of arbitrary plants."
      : "The predicted class is a supported condition label from the 12-class checkpoint. Class names such as Yellow or Spot are model labels and are not confirmed pathogen diagnoses.",
    evidence: [],
    limitations:
      "This diagnostic checkpoint is not a medical or agronomic confirmation. Softmax confidence is not a calibrated probability, and the model cannot identify unsupported plant species.",
    model: {
      provider: "EfficientNet-B0",
      inferenceProvider: provider,
      status: "diagnostic_checkpoint",
      checkpoint: "best_efficientnet_b0.pt",
      runtime: "hosted"
    },
    explainability: hasGradcam
      ? {
          status: "available",
          message: "Grad-CAM generated from the final EfficientNet-B0 feature layer. Highlighted regions influenced the predicted class; they do not prove a causal diagnosis.",
          heatmap: prediction.gradcamDataUrl
        }
      : {
          status: "unavailable",
          message: "The hosted prediction completed, but Grad-CAM is unavailable for this inference response."
        }
  };
}

export function createUnavailableModelResult(reason, status = "prediction_unavailable", provider) {
  return {
    className: null,
    crop: null,
    disease: null,
    condition: null,
    healthy: null,
    scientificName: null,
    family: null,
    confidence: null,
    summary: "No compatible prediction was produced for this image.",
    explanation: reason,
    evidence: [],
    limitations: "No crop, condition, confidence, or heatmap is shown without validated model inference.",
    model: {
      provider: "EfficientNet-B0",
      inferenceProvider: provider,
      status,
      checkpoint: status === "not_configured" ? null : "best_efficientnet_b0.pt"
    },
    explainability: {
      status: status === "invalid_image" ? "unavailable" : "pending_efficientnet",
      message:
        status === "invalid_image"
          ? "Grad-CAM was not generated because the image could not be decoded."
          : "Grad-CAM requires the trained EfficientNet-B0 checkpoint."
    }
  };
}
