export async function runHostedInference(imageData) {
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
  const responseBody = await response.text();
  const contentType = response.headers.get("content-type") || "unknown";
  let payload;
  try {
    payload = JSON.parse(responseBody);
  } catch {
    console.error("Inference service returned a non-JSON response", {
      status: response.status,
      contentType,
      bodyPreview: sanitizeUpstreamBody(responseBody)
    });
    throw new Error("The inference service returned invalid JSON.");
  }
  if (!response.ok) {
    console.error("Inference service rejected prediction request", {
      status: response.status,
      contentType,
      bodyPreview: sanitizeUpstreamBody(responseBody)
    });
    throw new Error(payload?.error || "The inference service rejected the image.");
  }
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

function sanitizeUpstreamBody(body) {
  return body
    .replace(/(authorization|x-api-key|api[-_ ]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s<]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
