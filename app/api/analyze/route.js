import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth-server";
import { isInferenceProvider, runInferenceProvider } from "../../../lib/inference-providers";
import { getInferenceAvailability, runEfficientNetInference } from "../../../lib/model-inference";
import { supabaseServer, supabaseServerConfigured } from "../../../lib/supabase";
import { normalizeKnowledgeCrop, selectKnowledgeRecord } from "../../../lib/knowledge-filters.mjs";

export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    let input;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "Send a valid JSON body with crop and image data." }, { status: 400 });
    }
    const { cropName, imageData, imageUrl, latitude, longitude, provider = "render" } = input;
    if (!isInferenceProvider(provider)) return NextResponse.json({ error: "The selected inference provider is not supported." }, { status: 400 });
    if (!cropName || !imageData) return NextResponse.json({ error: "Crop and image are required." }, { status: 400 });
    if (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(imageData) || imageData.length > 14 * 1024 * 1024) {
      return NextResponse.json({ error: "Only valid JPG or PNG image data up to 10 MB is accepted." }, { status: 400 });
    }
    const visual = await getVisualResult(cropName, imageData, provider);
    const satellite = await getSatelliteContext(latitude, longitude);
    const knowledge = await getKnowledgeRecord(cropName, visual.disease);
    return NextResponse.json({
      visual,
      imageUrl: imageUrl || null,
      model: visual.model,
      knowledge,
      satellite
    });
  } catch (error) {
    console.error("Analysis request failed", error);
    return NextResponse.json({ error: "Analysis service is temporarily unavailable." }, { status: 500 });
  }
}

async function getVisualResult(cropName, imageData, provider = "render") {
  if ((provider === "render" && process.env.INFERENCE_SERVICE_URL) || (provider === "colab" && process.env.COLAB_INFERENCE_URL)) {
    try {
      const prediction = await runInferenceProvider(provider, imageData);
      return createPredictionResult(cropName, prediction, provider);
    } catch (error) {
      console.error("Hosted EfficientNet-B0 inference failed", error);
      return createUnavailableModelResult(cropName, "The hosted EfficientNet-B0 inference service is unavailable.", "service_unavailable");
    }
  }
  if (provider === "colab") return createUnavailableModelResult(cropName, "Google Colab is not configured or its temporary runtime is offline.", "not_configured");
  const availability = getInferenceAvailability();
  if (!availability.available) return createUnavailableModelResult(cropName, availability.reason, "not_configured");
  try {
    const prediction = await runEfficientNetInference(imageData);
    return createPredictionResult(cropName, prediction, "render");
  } catch (error) {
    console.error("EfficientNet-B0 inference failed", error);
    return createUnavailableModelResult(cropName, "The checkpoint did not produce a usable prediction for this image.", "prediction_unavailable");
  }
}

export function createPredictionResult(cropName, prediction, provider = "render") {
  const [crop, ...diseaseParts] = prediction.className.split("_");
  if (!crop || crop.toLowerCase() !== cropName.toLowerCase() || !diseaseParts.length) {
    return createUnavailableModelResult(cropName, "The model returned no compatible prediction for the selected crop. This can happen when the checkpoint has not been trained for that crop yet.", "prediction_unavailable");
  }
  const hosted = provider === "render" || provider === "colab";
  const hasGradcam = typeof prediction.gradcamDataUrl === "string" && prediction.gradcamDataUrl.startsWith("data:image/");
  return {
    disease: diseaseParts.join(" "),
    confidence: prediction.confidence,
    summary: `EfficientNet-B0 classified this image as ${diseaseParts.join(" ")} for ${crop}.`,
    explanation: "The prediction and Grad-CAM overlay were generated from the configured EfficientNet-B0 checkpoint.",
    evidence: [],
    limitations: "This diagnostic checkpoint prediction is not a medical or agronomic confirmation and is not production-ready.",
    model: { provider: "EfficientNet-B0", inferenceProvider: provider, status: "diagnostic_checkpoint", checkpoint: "best_efficientnet_b0.pt", runtime: hosted ? "hosted" : "local" },
    explainability: hasGradcam
      ? { status: "available", message: "Grad-CAM generated from the final EfficientNet-B0 feature layer.", heatmap: prediction.gradcamDataUrl }
      : { status: "unavailable", message: "The hosted prediction completed, but Grad-CAM is disabled for the constrained inference runtime." }
  };
}

