import { createSamplingAbortController, openRemoteCog, SAMPLING_TIMEOUT_MS } from "./satellite-cog-client.js";
import { meanValid, ndmi, ndvi, ndwiMcFeeters, scaleReflectance } from "./satellite-indices.js";

const STAC_SEARCH = "https://earth-search.aws.element84.com/v1/search";
const COLLECTION = "sentinel-2-l2a";
const SAMPLE_RADIUS_PIXELS = 1;
const CLOUD_SCL = new Set([3, 8, 9, 10]);

export { SAMPLING_TIMEOUT_MS };

function rfc3339DayBounds(date, bound) {
  const day = date.toISOString().slice(0, 10);
  return bound === "start" ? `${day}T00:00:00.000Z` : `${day}T23:59:59.999Z`;
}

export function rollingDatetimeWindow(now = new Date(), months = 6) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - months);
  return `${rfc3339DayBounds(start, "start")}/${rfc3339DayBounds(end, "end")}`;
}

export function unavailableSatellite(summary, extras = {}) {
  return {
    status: extras.status || "unavailable",
    summary,
    ndvi: null,
    ndwi: null,
    ndmi: null,
    ndwiDefinition: "McFeeters surface-water NDWI = (B03 - B08) / (B03 + B08)",
    ndviDefinition: "NDVI = (B08 - B04) / (B08 + B04)",
    ndmiDefinition: "NDMI = (B08 - B11) / (B08 + B11)",
    sceneDate: null,
    sceneId: null,
    cloudCover: null,
    cloudContaminated: null,
    latitude: extras.latitude ?? null,
    longitude: extras.longitude ?? null,
    source: "Element84 Earth Search Sentinel-2 L2A",
    ...extras
  };
}

function assetHref(scene, names) {
  for (const name of names) {
    const href = scene.assets?.[name]?.href;
    if (typeof href === "string" && href.startsWith("http")) return { name, href, asset: scene.assets[name] };
  }
  return null;
}

function rasterScale(asset) {
  const band = asset?.["raster:bands"]?.[0] || asset?.raster_bands?.[0];
  const scale = Number(band?.scale);
  return Number.isFinite(scale) && scale > 0 ? scale : 0.0001;
}

function rasterNodata(asset) {
  const band = asset?.["raster:bands"]?.[0] || asset?.raster_bands?.[0];
  const nodata = band?.nodata;
  return Number.isFinite(nodata) ? nodata : 0;
}

export function wgs84ToUtm(lat, lon, epsg) {
  const northern = epsg >= 32601 && epsg <= 32660;
  const southern = epsg >= 32701 && epsg <= 32760;
  if (!northern && !southern) return null;
  const zone = epsg % 100;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const lonOrigin = (((zone - 1) * 6) - 180 + 3) * (Math.PI / 180);
  const a = 6378137;
  const e2 = 0.00669437999014;
  const k0 = 0.9996;
  const n = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const t = Math.tan(latRad) ** 2;
  const c = (e2 / (1 - e2)) * Math.cos(latRad) ** 2;
  const aVal = Math.cos(latRad) * (lonRad - lonOrigin);
  const m =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad));
  const easting =
    k0 * n * (aVal + ((1 - t + c) * aVal ** 3) / 6 + ((5 - 18 * t + t ** 2 + 72 * c - 58 * (e2 / (1 - e2))) * aVal ** 5) / 120) +
    500000;
  let northing =
    k0 *
    (m +
      n *
        Math.tan(latRad) *
        ((aVal ** 2) / 2 +
          ((5 - t + 9 * c + 4 * c ** 2) * aVal ** 4) / 24 +
          ((61 - 58 * t + t ** 2 + 600 * c - 330 * (e2 / (1 - e2))) * aVal ** 6) / 720));
  if (!northern) northing += 10000000;
  return { easting, northing };
}

