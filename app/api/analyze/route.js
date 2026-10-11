import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth-server";
import { getInferenceAvailability, runEfficientNetInference } from "../../../lib/model-inference";
import { supabaseServer, supabaseServerConfigured } from "../../../lib/supabase";

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
    const { cropName, imageData, imageUrl, latitude, longitude } = input;
    if (!cropName || !imageData) return NextResponse.json({ error: "Crop and image are required." }, { status: 400 });
    if (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(imageData) || imageData.length > 14 * 1024 * 1024) {
      return NextResponse.json({ error: "Only valid JPG or PNG image data up to 10 MB is accepted." }, { status: 400 });
    }
    const visual = await getVisualResult(cropName, imageData);
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

async function getVisualResult(cropName, imageData) {
  if (process.env.INFERENCE_SERVICE_URL) {
    try {
      const prediction = await runHostedInference(imageData);
      return createPredictionResult(cropName, prediction);
    } catch (error) {
      console.error("Hosted EfficientNet-B0 inference failed", error);
      return createUnavailableModelResult(cropName, "The hosted EfficientNet-B0 inference service is unavailable.");
    }
  }
  const availability = getInferenceAvailability();
  if (!availability.available) return createUnavailableModelResult(cropName, availability.reason);
  try {
    const prediction = await runEfficientNetInference(imageData);
    return createPredictionResult(cropName, prediction);
  } catch (error) {
    console.error("EfficientNet-B0 inference failed", error);
    return createUnavailableModelResult(cropName, "The EfficientNet-B0 checkpoint could not produce a prediction.");
  }
}

async function runHostedInference(imageData) {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match) throw new Error("The uploaded image data is invalid.");
  const body = new FormData();
  body.append("file", new Blob([Buffer.from(match[2], "base64")], { type: match[1] }), "upload");
  const headers = {};
  if (process.env.INFERENCE_SERVICE_API_KEY) headers["X-API-Key"] = process.env.INFERENCE_SERVICE_API_KEY;
  const configuredTimeout = Number(process.env.INFERENCE_SERVICE_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 30000), 180000)
    : 180000;
  const response = await fetch(`${process.env.INFERENCE_SERVICE_URL.replace(/\/$/, "")}/predict`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs)
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The inference service returned invalid JSON.");
  }
  if (!response.ok) throw new Error(payload.error || "The inference service rejected the image.");
  if (
    typeof payload.className !== "string" ||
    typeof payload.confidence !== "number" ||
    payload.confidence < 0 ||
    payload.confidence > 1 ||
    typeof payload.gradcamDataUrl !== "string"
  ) {
    throw new Error("The inference service returned an incomplete prediction.");
  }
  return payload;
}

function createPredictionResult(cropName, prediction) {
  const [crop, ...diseaseParts] = prediction.className.split("_");
  if (!crop || crop.toLowerCase() !== cropName.toLowerCase() || !diseaseParts.length) {
    return createUnavailableModelResult(cropName, "The model returned an unsupported class for the selected crop.");
  }
  const hosted = Boolean(process.env.INFERENCE_SERVICE_URL);
  return {
    disease: diseaseParts.join(" "),
    confidence: prediction.confidence,
    summary: `EfficientNet-B0 classified this image as ${diseaseParts.join(" ")} for ${crop}.`,
    explanation: "The prediction and Grad-CAM overlay were generated from the configured EfficientNet-B0 checkpoint.",
    evidence: [],
    limitations: "This diagnostic checkpoint prediction is not a medical or agronomic confirmation and is not production-ready.",
    model: { provider: "EfficientNet-B0", status: "diagnostic_checkpoint", checkpoint: "best_efficientnet_b0.pt", runtime: hosted ? "hosted" : "local" },
    explainability: { status: "available", message: "Grad-CAM generated from the final EfficientNet-B0 feature layer.", heatmap: prediction.gradcamDataUrl }
  };
}

function createUnavailableModelResult(cropName, reason = "Connect a validated EfficientNet-B0 checkpoint and compatible inference runtime to enable disease classification.") {
  return {
    disease: null,
    confidence: null,
    summary: `No prediction was produced for this ${cropName} image because the validated EfficientNet-B0 model is not connected.`,
    explanation: reason,
    evidence: [],
    limitations: "No disease, confidence, or heatmap is shown without validated model inference.",
    model: { provider: "EfficientNet-B0", status: "not_configured", checkpoint: null },
    explainability: { status: "pending_efficientnet", message: "Grad-CAM requires the trained EfficientNet-B0 checkpoint." }
  };
}

async function getKnowledgeRecord(cropName, disease) {
  if (supabaseServerConfigured) {
    try {
      const diseaseLookup = supabaseServer
        .from("knowledge_records")
        .select("information,source_title,source_url,matched_disease")
        .eq("crop_name", cropName)
        .eq("matched_disease", disease || "General")
        .limit(1)
        .maybeSingle();
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error("Knowledge lookup timed out") }), 2500));
      let { data, error } = await Promise.race([diseaseLookup, timeout]);
      if (!error && !data && disease) {
        const generalLookup = supabaseServer
          .from("knowledge_records")
          .select("information,source_title,source_url,matched_disease")
          .eq("crop_name", cropName)
          .eq("matched_disease", "General")
          .limit(1)
          .maybeSingle();
        ({ data, error } = await Promise.race([generalLookup, timeout]));
      }
      if (!error && data) {
        return { information: data.information, source: data.source_title, sourceUrl: data.source_url, matchedDisease: data.matched_disease, match: "supabase validated record" };
      }
      if (error) console.error("Knowledge retrieval failed", error);
    } catch (error) {
      console.error("Knowledge retrieval failed", error);
    }
  }
  return {
    information: "No validated knowledge record matched this crop and disease.",
    source: null,
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
