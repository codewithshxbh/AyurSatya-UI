import http from "node:http";
import https from "node:https";

export const SAMPLING_TIMEOUT_MS = 30000;
const MAX_REDIRECTS = 4;

function abortError(signal, fallbackMessage = "Band sampling timed out") {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error(typeof signal?.reason === "string" && signal.reason ? signal.reason : fallbackMessage);
  error.name = "AbortError";
  return error;
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return normalized;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export function createSamplingAbortController(timeoutMs = SAMPLING_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutError = new Error("Band sampling timed out");
  timeoutError.name = "AbortError";
  const timer = setTimeout(() => {
    controller.abort(timeoutError);
  }, timeoutMs);
  return {
    controller,
    signal: controller.signal,
    timeoutMs,
    dispose() {
      clearTimeout(timer);
    }
  };
}

export class CogRangeResponse {
  constructor(status, headers, dataPromise) {
    this._status = status;
    this._headers = normalizeHeaders(headers);
    this._dataPromise = dataPromise;
  }

  get ok() {
    return this._status >= 200 && this._status <= 299;
  }

  get status() {
    return this._status;
  }

  getHeader(name) {
    return this._headers[String(name).toLowerCase()];
  }

  async getData() {
    return this._dataPromise;
  }
}

export function nodeRangeTransport({ url, headers, signal }) {
  return requestOnce(url, headers, signal, 0);
}

function requestOnce(url, headers, signal, redirectCount) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error);
      return;
    }

    const lib = parsed.protocol === "http:" ? http : https;
    let settled = false;
    let request;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      fn(value);
    };

    const onAbort = () => {
      const error = abortError(signal);
      if (request) request.destroy(error);
      finish(reject, error);
    };

    request = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;
        if (location && [301, 302, 303, 307, 308].includes(status) && redirectCount < MAX_REDIRECTS) {
          res.resume();
          requestOnce(new URL(location, url).href, headers, signal, redirectCount + 1).then(
            (value) => finish(resolve, value),
            (error) => finish(reject, error)
          );
          return;
        }

        if (status === 200) {
          res.destroy();
          finish(resolve, {
            status: 200,
            ok: true,
            headers: res.headers,
            abortBody: async () => {},
            getData: async () => {
              throw new Error("Server responded with full file");
            }
          });
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => {
          if (signal?.aborted) {
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          finish(resolve, {
            status,
            ok: status >= 200 && status <= 299,
            headers: res.headers,
            abortBody: async () => {},
            getData: async () => toArrayBuffer(buffer)
          });
        });
        res.on("error", (error) => finish(reject, signal?.aborted ? abortError(signal) : error));
      }
    );

    request.on("error", (error) => {
      finish(reject, signal?.aborted ? abortError(signal) : error);
    });
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    request.end();
  });
}

export class CogRangeClient {
  constructor(url, { transport = nodeRangeTransport } = {}) {
    this.url = url;
    this.transport = transport;
  }

  async request({ headers = {}, signal } = {}) {
    const range = headers.Range || headers.range;
    if (!range) throw new Error("COG request is missing a Range header");
    const response = await this.transport({
      url: this.url,
      headers: { ...headers, Range: range },
      signal
    });
    if (response.status === 200) {
      if (typeof response.abortBody === "function") await response.abortBody();
      throw new Error("Server responded with full file");
    }
    if (response.status !== 206) {
      if (typeof response.abortBody === "function") await response.abortBody();
      throw new Error("Error fetching data.");
    }
    return new CogRangeResponse(response.status, response.headers, response.getData());
  }
}

export async function openRemoteCog(href, signal, { transport } = {}) {
  const { fromCustomClient } = await import("geotiff");
  const client = new CogRangeClient(href, { transport });
  return fromCustomClient(client, { allowFullFile: false, maxRanges: 0 }, signal);
}