async function sampleCogWindow(href, easting, northing, scale, nodata, signal, openCog) {
  const tiff = await openCog(href, signal);
  const image = await tiff.getImage();
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution();
  const width = image.getWidth();
  const height = image.getHeight();
  const pixelX = Math.floor((easting - originX) / resX);
  const pixelY = Math.floor((originY - northing) / Math.abs(resY));
  const x0 = Math.max(0, pixelX - SAMPLE_RADIUS_PIXELS);
  const y0 = Math.max(0, pixelY - SAMPLE_RADIUS_PIXELS);
  const x1 = Math.min(width, pixelX + SAMPLE_RADIUS_PIXELS + 1);
  const y1 = Math.min(height, pixelY + SAMPLE_RADIUS_PIXELS + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  const rasters = await image.readRasters({ window: [x0, y0, x1, y1], samples: [0], interleave: true, signal });
  const values = Array.from(rasters, (value) => scaleReflectance(Number(value), scale, nodata));
  return meanValid(values);
}

async function sampleSclCloud(href, easting, northing, signal, openCog) {
  const tiff = await openCog(href, signal);
  const image = await tiff.getImage();
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution();
  const pixelX = Math.max(0, Math.min(image.getWidth() - 1, Math.floor((easting - originX) / resX)));
  const pixelY = Math.max(0, Math.min(image.getHeight() - 1, Math.floor((originY - northing) / Math.abs(resY))));
  const rasters = await image.readRasters({ window: [pixelX, pixelY, pixelX + 1, pixelY + 1], samples: [0], interleave: true, signal });
  const scl = Number(rasters[0]);
  return { scl, cloudContaminated: CLOUD_SCL.has(scl) };
}

export async function getSatelliteContext(latitude, longitude, options = {}) {
  if (latitude === undefined || latitude === null || latitude === "" || longitude === undefined || longitude === null || longitude === "") {
    return unavailableSatellite("Field context requires a location. Add latitude and longitude to query Sentinel-2.", { status: "requires_coordinates" });
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return unavailableSatellite("Coordinates were invalid, so satellite context was not queried.", { status: "invalid_coordinates" });
  }

  let response;
  try {
    response = await fetch(STAC_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        collections: [COLLECTION],
        intersects: { type: "Point", coordinates: [lon, lat] },
        datetime: rollingDatetimeWindow(),
        limit: 5,
        query: { "eo:cloud_cover": { lt: 25 } }
      })
    });
  } catch (error) {
    console.error("Satellite lookup failed", error);
    return unavailableSatellite("Satellite context is temporarily unavailable. Leaf analysis can continue without it.", { latitude: lat, longitude: lon, status: "processing_failed" });
  }
  if (!response.ok) {
    let providerDescription = null;
    try {
      const errorBody = await response.json();
      providerDescription = typeof errorBody?.description === "string"
        ? errorBody.description
        : typeof errorBody?.message === "string"
          ? errorBody.message
          : null;
    } catch {
      providerDescription = null;
    }
    console.error("Satellite STAC search failed", {
      httpStatus: response.status,
      providerDescription
    });
    return unavailableSatellite("Satellite context is temporarily unavailable. Leaf analysis can continue without it.", {
      latitude: lat,
      longitude: lon,
      status: "processing_failed"
    });
  }
  const data = await response.json();
  const scene = (data.features || []).sort((a, b) => (a.properties?.["eo:cloud_cover"] ?? 100) - (b.properties?.["eo:cloud_cover"] ?? 100))[0];
  if (!scene) {
    return unavailableSatellite("No low-cloud Sentinel-2 scene was found for these coordinates in the last six months.", { latitude: lat, longitude: lon, status: "unavailable" });
  }

  const red = assetHref(scene, ["red", "B04"]);
  const nir = assetHref(scene, ["nir", "B08"]);
  const green = assetHref(scene, ["green", "B03"]);
  const swir = assetHref(scene, ["swir16", "B11"]);
  const scl = assetHref(scene, ["scl"]);
  const epsg = Number(scene.properties?.["proj:epsg"]);
  const projected = Number.isFinite(epsg) ? wgs84ToUtm(lat, lon, epsg) : null;
  const sceneDate = scene.properties?.datetime?.slice(0, 10) || null;
  const sceneId = scene.id || scene.properties?.["s2:granule_id"] || null;
  const cloudCover = Number.isFinite(Number(scene.properties?.["eo:cloud_cover"])) ? Number(scene.properties["eo:cloud_cover"]) : null;

  if (!red || !nir || !green || !projected) {
    return {
      ...unavailableSatellite("A Sentinel-2 scene was found, but the spectral band assets needed for index calculation were not available.", {
        latitude: lat,
        longitude: lon,
        status: "unavailable"
      }),
      sceneDate,
      sceneId,
      cloudCover
    };
  }

  const timeoutMs = Number.isFinite(Number(options.samplingTimeoutMs)) ? Number(options.samplingTimeoutMs) : SAMPLING_TIMEOUT_MS;
  const openCog = options.openCog || openRemoteCog;
  const samplingAbort = createSamplingAbortController(timeoutMs);
  const samplingStarted = Date.now();
  try {
    const [redValue, nirValue, greenValue, swirValue, sclSample] = await Promise.all([
      sampleCogWindow(red.href, projected.easting, projected.northing, rasterScale(red.asset), rasterNodata(red.asset), samplingAbort.signal, openCog),
      sampleCogWindow(nir.href, projected.easting, projected.northing, rasterScale(nir.asset), rasterNodata(nir.asset), samplingAbort.signal, openCog),
      sampleCogWindow(green.href, projected.easting, projected.northing, rasterScale(green.asset), rasterNodata(green.asset), samplingAbort.signal, openCog),
      swir ? sampleCogWindow(swir.href, projected.easting, projected.northing, rasterScale(swir.asset), rasterNodata(swir.asset), samplingAbort.signal, openCog) : Promise.resolve(null),
      scl ? sampleSclCloud(scl.href, projected.easting, projected.northing, samplingAbort.signal, openCog) : Promise.resolve({ scl: null, cloudContaminated: null })
    ]);
    const ndviValue = ndvi(nirValue, redValue);
    const ndwiValue = ndwiMcFeeters(greenValue, nirValue);
    const ndmiValue = swirValue == null ? null : ndmi(nirValue, swirValue);
    if (ndviValue == null && ndwiValue == null) {
      return {
        ...unavailableSatellite("Sentinel-2 bands were read, but nodata or invalid pixels prevented index calculation at this point.", {
          latitude: lat,
          longitude: lon,
          status: "processing_failed"
        }),
        sceneDate,
        sceneId,
        cloudCover,
        cloudContaminated: sclSample.cloudContaminated
      };
    }
    const cloudNote = sclSample.cloudContaminated
      ? " Scene classification at this point indicates cloud or shadow, so the indices may be unreliable."
      : "";
    return {
      status: "available",
      summary: `Sentinel-2 L2A scene ${sceneId || ""} acquired ${sceneDate || "on an unknown date"} was sampled at the supplied coordinates.${cloudNote} NDVI uses B08 and B04. NDWI is McFeeters surface-water NDWI using B03 and B08. NDMI uses B08 and B11 when available. These field indices are not a leaf-disease diagnosis.`.replace(/\s+/g, " ").trim(),
      ndvi: ndviValue,
      ndwi: ndwiValue,
      ndmi: ndmiValue,
      ndwiDefinition: "McFeeters surface-water NDWI = (B03 - B08) / (B03 + B08)",
      ndviDefinition: "NDVI = (B08 - B04) / (B08 + B04)",
      ndmiDefinition: "NDMI = (B08 - B11) / (B08 + B11)",
      sceneDate,
      sceneId,
      cloudCover,
      cloudContaminated: sclSample.cloudContaminated,
      latitude: lat,
      longitude: lon,
      source: "Element84 Earth Search Sentinel-2 L2A"
    };
  } catch (error) {
    const timedOut = samplingAbort.signal.aborted && /timed out/i.test(samplingAbort.signal.reason?.message || error?.message || "");
    console.error("Satellite band sampling failed", {
      name: timedOut ? "AbortError" : error?.name || null,
      message: timedOut ? "Band sampling timed out" : error?.message || String(error),
      elapsedMs: Date.now() - samplingStarted,
      sceneId,
      timeoutMs,
      assetHosts: [red, nir, green, swir, scl].filter(Boolean).map((item) => {
        try {
          return new URL(item.href).host;
        } catch {
          return "invalid-url";
        }
      })
    });
    return {
      ...unavailableSatellite("A Sentinel-2 scene was found, but band sampling failed on this runtime. Index values were not invented.", {
        latitude: lat,
        longitude: lon,
        status: "processing_failed"
      }),
      sceneDate,
      sceneId,
      cloudCover
    };
  } finally {
    samplingAbort.dispose();
  }
}
