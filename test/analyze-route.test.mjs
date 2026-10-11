import test from "node:test";
import assert from "node:assert/strict";

const imageData = "data:image/png;base64,aW1hZ2U=";
const originalFetch = globalThis.fetch;

function mockResponse({ status = 200, body, contentType = "application/json" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    text: async () => body
  };
}

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
