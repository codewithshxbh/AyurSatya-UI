import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth-server";
import { DEFAULT_INFERENCE_PROVIDER, getProviderConfig, isInferenceProvider, runInferenceProvider } from "../../../lib/inference-providers";
import { classifyHostedInferenceFailure } from "../../../lib/inference-errors";
import { getInferenceAvailability, runEfficientNetInference } from "../../../lib/model-inference";
import { supabaseServer, supabaseServerConfigured } from "../../../lib/supabase";
import { emptyKnowledgeSection, normalizeKnowledgeCrop, presentKnowledgeRecord, selectKnowledgeRecord } from "../../../lib/knowledge-filters.mjs";
import { createPredictionResult, createUnavailableModelResult } from "../../../lib/prediction-result";
import { getSatelliteContext } from "../../../lib/satellite";

export const runtime = "nodejs";
export const maxDuration = 60;

const KNOWLEDGE_COLUMNS = "crop_name,normalized_crop,matched_disease,record_type,information,summary,source_title,source_url,source_institution,source_locator";

export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    let input;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "Send a valid JSON body with image data." }, { status: 400 });
    }
    const { imageData, imageUrl, latitude, longitude, provider = DEFAULT_INFERENCE_PROVIDER } = input;
    if (!isInferenceProvider(provider)) return NextResponse.json({ error: "The selected inference provider is not supported." }, { status: 400 });
    if (!imageData) return NextResponse.json({ error: "An image is required." }, { status: 400 });
    if (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(imageData) || imageData.length > 14 * 1024 * 1024) {
      return NextResponse.json({ error: "Only valid JPG or PNG image data up to 10 MB is accepted." }, { status: 400 });
    }
    const visualPromise = getVisualResult(imageData, provider);
    const satellitePromise = getSatelliteContext(latitude, longitude);
    const visual = await visualPromise;
    const [satellite, knowledge] = await Promise.all([
      satellitePromise,
      getKnowledgeSections(visual.crop, visual.condition, visual.healthy)
    ]);
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

async function getVisualResult(imageData, provider = DEFAULT_INFERENCE_PROVIDER) {
  const providerConfig = getProviderConfig(provider);
  if (providerConfig?.url) {
    try {
      const prediction = await runInferenceProvider(provider, imageData);
      return createPredictionResult(prediction, provider);
    } catch (error) {
      const failure = classifyHostedInferenceFailure(error);
      console.error("Hosted EfficientNet-B0 inference failed", {
        provider,
        status: failure.status,
        error: error instanceof Error ? error.message : String(error),
      });
      return createUnavailableModelResult(failure.message, failure.status, provider);
    }
  }
  if (provider === "colab") {
    console.warn("EfficientNet provider is not configured", { provider });
    return createUnavailableModelResult("Google Colab is not configured or its temporary runtime is offline.", "not_configured", provider);
  }
  const availability = getInferenceAvailability();
  if (!availability.available) return createUnavailableModelResult(availability.reason, "not_configured", provider);
  try {
    const prediction = await runEfficientNetInference(imageData);
    return createPredictionResult(prediction, "render");
  } catch (error) {
    console.error("EfficientNet-B0 inference failed", {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return createUnavailableModelResult("The checkpoint did not produce a usable prediction for this image. Check the server logs for the underlying error.", "prediction_unavailable", provider);
  }
}

async function runKnowledgeQuery(builder) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error("Knowledge lookup timed out") }), 2500));
  return Promise.race([builder, timeout]);
}

