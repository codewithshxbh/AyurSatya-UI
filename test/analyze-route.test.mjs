import test from "node:test";
import assert from "node:assert/strict";

const imageData = "data:image/png;base64,aW1hZ2U=";
const originalFetch = globalThis.fetch;
const { createPredictionResult, createUnavailableModelResult } = await import("../lib/prediction-result.js");

function mockResponse({ status = 200, body, contentType = "application/json" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    text: async () => body
  };
}

test("prediction results derive crop and condition for every supported class", async () => {
  const { SUPPORTED_CLASS_LABELS } = await import("../lib/prediction-result.js");
  assert.equal(SUPPORTED_CLASS_LABELS.length, 12);
  for (const className of SUPPORTED_CLASS_LABELS) {
    const result = createPredictionResult({ className, confidence: 0.91, gradcamDataUrl: "" }, "colab");
    assert.equal(result.crop, className.split("_")[0]);
    assert.equal(result.condition, className.split("_").slice(1).join(" "));
    assert.equal(result.disease, result.condition);
    assert.equal(result.className, className);
    assert.equal(result.confidence, 0.91);
    assert.equal(result.model.inferenceProvider, "colab");
    assert.equal(result.explainability.status, "unavailable");
  }
});

test("unavailable results keep invalid images distinct from service downtime", () => {
  const invalid = createUnavailableModelResult("The uploaded image could not be decoded.", "invalid_image", "colab");
  assert.equal(invalid.disease, null);
  assert.equal(invalid.crop, null);
  assert.equal(invalid.confidence, null);
  assert.equal(invalid.model.status, "invalid_image");
  assert.equal(invalid.explainability.status, "unavailable");
});

test("prediction results reject malformed labels and invalid confidence", () => {
  const invalidPredictions = [
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
    const result = createPredictionResult(prediction, "render");
    assert.equal(result.disease, null);
    assert.equal(result.model.status, "prediction_unavailable");
    assert.equal(result.model.inferenceProvider, "render");
  }
});

test("automatic detection keeps a valid class from a different former selected crop", () => {
  const result = createPredictionResult({ className: "Tulsi_Healthy", confidence: 0.99, gradcamDataUrl: "" }, "colab");
  assert.equal(result.crop, "Tulsi");
  assert.equal(result.condition, "Healthy");
  assert.equal(result.healthy, true);
});

test("malformed heatmaps are rejected and not rendered", () => {
  const result = createPredictionResult({
    className: "Neem_Healthy",
    confidence: 0.91,
    gradcamDataUrl: "data:image/png;base64,ZmFrZQ=="
  }, "colab");
  assert.equal(result.explainability.status, "unavailable");
  assert.equal(result.explainability.heatmap, undefined);
});

test("genuine Grad-CAM PNG data URLs are accepted", () => {
  const heatmap = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const result = createPredictionResult({ className: "Neem_Spot", confidence: 0.88, gradcamDataUrl: heatmap }, "colab");
  assert.equal(result.explainability.status, "available");
  assert.equal(result.explainability.heatmap, heatmap);
  assert.equal(result.healthy, false);
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
    (error) => {
      assert.equal(error.name, "HostedInferenceError");
      assert.equal(error.status, 503);
      assert.equal(error.code, "service_unavailable");
      assert.equal(error.message, "EfficientNet-B0 artifacts are unavailable.");
      return true;
    }
  );
  globalThis.fetch = originalFetch;
});

test("hosted inference maps invalid-image HTTP 400 separately from downtime", async () => {
  globalThis.fetch = async () => mockResponse({
    status: 400,
    body: JSON.stringify({ error: "The uploaded image could not be decoded." })
  });
  const { runHostedInference } = await import("../lib/hosted-inference.js");

  await assert.rejects(
    () => runHostedInference(imageData),
    (error) => {
      assert.equal(error.name, "HostedInferenceError");
      assert.equal(error.status, 400);
      assert.equal(error.code, "invalid_image");
      assert.equal(error.message, "The uploaded image could not be decoded.");
      return true;
    }
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

test("provider configuration keeps Colab as the default and restricts providers", async () => {
  const { getProviderConfig, isInferenceProvider } = await import("../lib/inference-providers.js");
  process.env.COLAB_INFERENCE_URL = "https://colab.example/";
  process.env.COLAB_INFERENCE_API_KEY = "colab-key";
  process.env.INFERENCE_SERVICE_URL = "https://render.example/";
  process.env.INFERENCE_SERVICE_API_KEY = "render-key";
  assert.equal(isInferenceProvider("render"), true);
  assert.equal(isInferenceProvider("colab"), true);
  assert.equal(isInferenceProvider("https://evil.example"), false);
  assert.deepEqual(getProviderConfig(), {
    provider: "colab",
    url: "https://colab.example",
    apiKey: "colab-key"
  });
  assert.deepEqual(getProviderConfig("render"), {
    provider: "render",
    url: "https://render.example",
    apiKey: "render-key"
  });
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

test("Colab status uses /ready and requires a loaded model", async () => {
  const { checkColabAvailability } = await import("../lib/colab-status.js");
  let requestedUrl;
  assert.equal(await checkColabAvailability(null, async () => {
    throw new Error("must not fetch");
  }), "unconfigured");
  assert.equal(await checkColabAvailability({ url: "https://colab.example" }, async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      text: async () => JSON.stringify({ status: "ready", modelReady: true })
    };
  }), "available");
  assert.equal(requestedUrl, "https://colab.example/ready");
  assert.equal(await checkColabAvailability({ url: "https://colab.example" }, async () => ({
    ok: true,
    text: async () => JSON.stringify({ status: "ok", modelReady: false })
  })), "offline");
  assert.equal(await checkColabAvailability({ url: "https://colab.example" }, async () => ({
    ok: true,
    text: async () => JSON.stringify({ status: "ready", modelReady: false })
  })), "offline");
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

test("hosted inference failures distinguish invalid images, timeouts, and service errors", async () => {
  const { HostedInferenceError, classifyHostedInferenceFailure } = await import("../lib/inference-errors.js");
  assert.equal(
    classifyHostedInferenceFailure(new HostedInferenceError("bad image", { status: 400, code: "invalid_image" })).status,
    "invalid_image"
  );
  assert.equal(
    classifyHostedInferenceFailure(new HostedInferenceError("inference failed", { status: 502, code: "prediction_unavailable" })).status,
    "prediction_unavailable"
  );
  assert.equal(
    classifyHostedInferenceFailure(new HostedInferenceError("artifacts missing", { status: 503, code: "service_unavailable" })).status,
    "service_unavailable"
  );
  assert.equal(
    classifyHostedInferenceFailure(Object.assign(new Error("timed out"), { name: "TimeoutError" })).status,
    "service_unavailable"
  );
});
