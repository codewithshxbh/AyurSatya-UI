import test from "node:test";
import assert from "node:assert/strict";
import { meanValid, ndmi, ndvi, ndwiMcFeeters, scaleReflectance } from "../lib/satellite-indices.js";
import { getSatelliteContext, rollingDatetimeWindow, SAMPLING_TIMEOUT_MS, unavailableSatellite, wgs84ToUtm } from "../lib/satellite.js";

function assertAlmostEqual(actual, expected) {
  assert.equal(typeof actual, "number");
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} !== ${expected}`);
}

test("NDVI uses (NIR - red) / (NIR + red)", () => {
  assertAlmostEqual(ndvi(3, 1), 0.5);
});

test("McFeeters NDWI uses (green - NIR) / (green + NIR)", () => {
  assertAlmostEqual(ndwiMcFeeters(1, 3), -0.5);
});

test("NDMI is distinct and uses (NIR - SWIR) / (NIR + SWIR)", () => {
  assertAlmostEqual(ndmi(3, 1), 0.5);
  assertAlmostEqual(ndwiMcFeeters(1, 3), -0.5);
  assert.notEqual(ndmi(3, 1), ndwiMcFeeters(1, 3));
});

test("zero denominators and non-finite inputs return null", () => {
  assert.equal(ndvi(0.4, -0.4), null);
  assert.equal(ndwiMcFeeters(Number.NaN, 0.2), null);
  assert.equal(ndmi(Number.POSITIVE_INFINITY, 0.1), null);
});

test("nodata and invalid pixels are excluded from the mean", () => {
  assert.equal(scaleReflectance(0, 0.0001, 0), null);
  assert.equal(scaleReflectance(10000, 0.0001, 0), 1);
  assertAlmostEqual(meanValid([null, Number.NaN, 0.2, 0.4]), 0.3);
  assert.equal(meanValid([null, Number.NaN]), null);
});

test("missing coordinates return an explicit requires-coordinates state", async () => {
  const result = await getSatelliteContext("", "");
  assert.equal(result.status, "requires_coordinates");
  assert.equal(result.ndvi, null);
  assert.equal(result.ndwi, null);
});

test("invalid coordinates are not queried", async () => {
  const result = await getSatelliteContext(120, 10);
  assert.equal(result.status, "invalid_coordinates");
  assert.equal(result.ndvi, null);
});

test("missing scenes return unavailable without inventing indices", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ features: [] })
  });
  try {
    const result = await getSatelliteContext(28.6139, 77.209);
    assert.equal(result.status, "unavailable");
    assert.equal(result.ndvi, null);
    assert.equal(result.ndwi, null);
    assert.match(result.summary, /No low-cloud Sentinel-2 scene/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing spectral bands return unavailable and keep scene metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      features: [{
        id: "S2A_scene",
        properties: {
          datetime: "2026-01-15T05:00:00Z",
          "eo:cloud_cover": 8,
          "proj:epsg": 32643
        },
        assets: {}
      }]
    })
  });
  try {
    const result = await getSatelliteContext(28.6139, 77.209);
    assert.equal(result.status, "unavailable");
    assert.equal(result.ndvi, null);
    assert.equal(result.sceneId, "S2A_scene");
    assert.equal(result.sceneDate, "2026-01-15");
    assert.equal(result.cloudCover, 8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unavailable satellite results preserve source attribution and formulas", () => {
  const result = unavailableSatellite("No scene.");
  assert.equal(result.source, "Element84 Earth Search Sentinel-2 L2A");
  assert.match(result.ndviDefinition, /B08 - B04/);
  assert.match(result.ndwiDefinition, /B03 - B08/);
  assert.match(result.ndmiDefinition, /B08 - B11/);
});

test("rolling datetime window uses a six-month lookback", () => {
  assert.equal(rollingDatetimeWindow(new Date("2026-10-30T00:00:00Z")), "2026-04-30T00:00:00.000Z/2026-10-30T23:59:59.999Z");
});

test("rolling datetime window is an inclusive RFC3339 UTC interval, never date-only", () => {
  const window = rollingDatetimeWindow(new Date("2026-10-30T15:02:16.123Z"));
  const [start, end] = window.split("/");
  const rfc3339Instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  assert.equal(start, "2026-04-30T00:00:00.000Z");
  assert.equal(end, "2026-10-30T23:59:59.999Z");
  assert.match(start, rfc3339Instant);
  assert.match(end, rfc3339Instant);
  assert.doesNotMatch(window, /^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/);
  assert.equal(window.includes("T"), true);
  assert.equal(start.endsWith("Z") && end.endsWith("Z"), true);
});

test("non-OK STAC responses are processing failures, not empty scene results", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const diagnostics = [];
  console.error = (...args) => diagnostics.push(args);
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      code: "BadRequest",
      description: "datetime value is invalid, does not match RFC3339 format"
    })
  });
  try {
    const result = await getSatelliteContext(28.6139, 77.209);
    assert.equal(result.status, "processing_failed");
    assert.equal(result.ndvi, null);
    assert.doesNotMatch(result.summary, /did not return a scene/i);
    assert.doesNotMatch(result.summary, /No low-cloud Sentinel-2 scene/i);
    assert.doesNotMatch(result.summary, /RFC3339/i);
    assert.equal(JSON.stringify(result).includes("datetime value is invalid"), false);
    assert.equal(diagnostics.some((entry) => entry.some((value) => value?.httpStatus === 400 && /RFC3339/.test(value?.providerDescription || ""))), true);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("UTM conversion rejects geographic EPSG and returns finite 43N coordinates", () => {
  assert.equal(wgs84ToUtm(28.6139, 77.209, 4326), null);
  const point = wgs84ToUtm(28.6139, 77.209, 32643);
  assert.ok(Number.isFinite(point.easting));
  assert.ok(Number.isFinite(point.northing));
});

function productionSceneAssets() {
  const band = { "raster:bands": [{ data_type: "uint16", nodata: 0, scale: 0.0001 }] };
  return {
    id: "S2B_43RGM_20261005_0_L2A",
    properties: {
      datetime: "2026-10-05T05:41:03.148000Z",
      "eo:cloud_cover": 0.000056,
      "proj:epsg": 32643
    },
    assets: {
      red: { href: "https://example.invalid/red.tif", ...band },
      nir: { href: "https://example.invalid/nir.tif", ...band },
      green: { href: "https://example.invalid/green.tif", ...band },
      swir16: { href: "https://example.invalid/swir16.tif", ...band },
      scl: { href: "https://example.invalid/scl.tif", "raster:bands": [{ data_type: "uint8", nodata: 0 }] }
    }
  };
}

function fakeCog(fill) {
  return {
    async getImage() {
      return {
        getOrigin: () => [699960, 3200040],
        getResolution: () => [10, -10],
        getWidth: () => 10980,
        getHeight: () => 10980,
        async readRasters({ window }) {
          const count = Math.max(1, (window[2] - window[0]) * (window[3] - window[1]));
          return new Uint16Array(count).fill(fill);
        }
      };
    }
  };
}

test("satellite sampling still requests all five COG assets", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  console.error = () => {};
  const opened = [];
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ features: [productionSceneAssets()] })
  });
  const fills = {
    "red.tif": 1000,
    "nir.tif": 3000,
    "green.tif": 1200,
    "swir16.tif": 2000,
    "scl.tif": 4
  };
  try {
    const result = await getSatelliteContext(28.363, 77.5436, {
      openCog: async (href) => {
        opened.push(href.split("/").at(-1));
        return fakeCog(fills[href.split("/").at(-1)]);
      }
    });
    assert.deepEqual(opened.sort(), ["green.tif", "nir.tif", "red.tif", "scl.tif", "swir16.tif"]);
    assert.equal(result.status, "available");
    assert.equal(result.sceneId, "S2B_43RGM_20261005_0_L2A");
    assert.equal(result.ndvi != null, true);
    assert.equal(result.ndwi != null, true);
    assert.equal(result.ndmi != null, true);
    assert.equal(result.cloudContaminated, false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("sampling timeout aborts in-flight COG opens", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const diagnostics = [];
  console.error = (...args) => diagnostics.push(args);
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ features: [productionSceneAssets()] })
  });
  const opened = [];
  const aborted = [];
  try {
    const result = await getSatelliteContext(28.363, 77.5436, {
      samplingTimeoutMs: 40,
      openCog: async (href, signal) => {
        opened.push(href.split("/").at(-1));
        await new Promise((_, reject) => {
          const fail = () => {
            aborted.push(href.split("/").at(-1));
            reject(signal.reason || new Error("Aborted"));
          };
          if (signal.aborted) {
            fail();
            return;
          }
          signal.addEventListener("abort", fail, { once: true });
        });
      }
    });
    assert.equal(result.status, "processing_failed");
    assert.equal(result.ndvi, null);
    assert.match(result.summary, /band sampling failed on this runtime/i);
    assert.equal(JSON.stringify(result).includes("example.invalid"), false);
    assert.equal(opened.length, 5);
    assert.equal(aborted.length, 5);
    assert.equal(SAMPLING_TIMEOUT_MS, 30000);
    assert.equal(diagnostics.some((entry) => entry.some((value) => value?.message === "Band sampling timed out")), true);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

