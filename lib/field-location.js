export const FIELD_LOCATION_MODE = {
  POINT: "point"
};

export const FIELD_LOCATION_SOURCE = {
  MAP: "map",
  SEARCH: "search",
  GEOLOCATION: "geolocation",
  MANUAL: "manual"
};

export function createEmptyFieldLocation() {
  return {
    mode: FIELD_LOCATION_MODE.POINT,
    latitude: null,
    longitude: null,
    polygon: null,
    label: "",
    source: null,
    confirmed: false
  };
}

export function parseCoordinate(value, minimum, maximum) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) return null;
  return numeric;
}

export function parseFieldPoint(latitude, longitude) {
  const lat = parseCoordinate(latitude, -90, 90);
  const lon = parseCoordinate(longitude, -180, 180);
  if (lat == null || lon == null) return null;
  return { latitude: lat, longitude: lon };
}

export function isValidFieldPoint(location) {
  return Boolean(parseFieldPoint(location?.latitude, location?.longitude));
}

export function formatCoordinate(value, digits = 5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(digits);
}

export function createPointSelection({ latitude, longitude, label = "", source = FIELD_LOCATION_SOURCE.MAP, confirmed = false } = {}) {
  const point = parseFieldPoint(latitude, longitude);
  if (!point) return createEmptyFieldLocation();
  return {
    mode: FIELD_LOCATION_MODE.POINT,
    latitude: point.latitude,
    longitude: point.longitude,
    polygon: null,
    label: typeof label === "string" ? label : "",
    source,
    confirmed: Boolean(confirmed)
  };
}

export function toAnalyzeCoordinates(location) {
  if (!location?.confirmed || location.mode !== FIELD_LOCATION_MODE.POINT) {
    return { latitude: "", longitude: "" };
  }
  const point = parseFieldPoint(location.latitude, location.longitude);
  if (!point) return { latitude: "", longitude: "" };
  return {
    latitude: String(point.latitude),
    longitude: String(point.longitude)
  };
}

export function analyzeSatelliteCoordinates(satelliteContext, latitude, longitude, confirmed) {
  if (satelliteContext !== "coordinates") return { latitude: "", longitude: "" };
  return toAnalyzeCoordinates({
    mode: FIELD_LOCATION_MODE.POINT,
    latitude,
    longitude,
    confirmed
  });
}

export function geolocationErrorMessage(error) {
  if (!error) return "Current location could not be determined.";
  if (error.code === 1) return "Location permission was denied. You can search or click the map instead.";
  if (error.code === 2) return "Current location is unavailable. You can search or click the map instead.";
  if (error.code === 3) return "Current location timed out. Try again, or search or click the map.";
  return "Current location could not be determined.";
}

export function geolocationUnsupportedMessage() {
  return "This browser does not support current location. Search or click the map instead.";
}
