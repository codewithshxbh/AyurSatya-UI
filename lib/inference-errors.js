export class HostedInferenceError extends Error {
  constructor(message, { status = 0, code = "service_unavailable" } = {}) {
    super(message);
    this.name = "HostedInferenceError";
    this.status = status;
    this.code = code;
  }
}

export function hostedErrorCodeForStatus(status) {
  if (status === 400 || status === 413) return "invalid_image";
  if (status === 502) return "prediction_unavailable";
  return "service_unavailable";
}

export function classifyHostedInferenceFailure(error) {
  const status = error?.status;
  const code = error?.code;
  const name = error?.name;

  if (code === "invalid_image" || status === 400 || status === 413) {
    return {
      status: "invalid_image",
      message: error?.message || "The uploaded image could not be used for inference."
    };
  }

  if (name === "TimeoutError" || name === "AbortError") {
    return {
      status: "service_unavailable",
      message: "The hosted EfficientNet-B0 inference service timed out."
    };
  }

  if (code === "prediction_unavailable" || status === 502) {
    return {
      status: "prediction_unavailable",
      message: error?.message || "The checkpoint did not produce a usable prediction for this image."
    };
  }

  return {
    status: "service_unavailable",
    message: "The hosted EfficientNet-B0 inference service is unavailable. Check the server logs for the underlying error."
  };
}
