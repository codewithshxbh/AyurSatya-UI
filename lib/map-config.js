const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_SATELLITE_ATTRIBUTION = "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
const DEFAULT_STANDARD_ATTRIBUTION = "OpenFreeMap © OpenMapTiles Data from OpenStreetMap";
const DEFAULT_CENTER = [78.9629, 20.5937];
const DEFAULT_ZOOM = 4.4;

function envValue(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function getPublicMapConfig() {
  const standardStyleUrl = envValue("MAP_STYLE_URL", DEFAULT_STYLE_URL);
  const satelliteTiles = envValue("MAP_SATELLITE_TILES", DEFAULT_SATELLITE_TILES);
  const satelliteAttribution = envValue("MAP_SATELLITE_ATTRIBUTION", DEFAULT_SATELLITE_ATTRIBUTION);
  const standardAttribution = envValue("MAP_STANDARD_ATTRIBUTION", DEFAULT_STANDARD_ATTRIBUTION);
  const centerLon = Number(envValue("MAP_DEFAULT_LONGITUDE", String(DEFAULT_CENTER[0])));
  const centerLat = Number(envValue("MAP_DEFAULT_LATITUDE", String(DEFAULT_CENTER[1])));
  const zoom = Number(envValue("MAP_DEFAULT_ZOOM", String(DEFAULT_ZOOM)));
  return {
    standardStyleUrl,
    satelliteTiles,
    satelliteAttribution,
    standardAttribution,
    satelliteAvailable: Boolean(satelliteTiles && satelliteTiles.includes("{z}")),
    defaultCenter: [
      Number.isFinite(centerLon) ? centerLon : DEFAULT_CENTER[0],
      Number.isFinite(centerLat) ? centerLat : DEFAULT_CENTER[1]
    ],
    defaultZoom: Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM
  };
}

export function getGeocoderConfig() {
  return {
    baseUrl: envValue("GEOCODER_BASE_URL", "https://photon.komoot.io").replace(/\/$/, ""),
    userAgent: envValue("GEOCODER_USER_AGENT", "AyurSatya/0.1 (field location search; educational agricultural analysis)")
  };
}
