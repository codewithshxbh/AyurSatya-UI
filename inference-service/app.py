"""Small HTTP wrapper for the repository's EfficientNet-B0 inference code."""

from __future__ import annotations

import base64
import hmac
import io
import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request
from PIL import Image, UnidentifiedImageError

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPOSITORY_ROOT))

from ml.inference import run_inference  # noqa: E402

app = Flask(__name__)
MAX_IMAGE_BYTES = 10 * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_IMAGE_BYTES + 512 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png"}
ARTIFACTS_DIR = Path(os.environ.get("INFERENCE_ARTIFACTS_DIR", REPOSITORY_ROOT / "ml" / "artifacts"))


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
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{file_storage.mimetype};base64,{encoded}", None


@app.get("/health")
def health():
    try:
        from ml.inference import load_checkpoint

        load_checkpoint(ARTIFACTS_DIR)
    except FileNotFoundError:
        return jsonify({"status": "not_ready", "modelReady": False, "error": "EfficientNet-B0 checkpoint artifacts are unavailable."}), 503
    except Exception as error:
        return jsonify({"status": "not_ready", "modelReady": False, "error": str(error)}), 503
    return jsonify({"status": "ready", "modelReady": True, "model": "EfficientNet-B0"})


@app.post("/predict")
def predict():
    if not _api_key_is_valid():
        return _error("Inference service authentication failed.", 401)
    image_data, validation_error = _decode_upload(request.files.get("file"))
    if validation_error:
        return _error(validation_error, 400)
    try:
        result = run_inference(image_data, ARTIFACTS_DIR)
        return jsonify({
            "className": result["className"],
            "confidence": result["confidence"],
            "gradcamDataUrl": result["gradcamDataUrl"],
            "model": "EfficientNet-B0",
        })
    except FileNotFoundError:
        return _error("EfficientNet-B0 checkpoint artifacts are unavailable.", 503)
    except Exception:
        app.logger.exception("EfficientNet-B0 inference failed")
        return _error("EfficientNet-B0 inference failed.", 502)


@app.errorhandler(413)
def request_too_large(_error):
    return _error("Images up to 10 MB are accepted.", 413)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
