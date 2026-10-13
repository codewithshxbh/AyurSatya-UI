const SUPPORTED_CLASS_LABELS = new Set([
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

export function createPredictionResult(cropName, prediction, provider = "render") {
  const rawClassName =
    typeof prediction?.className === "string"
      ? prediction.className.trim()
      : "";
  const normalizedClassName = rawClassName.replace(/\s+/g, "_");
  const [predictedCrop, ...diseaseParts] = normalizedClassName.split("_");
  const selectedCrop = String(cropName || "")
    .trim()
    .replace(/\s+/g, "_");
  const confidence = prediction?.confidence;
  const canonicalClassName = normalizedClassName
    .split("_")
    .map((part) => part.toLowerCase())
    .join("_");
  const supportedClassName = [...SUPPORTED_CLASS_LABELS].find(
    (label) => label.toLowerCase() === canonicalClassName
  );

  if (
    !predictedCrop ||
    predictedCrop.toLowerCase() !== selectedCrop.toLowerCase() ||
    diseaseParts.length === 0 ||
    !supportedClassName ||
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    console.error("Incompatible EfficientNet prediction", {
      selectedCrop,
      rawClassName,
      confidence: prediction?.confidence,
      provider,
    });

    return createUnavailableModelResult(
      cropName,
      "The inference result did not contain a valid class label and confidence compatible with the selected crop.",
      "prediction_unavailable",
      provider
    );
  }

  const disease = diseaseParts.join(" ");
  const hasGradcam =
    typeof prediction.gradcamDataUrl === "string" &&
    prediction.gradcamDataUrl.startsWith("data:image/");

  return {
    disease,
    confidence,
    summary: `EfficientNet-B0 classified this image as ${disease} for ${predictedCrop}.`,
    explanation: "The prediction was generated from the configured EfficientNet-B0 checkpoint.",
    evidence: [],
    limitations:
      "This diagnostic checkpoint prediction is not a medical or agronomic confirmation and is not production-ready.",
    model: {
      provider: "EfficientNet-B0",
      inferenceProvider: provider,
      status: "diagnostic_checkpoint",
      checkpoint: "best_efficientnet_b0.pt",
      runtime: "hosted",
    },
    explainability: hasGradcam
      ? {
          status: "available",
          message: "Grad-CAM generated from the final EfficientNet-B0 feature layer.",
          heatmap: prediction.gradcamDataUrl,
        }
      : {
          status: "unavailable",
          message:
            "The hosted prediction completed, but Grad-CAM is unavailable for this inference response.",
        },
  };
}

export function createUnavailableModelResult(
  cropName,
  reason,
  status = "prediction_unavailable",
  provider
) {
  return {
    disease: null,
    confidence: null,
    summary: `No compatible prediction was produced for this ${cropName} image.`,
    explanation: reason,
    evidence: [],
    limitations: "No disease, confidence, or heatmap is shown without validated model inference.",
    model: {
      provider: "EfficientNet-B0",
      inferenceProvider: provider,
      status,
      checkpoint: status === "not_configured" ? null : "best_efficientnet_b0.pt",
    },
    explainability: {
      status: "pending_efficientnet",
      message: "Grad-CAM requires the trained EfficientNet-B0 checkpoint.",
    },
  };
}
