import test from "node:test";
import assert from "node:assert/strict";

const imageData = "data:image/png;base64,aW1hZ2U=";
const originalFetch = globalThis.fetch;
const { createPredictionResult } = await import("../lib/prediction-result.js");

function mockResponse({ status = 200, body, contentType = "application/json" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    text: async () => body
  };
}

test("prediction results accept valid labels for every supported crop", () => {
  for (const [cropName, className] of [
    ["Neem ", "Neem_Healthy"],
    ["Kalanchoe", "Kalanchoe_Web_Blight"],
    ["Tulsi", "Tulsi_Yellow_Spot"],
  ]) {
    const result = createPredictionResult(cropName, { className, confidence: 0.91 }, "colab");
    assert.equal(result.disease, className.split("_").slice(1).join(" "));
    assert.equal(result.confidence, 0.91);
    assert.equal(result.model.inferenceProvider, "colab");
  }
});

test("prediction results reject wrong crops, malformed labels, and invalid confidence", () => {
  const invalidPredictions = [
    { className: "Tulsi_Healthy", confidence: 0.91 },
    { className: "", confidence: 0.91 },
    { className: "Neem_Unknown", confidence: 0.91 },
    { className: "Neem_Healthy" },
    { className: "Neem_Healthy", confidence: "0.91" },
    { className: "Neem_Healthy", confidence: Number.NaN },
    { className: "Neem_Healthy", confidence: Number.POSITIVE_INFINITY },
    { className: "Neem_Healthy", confidence: -0.01 },
    { className: "Neem_Healthy", confidence: 1.01 },
  ];

  for (const prediction of invalidPredictions) {
    const result = createPredictionResult("Neem", prediction, "render");
    assert.equal(result.disease, null);
    assert.equal(result.model.status, "prediction_unavailable");
    assert.equal(result.model.inferenceProvider, "render");
  }
});

test("hosted inference parses valid JSON and sends the expected multipart request", async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return mockResponse({
      body: JSON.stringify({
        className: "Neem_Healthy",
        confidence: 0.91,
        gradcamDataUrl: "data:image/png;base64,ZmFrZQ=="
      })
    });
  };
  process.env.INFERENCE_SERVICE_URL = "https://inference.example/";
  process.env.INFERENCE_SERVICE_API_KEY = "test-api-key";
  const { runHostedInference } = await import("../lib/hosted-inference.js");

  const result = await runHostedInference(imageData);

  assert.equal(request.url, "https://inference.example/predict");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["X-API-Key"], "test-api-key");
  assert.equal(request.options.body.get("file").type, "image/png");
  assert.equal(result.className, "Neem_Healthy");
  globalThis.fetch = originalFetch;
});

test("hosted inference rejects non-JSON upstream responses", async () => {
  globalThis.fetch = async () => mockResponse({
    status: 502,
    contentType: "text/html",
    body: "<html><body>upstream gateway error</body></html>"
  });
  const { runHostedInference } = await import("../lib/hosted-inference.js");

  await assert.rejects(
    () => runHostedInference(imageData),
    { message: "The inference service returned HTTP 502." }
  );
  globalThis.fetch = originalFetch;
});

test("hosted inference identifies an empty upstream response", async () => {
  globalThis.fetch = async () => mockResponse({
    status: 502,
    contentType: "unknown",
    body: ""
  });
  const { runHostedInference } = await import("../lib/hosted-inference.js");

  await assert.rejects(
    () => runHostedInference(imageData),
    {
      message:
        "The inference service returned an empty HTTP 502 response; " +
        "the upstream worker may have terminated before sending JSON."
    }
  );
  globalThis.fetch = originalFetch;
});

test("hosted inference preserves structured upstream HTTP errors", async () => {
  globalThis.fetch = async () => mockResponse({
    status: 503,
    body: JSON.stringify({ error: "EfficientNet-B0 artifacts are unavailable." })
  });
  const { runHostedInference } = await import("../lib/hosted-inference.js");

  await assert.rejects(
    () => runHostedInference(imageData),
    { message: "EfficientNet-B0 artifacts are unavailable." }
  );
  globalThis.fetch = originalFetch;
});

test("hosted inference surfaces request timeouts without fabricating output", async () => {
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.signal);
    const error = new DOMException("The operation was aborted.", "TimeoutError");
    throw error;
  };
  const { runHostedInference } = await import("../lib/hosted-inference.js");

  await assert.rejects(() => runHostedInference(imageData), { name: "TimeoutError" });
  globalThis.fetch = originalFetch;
});

test("provider configuration keeps Render as the default and restricts providers", async () => {
  const { getProviderConfig, isInferenceProvider } = await import("../lib/inference-providers.js");
  process.env.INFERENCE_SERVICE_URL = "https://render.example/";
  process.env.INFERENCE_SERVICE_API_KEY = "render-key";
  delete process.env.COLAB_INFERENCE_URL;
  assert.equal(isInferenceProvider("render"), true);
  assert.equal(isInferenceProvider("colab"), true);
  assert.equal(isInferenceProvider("https://evil.example"), false);
  assert.deepEqual(getProviderConfig(), {
    provider: "render",
    url: "https://render.example",
    apiKey: "render-key"
  });
  assert.equal(getProviderConfig("colab").url, null);
});

test("hosted inference can route explicitly to Colab without changing Render config", async () => {
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return mockResponse({
      body: JSON.stringify({
        className: "Neem_Healthy",
        confidence: 0.8,
        gradcamDataUrl: ""
      })
    });
  };
  const { runInferenceProvider } = await import("../lib/inference-providers.js");
  process.env.COLAB_INFERENCE_URL = "https://colab.example/";
  process.env.COLAB_INFERENCE_API_KEY = "colab-key";
  await runInferenceProvider("colab", imageData);
  assert.equal(requestedUrl, "https://colab.example/predict");
  globalThis.fetch = originalFetch;
});

test("Colab status distinguishes configuration, malformed responses, errors, and availability", async () => {
  const { checkColabAvailability } = await import("../lib/colab-status.js");
  assert.equal(await checkColabAvailability(null, async () => {
    throw new Error("must not fetch");
  }), "unconfigured");
  assert.equal(await checkColabAvailability({ url: "https://colab.example" }, async () => ({
    ok: true,
    text: async () => JSON.stringify({ status: "ok", modelReady: true })
  })), "available");
  assert.equal(await checkColabAvailability({ url: "https://expired.example" }, async () => ({
    ok: false,
    text: async () => JSON.stringify({ error: "expired tunnel" })
  })), "offline");
  assert.equal(await checkColabAvailability({ url: "https://malformed.example" }, async () => ({
    ok: true,
    text: async () => "<html>not json</html>"
  })), "offline");
  assert.equal(await checkColabAvailability({ url: "https://timeout.example" }, async () => {
    throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
  }), "offline");
});
