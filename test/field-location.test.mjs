import test from "node:test";
import assert from "node:assert/strict";
import {
  FIELD_LOCATION_MODE,
  FIELD_LOCATION_SOURCE,
  analyzeSatelliteCoordinates,
  createEmptyFieldLocation,
  createPointSelection,
  formatCoordinate,
  geolocationErrorMessage,
  geolocationUnsupportedMessage,
  isValidFieldPoint,
  parseFieldPoint,
  toAnalyzeCoordinates
} from "../lib/field-location.js";
import { getGeocoderConfig, getPublicMapConfig } from "../lib/map-config.js";
import { formatPhotonLabel, presentGeocodeResults, resetGeocodeRateLimitForTests, searchPlaces, validateGeocodeQuery } from "../lib/geocode.js";

test("point selection stores coordinates without implying a verified field", () => {
  const selection = createPointSelection({
    latitude: "28.3630",
    longitude: "77.5436",
    source: FIELD_LOCATION_SOURCE.MAP,
    confirmed: true
  });
  assert.equal(selection.mode, FIELD_LOCATION_MODE.POINT);
  assert.equal(selection.polygon, null);
  assert.equal(selection.confirmed, true);
  assert.equal(isValidFieldPoint(selection), true);
  assert.deepEqual(toAnalyzeCoordinates(selection), {
    latitude: "28.363",
    longitude: "77.5436"
  });
});

test("unconfirmed or invalid locations are not sent to analyze", () => {
  assert.deepEqual(toAnalyzeCoordinates(createEmptyFieldLocation()), { latitude: "", longitude: "" });
  assert.deepEqual(toAnalyzeCoordinates(createPointSelection({ latitude: 28.3, longitude: 77.5 })), { latitude: "", longitude: "" });
  assert.equal(parseFieldPoint("91", "77"), null);
  assert.equal(formatCoordinate(28.3630123), "28.36301");
});

test("geolocation errors stay user-facing and do not auto-request permission", () => {
  assert.match(geolocationErrorMessage({ code: 1 }), /denied/i);
  assert.match(geolocationErrorMessage({ code: 2 }), /unavailable/i);
  assert.match(geolocationErrorMessage({ code: 3 }), /timed out/i);
  assert.match(geolocationUnsupportedMessage(), /does not support/i);
});

test("map config exposes public tile URLs without requiring a browser API key", () => {
  const config = getPublicMapConfig();
  const geocoder = getGeocoderConfig();
  assert.equal(config.standardStyleUrl.includes("openfreemap.org"), true);
  assert.equal(config.satelliteAvailable, true);
  assert.equal(config.satelliteTiles.includes("{z}"), true);
  assert.match(config.satelliteAttribution, /Esri/i);
  assert.equal(geocoder.baseUrl.includes("photon.komoot.io"), true);
  assert.equal(JSON.stringify({ ...config, ...geocoder }).includes("apiKey"), false);
  assert.equal(JSON.stringify({ ...config, ...geocoder }).includes("access_token"), false);
});

test("satellite tiles can be turned off without a placeholder map", () => {
  const previous = process.env.MAP_SATELLITE_TILES;
  process.env.MAP_SATELLITE_TILES = "off";
  const config = getPublicMapConfig();
  assert.equal(config.satelliteAvailable, false);
  if (previous === undefined) delete process.env.MAP_SATELLITE_TILES;
  else process.env.MAP_SATELLITE_TILES = previous;
});

test("geocode query validation rejects empty and short input", () => {
  assert.equal(validateGeocodeQuery("").error.includes("place name"), true);
  assert.equal(validateGeocodeQuery("ab").error.includes("three"), true);
  assert.equal(validateGeocodeQuery("  Palwal  ").query, "Palwal");
});

test("geocode presentation keeps only valid Photon coordinate results", () => {
  assert.equal(formatPhotonLabel({ name: "Palwal", state: "Haryana", country: "India" }), "Palwal, Haryana, India");
  const results = presentGeocodeResults({
    type: "FeatureCollection",
    features: [
      {
        geometry: { type: "Point", coordinates: [77.332, 28.1487] },
        properties: { osm_id: 1, name: "Palwal", state: "Haryana", country: "India" }
      },
      {
        geometry: { type: "Point", coordinates: ["bad", 77] },
        properties: { name: "Broken" }
      },
      {
        geometry: { type: "Point", coordinates: [77, 28] },
        properties: { name: "" }
      }
    ]
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].label, "Palwal, Haryana, India");
  assert.equal(results[0].latitude, 28.1487);
});

test("place search uses Photon and returns empty results without throwing", async () => {
  resetGeocodeRateLimitForTests();
  const result = await searchPlaces("Palwal Haryana", {
    fetchImpl: async (url, options) => {
      assert.equal(String(url).includes("photon.komoot.io/api/"), true);
      assert.equal(String(url).includes("q=Palwal"), true);
      assert.equal(String(url).includes("limit=6"), true);
      assert.equal(options.cache, "no-store");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          features: [{
            geometry: { coordinates: [77.332, 28.1487] },
            properties: { osm_id: 9, name: "Palwal", state: "Haryana", country: "India" }
          }]
        })
      };
    }
  });
  assert.equal(result.status, 200);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].longitude, 77.332);
});

test("place search can bias Photon results with a map center", async () => {
  resetGeocodeRateLimitForTests();
  const result = await searchPlaces("Neem farm", {
    bias: { latitude: 28.363, longitude: 77.5436 },
    fetchImpl: async (url) => {
      assert.equal(String(url).includes("lat=28.363"), true);
      assert.equal(String(url).includes("lon=77.5436"), true);
      return { ok: true, status: 200, json: async () => ({ features: [] }) };
    }
  });
  assert.equal(result.status, 200);
  assert.equal(result.results.length, 0);
});

test("place search maps rate limits and network failures", async () => {
  resetGeocodeRateLimitForTests();
  const limited = await searchPlaces("Neem farm", {
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) })
  });
  assert.equal(limited.status, 429);
  assert.match(limited.error, /Too many place searches/i);
  resetGeocodeRateLimitForTests();
  const down = await searchPlaces("Neem farm", {
    fetchImpl: async () => {
      throw new Error("network down");
    }
  });
  assert.equal(down.status, 503);
});

test("satellite opt-out keeps analyze coordinates empty", () => {
  const selected = createPointSelection({ latitude: 28.363, longitude: 77.5436, confirmed: true });
  const optedOut = { latitude: "", longitude: "" };
  const optedIn = toAnalyzeCoordinates(selected);
  assert.deepEqual(optedOut, { latitude: "", longitude: "" });
  assert.equal(optedIn.latitude.startsWith("28.363"), true);
});

test("analyze payload includes coordinates only after satellite opt-in and confirmation", () => {
  assert.deepEqual(analyzeSatelliteCoordinates("none", 28.363, 77.5436, true), { latitude: "", longitude: "" });
  assert.deepEqual(analyzeSatelliteCoordinates("coordinates", 28.363, 77.5436, false), { latitude: "", longitude: "" });
  assert.deepEqual(analyzeSatelliteCoordinates("coordinates", 28.363, 77.5436, true), { latitude: "28.363", longitude: "77.5436" });
});
