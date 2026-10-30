import { runHostedInference } from "./hosted-inference.js";

export const DEFAULT_INFERENCE_PROVIDER = "colab";

export const INFERENCE_PROVIDERS = {
  colab: {
    label: "Google Colab (primary)",
    urlEnv: "COLAB_INFERENCE_URL",
    keyEnv: "COLAB_INFERENCE_API_KEY"
  },
  render: {
    label: "Render (optional)",
    urlEnv: "INFERENCE_SERVICE_URL",
    keyEnv: "INFERENCE_SERVICE_API_KEY"
  }
};

export function isInferenceProvider(value) {
  return value === "render" || value === "colab";
}

export function getProviderConfig(provider = DEFAULT_INFERENCE_PROVIDER) {
  if (!isInferenceProvider(provider)) return null;
  const definition = INFERENCE_PROVIDERS[provider];
  const url = process.env[definition.urlEnv];
  if (!url) return { provider, url: null, apiKey: null };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return { provider, url: null, apiKey: null };
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return { provider, url: null, apiKey: null };
    return { provider, url: parsed.toString().replace(/\/$/, ""), apiKey: process.env[definition.keyEnv] || null };
  } catch {
    return { provider, url: null, apiKey: null };
  }
}

export async function runInferenceProvider(provider, imageData) {
  const config = getProviderConfig(provider);
  if (!config?.url) throw new Error(`${INFERENCE_PROVIDERS[provider].label} is not configured.`);
  return runHostedInference(imageData, {
    provider,
    url: config.url,
    apiKey: config.apiKey,
    timeoutMs: provider === "colab" ? 120000 : undefined
  });
}
