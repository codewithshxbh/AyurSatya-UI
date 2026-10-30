"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  FIELD_LOCATION_SOURCE,
  createPointSelection,
  formatCoordinate,
  geolocationErrorMessage,
  geolocationUnsupportedMessage,
  parseFieldPoint
} from "../../lib/field-location";

const SATELLITE_SOURCE = "ayursatya-satellite";
const SATELLITE_LAYER = "ayursatya-satellite-layer";
const SEARCH_DEBOUNCE_MS = 300;

export default function FieldLocationPicker({
  latitude,
  longitude,
  confirmed = false,
  onConfirm,
  onClear
}) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const searchTimer = useRef(null);
  const resizeObserver = useRef(null);
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [basemap, setBasemap] = useState("standard");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");
  const [draft, setDraft] = useState(() => createPointSelection({ latitude, longitude, confirmed: false }));
  const draftRef = useRef(draft);
  const confirmedRef = useRef(confirmed);
  const onClearRef = useRef(onClear);
  const applyDraftRef = useRef(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    confirmedRef.current = confirmed;
    onClearRef.current = onClear;
  }, [confirmed, onClear]);

  useEffect(() => {
    const point = parseFieldPoint(latitude, longitude);
    if (!point) return;
    setDraft((current) => {
      if (current.latitude === point.latitude && current.longitude === point.longitude) return current;
      return createPointSelection({ ...point, source: current.source || FIELD_LOCATION_SOURCE.MANUAL, confirmed });
    });
    setManualLat(formatCoordinate(point.latitude));
    setManualLon(formatCoordinate(point.longitude));
  }, [latitude, longitude, confirmed]);

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      try {
        const response = await fetch("/api/maps/config", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Map configuration is unavailable.");
        if (!cancelled) {
          setConfig(payload);
          setBasemap(payload.satelliteAvailable ? "satellite" : "standard");
        }
      } catch {
        if (!cancelled) setConfigError("The map could not be configured. Use the advanced coordinates option.");
      }
    }
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const bindMarker = useCallback((marker) => {
    marker.on("dragend", () => {
      const lngLat = marker.getLngLat();
      applyDraftRef.current?.(createPointSelection({
        latitude: lngLat.lat,
        longitude: lngLat.lng,
        source: FIELD_LOCATION_SOURCE.MAP
      }), false);
    });
  }, []);

  const placeMarker = useCallback((lat, lon, fly) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: "#1c73b3", draggable: true }).setLngLat([lon, lat]).addTo(map);
      bindMarker(markerRef.current);
    } else {
      markerRef.current.setLngLat([lon, lat]);
    }
    if (fly) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), essential: true });
  }, [bindMarker]);

  useEffect(() => {
    if (!config || !mapNode.current || mapRef.current) return undefined;
    let cancelled = false;
    let map;
    try {
      map = new maplibregl.Map({
        container: mapNode.current,
        style: config.standardStyleUrl,
        center: config.defaultCenter,
        zoom: config.defaultZoom,
        attributionControl: true
      });
    } catch {
      setMapError("The map could not start in this browser.");
      return undefined;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      if (cancelled) return;
      if (config.satelliteAvailable) {
        map.addSource(SATELLITE_SOURCE, {
          type: "raster",
          tiles: [config.satelliteTiles],
          tileSize: 256,
          attribution: config.satelliteAttribution
        });
        map.addLayer({
          id: SATELLITE_LAYER,
          type: "raster",
          source: SATELLITE_SOURCE,
          layout: { visibility: "visible" }
        });
      }
      const existing = parseFieldPoint(draftRef.current.latitude, draftRef.current.longitude);
      if (existing) placeMarker(existing.latitude, existing.longitude, true);
      setMapReady(true);
      map.resize();
    });
    map.on("error", (event) => {
      if (cancelled || event?.sourceId === SATELLITE_SOURCE) return;
      setMapError("Map tiles could not be loaded. You can still enter coordinates manually.");
    });
    map.on("click", (event) => {
      applyDraftRef.current?.(createPointSelection({
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
        source: FIELD_LOCATION_SOURCE.MAP
      }), false);
    });
    mapRef.current = map;
    if (typeof ResizeObserver === "function") {
      resizeObserver.current = new ResizeObserver(() => map.resize());
      resizeObserver.current.observe(mapNode.current);
    }
    const resize = () => map.resize();
    window.addEventListener("resize", resize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      resizeObserver.current?.disconnect();
      resizeObserver.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [config, placeMarker]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.getLayer?.(SATELLITE_LAYER)) return;
    map.setLayoutProperty(SATELLITE_LAYER, "visibility", basemap === "satellite" ? "visible" : "none");
  }, [basemap, mapReady]);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  function applyDraft(next, fly) {
    setDraft(next);
    setQuery((current) => (next.source === FIELD_LOCATION_SOURCE.SEARCH ? current : ""));
    if (next.source !== FIELD_LOCATION_SOURCE.SEARCH) setSuggestions([]);
    setSearchError("");
    setGeoError("");
    const point = parseFieldPoint(next.latitude, next.longitude);
    if (point) {
      setManualLat(formatCoordinate(point.latitude));
      setManualLon(formatCoordinate(point.longitude));
      placeMarker(point.latitude, point.longitude, fly);
    }
    if (confirmedRef.current) onClearRef.current?.();
  }

  applyDraftRef.current = applyDraft;

  function submitSearch(event) {
    event?.preventDefault?.();
    const value = query.trim();
    setSearchError("");
    setSuggestions([]);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.length < 3) {
      setSearchError("Enter at least three characters to search.");
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const center = mapRef.current?.getCenter?.();
        const params = new URLSearchParams({ q: value });
        if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
          params.set("lat", String(center.lat));
          params.set("lon", String(center.lng));
        }
        const response = await fetch(`/api/geocode/search?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json();
        if (response.status === 429) {
          setSuggestions([]);
          setSearchError(payload.error || "Too many place searches. Wait a moment and try again.");
          return;
        }
        if (!response.ok) {
          setSuggestions([]);
          setSearchError(payload.error || "Place search is temporarily unavailable.");
          return;
        }
        setSuggestions(payload.results || []);
        setSearchError(payload.error && !(payload.results || []).length ? payload.error : "");
      } catch {
        setSuggestions([]);
        setSearchError("Place search is temporarily unavailable. Try again, or click the map.");
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function selectSuggestion(result) {
    applyDraft(createPointSelection({
      latitude: result.latitude,
      longitude: result.longitude,
      label: result.label,
      source: FIELD_LOCATION_SOURCE.SEARCH
    }), true);
    setQuery(result.label);
    setSuggestions([]);
  }

  function useCurrentLocation() {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError(geolocationUnsupportedMessage());
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyDraft(createPointSelection({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: FIELD_LOCATION_SOURCE.GEOLOCATION
        }), true);
        setGeoBusy(false);
      },
      (error) => {
        setGeoError(geolocationErrorMessage(error));
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function confirmDraft() {
    if (!parseFieldPoint(draft.latitude, draft.longitude)) return;
    onConfirm?.({
      ...draft,
      confirmed: true
    });
  }

  function applyManual() {
    const point = parseFieldPoint(manualLat, manualLon);
    if (!point) {
      setGeoError("Enter valid coordinates: latitude -90 to 90 and longitude -180 to 180.");
      return;
    }
    const next = createPointSelection({ ...point, source: FIELD_LOCATION_SOURCE.MANUAL, confirmed: true });
    setDraft(next);
    setGeoError("");
    placeMarker(next.latitude, next.longitude, true);
    onConfirm?.(next);
  }

  function clearSelection() {
    setDraft(createPointSelection({}));
    setQuery("");
    setSuggestions([]);
    setManualLat("");
    setManualLon("");
    setSearchError("");
    setGeoError("");
    markerRef.current?.remove();
    markerRef.current = null;
    onClear?.();
  }

  const draftPoint = parseFieldPoint(draft.latitude, draft.longitude);
  const committedPoint = parseFieldPoint(latitude, longitude);
  const hasDraft = Boolean(draftPoint);
  const isCommitted = Boolean(confirmed && committedPoint && draftPoint && committedPoint.latitude === draftPoint.latitude && committedPoint.longitude === draftPoint.longitude);

  return (
    <div className="field-location-picker">
      <div>
        <h3>Select field location</h3>
        <p className="field-location-copy">Search for a village, town, address, farm or landmark, or click the actual field on the map. This chooses a point for Sentinel-2 sampling. It does not verify that the point is an agricultural field.</p>
      </div>
      {configError && <p className="form-error">{configError}</p>}
      <form className="field-location-search" onSubmit={submitSearch}>
        <label className="field">
          <span>Search for a place</span>
          <div className="field-location-search-row">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchError("");
              }}
              placeholder="Village, town, address, farm or landmark"
              autoComplete="off"
            />
            <button type="submit" className="button button-secondary" disabled={searching}>{searching ? "Searching..." : "Search"}</button>
          </div>
        </label>
        {searchError && <p className="form-error">{searchError}</p>}
        {suggestions.length > 0 && (
          <ul className="field-location-suggestions">
            {suggestions.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => selectSuggestion(item)}>{item.label}</button>
              </li>
            ))}
          </ul>
        )}
      </form>
      <div className="field-location-map-shell">
        <div className="field-location-toolbar">
          <div className="field-location-layers" role="group" aria-label="Map layer">
            <button type="button" className={basemap === "standard" ? "is-active" : ""} onClick={() => setBasemap("standard")}>Map</button>
            <button type="button" className={basemap === "satellite" ? "is-active" : ""} onClick={() => setBasemap("satellite")} disabled={!config?.satelliteAvailable}>Satellite</button>
          </div>
          <button type="button" className="button button-secondary field-location-locate" onClick={useCurrentLocation} disabled={geoBusy}>
            {geoBusy ? "Locating..." : "Use my current location"}
          </button>
        </div>
        <div className="field-location-map" ref={mapNode} role="application" aria-label="Field location map" />
        {!mapReady && !configError && <p className="field-location-map-status">Loading map...</p>}
      </div>
      {mapError && <p className="form-error">{mapError}</p>}
      {geoError && <p className="form-error">{geoError}</p>}
      <div className="field-location-selection">
        <div>
          <span>Selected coordinates</span>
          <strong>{draftPoint ? `${formatCoordinate(draftPoint.latitude)}, ${formatCoordinate(draftPoint.longitude)}` : "No point selected"}</strong>
          <small>{isCommitted ? "This point will be sent for satellite context." : hasDraft ? "Confirm this point before running satellite context." : "Search, click the map, or use current location."}</small>
        </div>
        <div className="field-location-actions">
          <button type="button" className="button button-ghost" onClick={clearSelection} disabled={!hasDraft && !query}>Clear</button>
          <button type="button" className="button button-primary" onClick={confirmDraft} disabled={!hasDraft || isCommitted}>{isCommitted ? "Location confirmed" : "Confirm location"}</button>
        </div>
      </div>
      <p className="field-location-attribution">Map: OpenFreeMap / OpenStreetMap. Place search: Photon / OpenStreetMap.{config?.satelliteAvailable ? " Satellite overlay: Esri World Imagery." : ""}</p>
      <details className="field-location-advanced">
        <summary>Advanced: enter latitude and longitude</summary>
        <div className="location-fields">
          <label className="field"><span>Field latitude</span><input value={manualLat} onChange={(event) => setManualLat(event.target.value)} placeholder="e.g. 28.6139" /></label>
          <label className="field"><span>Field longitude</span><input value={manualLon} onChange={(event) => setManualLon(event.target.value)} placeholder="e.g. 77.2090" /></label>
        </div>
        <button type="button" className="button button-secondary" onClick={applyManual}>Apply coordinates</button>
      </details>
    </div>
  );
}
