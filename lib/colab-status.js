export async function checkColabAvailability(config, fetchImpl = fetch) {
  if (!config?.url) return "unconfigured";
  try {
    const response = await fetchImpl(`${config.url}/health`, {
      headers: config.apiKey ? { "X-API-Key": config.apiKey } : {},
      signal: AbortSignal.timeout(5000),
      cache: "no-store"
    });
    const payload = await response.json();
    const available = response.ok && payload?.status === "ok" && typeof payload?.modelReady === "boolean";
    return available ? "available" : "offline";
  } catch (error) {
    console.error("Colab inference health check failed", { name: error?.name || "Error" });
    return "offline";
  }
}
