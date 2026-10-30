import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  CogRangeClient,
  createSamplingAbortController,
  nodeRangeTransport,
  SAMPLING_TIMEOUT_MS
} from "../lib/satellite-cog-client.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("sampling budget is 30 seconds", () => {
  assert.equal(SAMPLING_TIMEOUT_MS, 30000);
});

test("COG client sends Range and preserves HTTP 206 partial content", async () => {
  const calls = [];
  const payload = new Uint8Array([9, 8, 7, 6]).buffer;
  const client = new CogRangeClient("https://sentinel-cogs.s3.us-west-2.amazonaws.com/B04.tif", {
    transport: async ({ url, headers }) => {
      calls.push({ url, range: headers.Range });
      return {
        status: 206,
        headers: {
          "Content-Range": "bytes 0-65535/237917969",
          "Content-Type": "image/tiff; application=geotiff; profile=cloud-optimized"
        },
        getData: async () => payload
      };
    }
  });
  const response = await client.request({ headers: { Range: "bytes=0-65535" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].range, "bytes=0-65535");
  assert.equal(response.status, 206);
  assert.equal(response.ok, true);
  assert.equal(response.getHeader("content-range"), "bytes 0-65535/237917969");
  assert.equal((await response.getData()).byteLength, 4);
});

test("COG client rejects HTTP 200 full-file responses without reading the body", async () => {
  let getDataCalled = false;
  let abortedBody = false;
  const client = new CogRangeClient("https://example.invalid/B04.tif", {
    transport: async () => ({
      status: 200,
      ok: true,
      headers: { "content-length": "240000000" },
      abortBody: async () => {
        abortedBody = true;
      },
      getData: async () => {
        getDataCalled = true;
        return new ArrayBuffer(240000000);
      }
    })
  });
  await assert.rejects(
    () => client.request({ headers: { Range: "bytes=0-65535" } }),
    /Server responded with full file/
  );
  assert.equal(getDataCalled, false);
  assert.equal(abortedBody, true);
});

test("COG client does not use global fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async (...args) => {
    fetchCalled = true;
    return originalFetch(...args);
  };
  try {
    const client = new CogRangeClient("https://example.invalid/B08.tif", {
      transport: async ({ headers }) => {
        assert.equal(headers.Range, "bytes=0-7");
        return {
          status: 206,
          headers: { "content-range": "bytes 0-7/8" },
          getData: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer
        };
      }
    });
    const response = await client.request({ headers: { Range: "bytes=0-7" } });
    assert.equal(response.status, 206);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("COG client abort signal cancels the underlying transport request", async () => {
  let aborted = false;
  const controller = new AbortController();
  const client = new CogRangeClient("https://example.invalid/B03.tif", {
    transport: ({ signal }) => new Promise((_, reject) => {
      const fail = () => {
        aborted = true;
        reject(signal.reason || new Error("Aborted"));
      };
      if (signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener("abort", fail, { once: true });
    })
  });
  const pending = client.request({
    headers: { Range: "bytes=0-1023" },
    signal: controller.signal
  });
  controller.abort();
  await assert.rejects(pending);
  assert.equal(aborted, true);
});

test("node range transport accepts HTTP 206 and rejects HTTP 200 without draining the body", async () => {
  let fullFileBytesSent = 0;
  const server = http.createServer((req, res) => {
    assert.equal(req.headers.range, "bytes=0-3");
    if (req.url === "/partial") {
      res.statusCode = 206;
      res.setHeader("Content-Range", "bytes 0-3/100");
      res.setHeader("Content-Type", "image/tiff");
      res.end(Buffer.from([1, 2, 3, 4]));
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Length", "1048576");
    res.write(Buffer.alloc(64 * 1024, 7));
    fullFileBytesSent += 64 * 1024;
    const timer = setInterval(() => {
      res.write(Buffer.alloc(64 * 1024, 7));
      fullFileBytesSent += 64 * 1024;
    }, 20);
    req.on("close", () => clearInterval(timer));
  });
  const base = await listen(server);
  try {
    const partial = await nodeRangeTransport({
      url: `${base}/partial`,
      headers: { Range: "bytes=0-3" }
    });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers["content-range"], "bytes 0-3/100");
    assert.equal((await partial.getData()).byteLength, 4);

    const client = new CogRangeClient(`${base}/full`);
    await assert.rejects(
      () => client.request({ headers: { Range: "bytes=0-3" } }),
      /Server responded with full file/
    );
    assert.ok(fullFileBytesSent < 1048576, "full COG body must not be downloaded");
  } finally {
    await close(server);
  }
});

test("node range transport abort destroys the in-flight HTTP request", async () => {
  let requestStarted = false;
  const server = http.createServer(() => {
    requestStarted = true;
  });
  const base = await listen(server);
  const abort = createSamplingAbortController(40);
  try {
    const pending = nodeRangeTransport({
      url: `${base}/hang`,
      headers: { Range: "bytes=0-65535" },
      signal: abort.signal
    });
    await assert.rejects(pending, /timed out/i);
    assert.equal(abort.signal.aborted, true);
    assert.equal(requestStarted, true);
  } finally {
    abort.dispose();
    await close(server);
  }
});