function createUnavailableModelResult(cropName, reason, status = "prediction_unavailable") {
  return {
    disease: null,
    confidence: null,
    summary: `No compatible prediction was produced for this ${cropName} image.`,
    explanation: reason,
    evidence: [],
    limitations: "No disease, confidence, or heatmap is shown without validated model inference.",
    model: { provider: "EfficientNet-B0", status, checkpoint: status === "not_configured" ? null : "best_efficientnet_b0.pt" },
    explainability: { status: "pending_efficientnet", message: "Grad-CAM requires the trained EfficientNet-B0 checkpoint." }
  };
}

async function getKnowledgeRecord(cropName, disease) {
  if (supabaseServerConfigured) {
    try {
      const diseaseLookup = supabaseServer
        .from("knowledge_records")
        .select("information,summary,source_title,source_url,source_institution,matched_disease")
        .eq("normalized_crop", normalizeKnowledgeCrop(cropName))
        .limit(100);
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error("Knowledge lookup timed out") }), 2500));
      let { data, error } = await Promise.race([diseaseLookup, timeout]);
      if (!error && !(data || []).length) {
        const legacyLookup = supabaseServer
          .from("knowledge_records")
          .select("information,summary,source_title,source_url,source_institution,matched_disease")
          .eq("crop_name", cropName)
          .limit(100);
        ({ data, error } = await Promise.race([legacyLookup, timeout]));
      }
      const match = !error ? selectKnowledgeRecord(data || [], disease) : null;
      if (!error && match) {
        return { information: match.summary || match.information, source: match.source_title, sourceInstitution: match.source_institution || null, sourceUrl: match.source_url, matchedDisease: match.matched_disease, match: match.matched_disease?.toLowerCase() === disease?.toLowerCase() ? "disease-specific" : "general" };
      }
      if (error) console.error("Knowledge retrieval failed", error);
    } catch (error) {
      console.error("Knowledge retrieval failed", error);
    }
  }
  return {
    information: "No knowledge record matched this crop and disease.",
    source: null,
    sourceInstitution: null,
    sourceUrl: null,
    matchedDisease: disease || null,
    match: "none"
  };
}

async function getSatelliteContext(latitude, longitude) {
  if (!latitude || !longitude) return { summary: "No coordinates were supplied. Add field latitude and longitude to query Sentinel-2 context.", ndvi: null, ndwi: null, sceneDate: null };
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { summary: "Coordinates were invalid, so satellite context was not queried.", ndvi: null, ndwi: null, sceneDate: null };
  let response;
  try {
    response = await fetch("https://earth-search.aws.element84.com/v1/search", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ collections: ["sentinel-2-l2a"], intersects: { type: "Point", coordinates: [lon, lat] }, datetime: "2025-01-01/2026-12-31", limit: 1, query: { "eo:cloud_cover": { lt: 25 } } }) });
  } catch (error) {
    console.error("Satellite lookup failed", error);
    return { summary: "Satellite context is temporarily unavailable. Leaf analysis can continue without it.", ndvi: null, ndwi: null, sceneDate: null };
  }
  if (!response.ok) return { summary: "Satellite provider did not return a scene for these coordinates.", ndvi: null, ndwi: null, sceneDate: null };
  const data = await response.json();
  const scene = data.features?.[0];
  if (!scene) return { summary: "No low-cloud Sentinel-2 scene was found for these coordinates.", ndvi: null, ndwi: null, sceneDate: null };
  return { summary: "A recent low-cloud Sentinel-2 scene was found. Configure Sentinel Hub processing credentials to calculate field-level NDVI and NDWI values.", ndvi: null, ndwi: null, sceneDate: scene.properties?.datetime?.slice(0, 10) || null };
}