async function lookupKnowledge(cropName, recordType, matchedDisease) {
  if (!supabaseServerConfigured || !cropName) return { record: null, error: null };
  const normalized = normalizeKnowledgeCrop(cropName);
  const exact = supabaseServer
    .from("knowledge_records")
    .select(KNOWLEDGE_COLUMNS)
    .eq("normalized_crop", normalized)
    .eq("record_type", recordType)
    .eq("matched_disease", matchedDisease)
    .order("updated_at", { ascending: false })
    .limit(5);
  let { data, error } = await runKnowledgeQuery(exact);
  if (!error && !(data || []).length) {
    const legacy = supabaseServer
      .from("knowledge_records")
      .select(KNOWLEDGE_COLUMNS)
      .eq("crop_name", cropName)
      .eq("record_type", recordType)
      .eq("matched_disease", matchedDisease)
      .order("updated_at", { ascending: false })
      .limit(5);
    ({ data, error } = await runKnowledgeQuery(legacy));
  }
  if (!error && !(data || []).length && recordType !== "disease_context") {
    const typed = supabaseServer
      .from("knowledge_records")
      .select(KNOWLEDGE_COLUMNS)
      .eq("normalized_crop", normalized)
      .eq("record_type", recordType)
      .order("updated_at", { ascending: false })
      .limit(10);
    ({ data, error } = await runKnowledgeQuery(typed));
    if (!error && !(data || []).length) {
      const legacyTyped = supabaseServer
        .from("knowledge_records")
        .select(KNOWLEDGE_COLUMNS)
        .eq("crop_name", cropName)
        .eq("record_type", recordType)
        .order("updated_at", { ascending: false })
        .limit(10);
      ({ data, error } = await runKnowledgeQuery(legacyTyped));
    }
  }
  if (error) return { record: null, error };
  const selected = selectKnowledgeRecord(data || [], matchedDisease, recordType);
  if (selected) return { record: selected, error: null };
  if (recordType !== "disease_context" && (data || []).length) return { record: data[0], error: null };
  return { record: null, error: null };
}

async function getKnowledgeSections(cropName, condition, healthy) {
  const missingCrop = emptyKnowledgeSection("unavailable", "No plant was detected, so knowledge records were not queried.");
  if (!cropName) {
    return {
      plantProfile: missingCrop,
      disease: emptyKnowledgeSection("unavailable", "No condition was detected, so disease information was not queried."),
      traditional: missingCrop
    };
  }

  try {
    const [botanical, traditional, disease] = await Promise.all([
      lookupKnowledge(cropName, "botanical", "General"),
      lookupKnowledge(cropName, "traditional_reference", condition || "General"),
      healthy || !condition || condition.toLowerCase() === "healthy"
        ? Promise.resolve({ record: null, error: null, skipped: true })
        : lookupKnowledge(cropName, "disease_context", condition)
    ]);
    if (botanical.error) console.error("Knowledge retrieval failed", botanical.error);
    if (traditional.error) console.error("Knowledge retrieval failed", traditional.error);
    if (disease.error) console.error("Knowledge retrieval failed", disease.error);

    return {
      plantProfile: botanical.record
        ? presentKnowledgeRecord(botanical.record, "available")
        : emptyKnowledgeSection("unavailable", "No botanical plant profile is currently stored for this detected plant."),
      disease: healthy || !condition || condition.toLowerCase() === "healthy"
        ? emptyKnowledgeSection("not_applicable", "No disease record is shown for a healthy-leaf prediction.")
        : disease.record
          ? presentKnowledgeRecord(disease.record, "available")
          : emptyKnowledgeSection("unavailable", `No verified crop-specific disease record is currently stored for ${cropName} / ${condition}.`),
      traditional: traditional.record
        ? presentKnowledgeRecord(traditional.record, "available")
        : emptyKnowledgeSection("unavailable", "No verified traditional reference is currently stored for this plant.")
    };
  } catch (error) {
    console.error("Knowledge retrieval failed", error);
    return {
      plantProfile: emptyKnowledgeSection("unavailable", "Knowledge lookup failed."),
      disease: emptyKnowledgeSection("unavailable", "Knowledge lookup failed."),
      traditional: emptyKnowledgeSection("unavailable", "Knowledge lookup failed.")
    };
  }
}
