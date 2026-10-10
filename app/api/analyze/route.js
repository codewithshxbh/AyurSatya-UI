import { NextResponse } from "next/server";

const fallbackKnowledge = {
  Ashwagandha: "Ashwagandha is a warm-season medicinal crop. Common visual checks include leaf discoloration, wilting, fungal spotting, and pest damage.",
  Tulsi: "Tulsi prefers well-drained soil and consistent light. Monitor for leaf spots, wilting, and insect pressure before interpreting an image-only result.",
  Neem: "Neem is generally resilient. Discoloration, curling, and spotting should be interpreted with field conditions and recent moisture in mind.",
  "Aloe Vera": "Aloe Vera stores water in its leaves. Softness, translucency, and browning can indicate watering or rot-related stress."
};

export async function POST(request) {
  try {
    const { cropName, imageData, latitude, longitude } = await request.json();
    if (!cropName || !imageData) return NextResponse.json({ error: "Crop and image are required." }, { status: 400 });
    const visual = await analyzeWithGemini(cropName, imageData);
    const satellite = await getSatelliteContext(latitude, longitude);
    return NextResponse.json({
      visual,
      knowledge: { information: fallbackKnowledge[cropName] || "Validated crop information will be added to the knowledge base.", source: "AyurSatya crop knowledge starter set" },
      satellite
    });
  } catch (error) {
    console.error("Analysis request failed", error);
    return NextResponse.json({ error: "Analysis service is temporarily unavailable." }, { status: 500 });
  }
}

async function analyzeWithGemini(cropName, imageData) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { disease: "Provider not configured", confidence: "—", summary: "Add GEMINI_API_KEY to enable the Gemini preliminary assessment.", explanation: "The report structure is ready; no prediction is made without a configured provider.", evidence: [], limitations: "This report is incomplete until Gemini or the trained EfficientNet service is configured." };
  }
  const base64 = imageData.split(",")[1];
  const mimeType = imageData.match(/^data:(.*?);base64/)?.[1] || "image/jpeg";
  const prompt = `You are the preliminary visual assessment service for AyurSatya. Analyze this image as a ${cropName} leaf. Return JSON only with exactly these keys: disease (string), confidence (string percentage), summary (string), explanation (string), evidence (array of 2-4 strings), limitations (string). Do not claim certainty, medical treatment, or a disease that cannot be supported by visible evidence. Mention image limitations.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }) });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

async function getSatelliteContext(latitude, longitude) {
  if (!latitude || !longitude) return { summary: "No coordinates were supplied. Add field latitude and longitude to query Sentinel-2 context.", ndvi: null, ndwi: null, sceneDate: null };
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { summary: "Coordinates were invalid, so satellite context was not queried.", ndvi: null, ndwi: null, sceneDate: null };
  const response = await fetch("https://earth-search.aws.element84.com/v1/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collections: ["sentinel-2-l2a"], intersects: { type: "Point", coordinates: [lon, lat] }, datetime: "2025-01-01/2026-12-31", limit: 1, query: { "eo:cloud_cover": { lt: 25 } } }) });
  if (!response.ok) return { summary: "Satellite provider did not return a scene for these coordinates.", ndvi: null, ndwi: null, sceneDate: null };
  const data = await response.json();
  const scene = data.features?.[0];
  if (!scene) return { summary: "No low-cloud Sentinel-2 scene was found for these coordinates.", ndvi: null, ndwi: null, sceneDate: null };
  return { summary: "A recent low-cloud Sentinel-2 scene was found. Configure Sentinel Hub processing credentials to calculate field-level NDVI and NDWI values.", ndvi: null, ndwi: null, sceneDate: scene.properties?.datetime?.slice(0, 10) || null };
}
