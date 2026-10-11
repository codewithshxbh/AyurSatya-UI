"""Small HTTP wrapper for the repository's EfficientNet-B0 inference code."""

from __future__ import annotations

import gc
import hmac
import io
import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request
from PIL import Image, UnidentifiedImageError

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPOSITORY_ROOT))

from ml.inference import is_checkpoint_cached, load_checkpoint, run_inference  # noqa: E402

app = Flask(__name__)
MAX_IMAGE_BYTES = 10 * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_IMAGE_BYTES + 512 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png"}
ARTIFACTS_DIR = Path(os.environ.get("INFERENCE_ARTIFACTS_DIR", REPOSITORY_ROOT / "ml" / "artifacts"))
REQUIRED_ARTIFACTS = (
    "best_efficientnet_b0.pt",
    "class_to_index.json",
    "training_config.json",
)


def _artifact_directory() -> Path:
    configured = os.environ.get("INFERENCE_ARTIFACTS_DIR")
    return Path(configured) if configured else ARTIFACTS_DIR


def _missing_artifacts(artifacts_dir: Path) -> list[str]:
    if not artifacts_dir.is_dir():
        return list(REQUIRED_ARTIFACTS)
    return [name for name in REQUIRED_ARTIFACTS if not (artifacts_dir / name).is_file()]


def _api_key_is_valid() -> bool:
    configured_key = os.environ.get("INFERENCE_SERVICE_API_KEY")
    provided_key = request.headers.get("X-API-Key")
    if provided_key is None:
        authorization = request.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            provided_key = authorization[7:]
    return bool(configured_key and provided_key and hmac.compare_digest(provided_key, configured_key))


def _error(message: str, status: int):
    return jsonify({"error": message}), status


def _decode_upload(file_storage):
    if not file_storage or not file_storage.filename:
        return None, "An image file is required."
    if file_storage.mimetype not in ALLOWED_TYPES:
        return None, "Only JPG or PNG images are accepted."
    data = file_storage.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        return None, "Images up to 10 MB are accepted."
    try:
        image = Image.open(io.BytesIO(data))
        image.verify()
    except (OSError, UnidentifiedImageError):
        return None, "The uploaded image could not be decoded."
    return data, None


@app.get("/health")
def health():
    """Liveness check; never performs model initialization."""
    artifacts_dir = _artifact_directory()
    missing = _missing_artifacts(artifacts_dir)
    return jsonify({
        "status": "ok",
        "modelReady": not missing and is_checkpoint_cached(artifacts_dir),
        "model": "EfficientNet-B0",
        **({"missingArtifacts": missing} if missing else {}),
    })


@app.get("/")
def root():
    """Compatibility liveness check for providers configured to probe the root path."""
    return health()


@app.get("/ready")
def ready():
    """Readiness check; initializes the model once and reports compatibility."""
    artifacts_dir = _artifact_directory()
    missing = _missing_artifacts(artifacts_dir)
    if missing:
        return jsonify({
            "status": "not_ready",
            "modelReady": False,
            "error": "Required EfficientNet-B0 artifacts are missing.",
            "missingArtifacts": missing,
        }), 503
    try:
        load_checkpoint(artifacts_dir)
    except Exception:
        app.logger.exception("EfficientNet-B0 artifact validation failed")
        return jsonify({
            "status": "not_ready",
            "modelReady": False,
            "error": "EfficientNet-B0 artifacts are invalid or incompatible.",
        }), 503
    return jsonify({"status": "ready", "modelReady": True, "model": "EfficientNet-B0"})


@app.post("/predict")
def predict():
    if not _api_key_is_valid():
        return _error("Inference service authentication failed.", 401)
    image_data, validation_error = _decode_upload(request.files.get("file"))
    if validation_error:
        return _error(validation_error, 400)
    artifacts_dir = _artifact_directory()
    missing = _missing_artifacts(artifacts_dir)
    if missing:
        return _error("EfficientNet-B0 artifacts are unavailable.", 503)
    try:
        result = run_inference(image_data, artifacts_dir)
        return jsonify({
            "className": result["className"],
            "confidence": result["confidence"],
            "gradcamDataUrl": result["gradcamDataUrl"],
            "model": "EfficientNet-B0",
        })
    except (FileNotFoundError, KeyError, ValueError):
        app.logger.exception("EfficientNet-B0 artifacts are invalid or unavailable")
        return _error("EfficientNet-B0 artifacts are invalid or unavailable.", 503)
    except Exception:
        app.logger.exception("EfficientNet-B0 inference failed")
        return _error("EfficientNet-B0 inference failed.", 502)
    finally:
        gc.collect()


@app.errorhandler(413)
def request_too_large(_exception):
    return _error("Images up to 10 MB are accepted.", 413)


@app.errorhandler(400)
def bad_request(_exception):
    return _error("The request could not be understood.", 400)


@app.errorhandler(404)
def not_found(_exception):
    return _error("The requested inference-service endpoint was not found.", 404)


@app.errorhandler(405)
def method_not_allowed(_exception):
    return _error("The HTTP method is not supported for this endpoint.", 405)


@app.errorhandler(500)
def internal_server_error(_exception):
    app.logger.exception("Unhandled inference-service request error")
    return _error("The inference service encountered an internal error.", 500)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
