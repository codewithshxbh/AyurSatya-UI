import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth-server";
import { getProviderConfig, isInferenceProvider, runInferenceProvider } from "../../../lib/inference-providers";
import { getInferenceAvailability, runEfficientNetInference } from "../../../lib/model-inference";
import { supabaseServer, supabaseServerConfigured } from "../../../lib/supabase";
import { normalizeKnowledgeCrop, selectKnowledgeRecord } from "../../../lib/knowledge-filters.mjs";
import { createPredictionResult, createUnavailableModelResult } from "../../../lib/prediction-result";

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
  const providerConfig = getProviderConfig(provider);
  console.info("EfficientNet provider configuration", {
    provider,
    configuredUrl: Boolean(providerConfig?.url),
    configuredApiKey: Boolean(providerConfig?.apiKey),
  });
  if (providerConfig?.url) {
    try {
      const prediction = await runInferenceProvider(provider, imageData);
      return createPredictionResult(cropName, prediction, provider);
    } catch (error) {
      console.error("Hosted EfficientNet-B0 inference failed", {
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return createUnavailableModelResult(cropName, "The hosted EfficientNet-B0 inference service is unavailable. Check the server logs for the underlying error.", "service_unavailable", provider);
    }
  }
  if (provider === "colab") {
    console.warn("EfficientNet provider is not configured", { provider });
    return createUnavailableModelResult(cropName, "Google Colab is not configured or its temporary runtime is offline.", "not_configured", provider);
  }
  const availability = getInferenceAvailability();
  if (!availability.available) return createUnavailableModelResult(cropName, availability.reason, "not_configured", provider);
  try {
    const prediction = await runEfficientNetInference(imageData);
    return createPredictionResult(cropName, prediction, "render");
  } catch (error) {
    console.error("EfficientNet-B0 inference failed", {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return createUnavailableModelResult(cropName, "The checkpoint did not produce a usable prediction for this image. Check the server logs for the underlying error.", "prediction_unavailable", provider);
  }
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
