export const CAMERA_FACING = {
  ENVIRONMENT: "environment",
  USER: "user"
};

export function isCameraSupported(
  mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : null,
  isSecure = typeof window === "undefined" ? true : window.isSecureContext !== false
) {
  return Boolean(isSecure && typeof mediaDevices?.getUserMedia === "function");
}

export function cameraConstraints(facingMode = CAMERA_FACING.ENVIRONMENT) {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };
}

export function nextCameraFacing(facingMode) {
  return facingMode === CAMERA_FACING.USER ? CAMERA_FACING.ENVIRONMENT : CAMERA_FACING.USER;
}

export function mapCameraError(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera access was blocked. Allow the camera in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device. Upload a JPG or PNG instead.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is already in use by another app. Close it and try again.";
  }
  if (name === "NotSupportedError" || name === "TypeError") {
    return "This browser does not support camera capture. Upload a JPG or PNG instead.";
  }
  if (name === "SecurityError") {
    return "Camera capture needs a secure connection. Open AyurSatya on HTTPS, or upload a JPG or PNG.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "This camera could not start. Try the other camera, or upload a JPG or PNG.";
  }
  return error?.message || "The camera could not be started. Upload a JPG or PNG instead.";
}

export function stopMediaStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks?.() || []) track.stop();
}

export function videoFrameSize(video) {
  const width = Number(video?.videoWidth) || 0;
  const height = Number(video?.videoHeight) || 0;
  if (!width || !height) return null;
  return { width, height };
}

function defaultCreateCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function requestCameraStream(
  getUserMedia,
  facingMode = CAMERA_FACING.ENVIRONMENT
) {
  const media = getUserMedia
    || (typeof navigator !== "undefined" ? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) : null);
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw Object.assign(new Error(mapCameraError({ name: "SecurityError" })), { name: "SecurityError" });
  }
  if (typeof media !== "function") {
    throw Object.assign(new Error(mapCameraError({ name: "NotSupportedError" })), { name: "NotSupportedError" });
  }
  try {
    return await media(cameraConstraints(facingMode));
  } catch (error) {
    if (error?.name === "OverconstrainedError" || error?.name === "ConstraintNotSatisfiedError") {
      return media({ audio: false, video: true });
    }
    throw error;
  }
}

export function captureVideoFrame(video, {
  mimeType = "image/jpeg",
  quality = 0.92,
  fileName = "leaf-capture.jpg",
  createCanvas = defaultCreateCanvas
} = {}) {
  const size = videoFrameSize(video);
  if (!size) {
    return Promise.reject(new Error("The camera image is not ready yet. Wait a moment and try again."));
  }
  const canvas = createCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (!context?.drawImage) {
    return Promise.reject(new Error("The camera image could not be captured."));
  }
  context.drawImage(video, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) => {
    const finish = (blob) => {
      if (!blob) {
        reject(new Error("The camera image could not be captured."));
        return;
      }
      resolve(new File([blob], fileName, { type: mimeType, lastModified: Date.now() }));
    };
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(finish, mimeType, quality);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const bytes = atob(dataUrl.split(",")[1] || "");
      const buffer = Uint8Array.from(bytes, (char) => char.charCodeAt(0));
      finish(new Blob([buffer], { type: mimeType }));
    } catch (error) {
      reject(error);
    }
  });
}
