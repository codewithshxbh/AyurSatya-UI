export function spectralIndex(first, second) {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const denominator = first + second;
  if (denominator === 0) return null;
  const value = (first - second) / denominator;
  return Number.isFinite(value) ? value : null;
}

export function ndvi(nir, red) {
  return spectralIndex(nir, red);
}

export function ndwiMcFeeters(green, nir) {
  return spectralIndex(green, nir);
}

export function ndmi(nir, swir) {
  return spectralIndex(nir, swir);
}

export function scaleReflectance(value, scale = 1, nodata = 0) {
  if (!Number.isFinite(value) || value === nodata) return null;
  const scaled = value * scale;
  return Number.isFinite(scaled) ? scaled : null;
}

export function meanValid(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}
