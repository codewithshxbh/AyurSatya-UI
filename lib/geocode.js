import { getGeocoderConfig } from "./map-config.js";
import { parseFieldPoint } from "./field-location.js";

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 120;
const MIN_INTERVAL_MS = 500;
let lastPhotonAt = 0;

export function resetGeocodeRateLimitForTests() {
  lastPhotonAt = 0;
}

export function normalizeGeocodeQuery(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

export function validateGeocodeQuery(value) {
  const query = normalizeGeocodeQuery(value);
  if (!query) return { error: "Enter a place name to search." };
  if (query.length < MIN_QUERY_LENGTH) return { error: "Enter at least three characters to search." };
  return { query };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPhotonSlot() {
  const wait = lastPhotonAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastPhotonAt = Date.now();
}

export function formatPhotonLabel(properties = {}) {
  const parts = [
    [properties.housenumber, properties.street].filter(Boolean).join(" ").trim(),
    properties.name,
    properties.locality,
    properties.district,
    properties.city,
    properties.county,
    properties.state,
    properties.country
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  const unique = [];
  for (const part of parts) {
    if (!unique.includes(part)) unique.push(part);
  }
  return unique.join(", ");
}

export function presentGeocodeResults(payload) {
  const features = Array.isArray(payload?.features)
    ? payload.features
    : Array.isArray(payload)
      ? payload
      : [];
  return features.flatMap((feature) => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const point = parseFieldPoint(coordinates[1], coordinates[0]);
    const label = formatPhotonLabel(feature?.properties);
    if (!point || !label) return [];
    const osmId = feature?.properties?.osm_id;
    return [{
      id: String(osmId || `${point.latitude},${point.longitude}`),
      label,
      latitude: point.latitude,
      longitude: point.longitude
    }];
  });
}

export async function searchPlaces(rawQuery, { fetchImpl = fetch, bias } = {}) {
  const parsed = validateGeocodeQuery(rawQuery);
  if (parsed.error) return { status: 400, error: parsed.error, results: [] };

  const config = getGeocoderConfig();
  const params = new URLSearchParams({
    q: parsed.query,
    limit: "6"
  });
  const biasPoint = parseFieldPoint(bias?.latitude, bias?.longitude);
  if (biasPoint) {
    params.set("lat", String(biasPoint.latitude));
    params.set("lon", String(biasPoint.longitude));
  }

  await waitForPhotonSlot();
  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}/api/?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": config.userAgent
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return { status: 503, error: "Place search is temporarily unavailable. Try again, or click the map.", results: [] };
  }

  if (response.status === 429) {
    return { status: 429, error: "Too many place searches. Wait a moment and try again.", results: [] };
  }
  if (!response.ok) {
    return { status: 503, error: "Place search is temporarily unavailable. Try again, or click the map.", results: [] };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { status: 503, error: "Place search is temporarily unavailable. Try again, or click the map.", results: [] };
  }

  const results = presentGeocodeResults(payload);
  return {
    status: 200,
    results,
    error: results.length ? null : "No matching places were found. Try a different name, or click the map."
  };
}
