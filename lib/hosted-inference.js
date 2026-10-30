import { HostedInferenceError, hostedErrorCodeForStatus } from "./inference-errors.js";

export async function runHostedInference(imageData, options = {}) {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match) {
    throw new HostedInferenceError("The uploaded image data is invalid.", {
      status: 400,
      code: "invalid_image"
    });
  }
  const body = new FormData();
  body.append("file", new Blob([Buffer.from(match[2], "base64")], { type: match[1] }), "upload");
  const headers = {};
  const apiKey = options.apiKey || process.env.INFERENCE_SERVICE_API_KEY;
  if (apiKey) headers["X-API-Key"] = apiKey;
  const configuredTimeout = Number(options.timeoutMs || process.env.INFERENCE_SERVICE_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 30000), 180000)
    : 180000;
  const serviceUrl = options.url || process.env.INFERENCE_SERVICE_URL;
  if (!serviceUrl) throw new Error("The inference service is not configured.");
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/predict`, {
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
    if (!responseBody.trim()) {
      throw new HostedInferenceError(
        `The inference service returned an empty HTTP ${response.status} response; ` +
        "the upstream worker may have terminated before sending JSON.",
        { status: response.status, code: hostedErrorCodeForStatus(response.status) }
      );
    }
    if (!response.ok) {
      throw new HostedInferenceError(`The inference service returned HTTP ${response.status}.`, {
        status: response.status,
        code: hostedErrorCodeForStatus(response.status)
      });
    }
    throw new HostedInferenceError("The inference service returned invalid JSON.", {
      status: response.status,
      code: "prediction_unavailable"
    });
  }
  if (!response.ok) {
    console.error("Inference service rejected prediction request", {
      status: response.status,
      contentType,
      bodyPreview: sanitizeUpstreamBody(responseBody)
    });
    throw new HostedInferenceError(payload?.error || "The inference service rejected the image.", {
      status: response.status,
      code: hostedErrorCodeForStatus(response.status)
    });
  }
  if (
    typeof payload.className !== "string" ||
    typeof payload.confidence !== "number" ||
    payload.confidence < 0 ||
    payload.confidence > 1 ||
    typeof payload.gradcamDataUrl !== "string"
  ) {
    console.error("Inference provider returned an invalid prediction contract", {
      provider: options.provider || "unknown",
      status: response.status,
      className: typeof payload.className === "string" ? payload.className : null,
      confidence: payload.confidence,
    });
    throw new HostedInferenceError("The inference service returned an incomplete prediction.", {
      status: response.status,
      code: "prediction_unavailable"
    });
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
