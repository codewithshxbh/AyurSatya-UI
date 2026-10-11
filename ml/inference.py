"""Run one EfficientNet-B0 inference with an optional Grad-CAM overlay."""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import threading
from pathlib import Path

import torch
from PIL import Image, UnidentifiedImageError
from torch import nn
from torchvision import models, transforms

torch.set_num_threads(max(1, int(os.environ.get("TORCH_NUM_THREADS", "1"))))
torch.set_num_interop_threads(max(1, int(os.environ.get("TORCH_INTEROP_THREADS", "1"))))

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
DEFAULT_ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
MAX_INFERENCE_IMAGE_SIZE = (2048, 2048)
_MODEL_CACHE_KEY: str | None = None
_MODEL_CACHE_VALUE: tuple[nn.Module, list[str], int] | None = None
_MODEL_CACHE_LOCK = threading.Lock()
_INFERENCE_LOCK = threading.Lock()


def build_model(class_count: int) -> nn.Module:
    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, class_count)
    return model


def _load_checkpoint_uncached(artifacts_dir: Path) -> tuple[nn.Module, list[str], int]:
    artifacts_dir = artifacts_dir.resolve()
    checkpoint_path = artifacts_dir / "best_efficientnet_b0.pt"
    mapping_path = artifacts_dir / "class_to_index.json"
    config_path = artifacts_dir / "training_config.json"
    if not checkpoint_path.is_file() or not mapping_path.is_file() or not config_path.is_file():
        raise FileNotFoundError("EfficientNet-B0 checkpoint artifacts are unavailable.")

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    class_to_index = checkpoint.get("class_to_index")
    if not isinstance(class_to_index, dict):
        raise ValueError("Checkpoint is missing a valid class mapping.")
    with mapping_path.open(encoding="utf-8") as handle:
        artifact_mapping = json.load(handle)
    if artifact_mapping != class_to_index:
        raise ValueError("Checkpoint and class mapping artifacts do not match.")
    with config_path.open(encoding="utf-8") as handle:
        config = json.load(handle)
    image_size = config.get("image_size")
    if not isinstance(image_size, int) or image_size <= 0:
        raise ValueError("Training configuration is missing a valid image size.")

    labels = [label for label, _ in sorted(class_to_index.items(), key=lambda item: item[1])]
    if len(labels) != len(class_to_index) or any(not label for label in labels):
        raise ValueError("Checkpoint contains an invalid class mapping.")
    model = build_model(len(labels))
    model.load_state_dict(checkpoint["model_state_dict"], strict=True)
    model.eval()
    return model, labels, image_size


def load_checkpoint(artifacts_dir: Path) -> tuple[nn.Module, list[str], int]:
    global _MODEL_CACHE_KEY, _MODEL_CACHE_VALUE
    cache_key = str(artifacts_dir.resolve())
    if _MODEL_CACHE_KEY == cache_key and _MODEL_CACHE_VALUE is not None:
        return _MODEL_CACHE_VALUE
    with _MODEL_CACHE_LOCK:
        if _MODEL_CACHE_KEY == cache_key and _MODEL_CACHE_VALUE is not None:
            return _MODEL_CACHE_VALUE
        _MODEL_CACHE_VALUE = _load_checkpoint_uncached(artifacts_dir)
        _MODEL_CACHE_KEY = cache_key
        return _MODEL_CACHE_VALUE


def is_checkpoint_cached(artifacts_dir: Path) -> bool:
    return _MODEL_CACHE_KEY == str(artifacts_dir.resolve()) and _MODEL_CACHE_VALUE is not None


def decode_image(image_data: str) -> Image.Image:
    if not isinstance(image_data, str) or not image_data.startswith("data:image/"):
        raise ValueError("Image data must be a data URL.")
    try:
        _, encoded = image_data.split(",", 1)
        image = Image.open(io.BytesIO(base64.b64decode(encoded, validate=True))).convert("RGB")
        image.load()
        image.thumbnail(MAX_INFERENCE_IMAGE_SIZE, Image.Resampling.LANCZOS)
        return image
    except (ValueError, OSError, UnidentifiedImageError) as error:
        raise ValueError("The uploaded image could not be decoded.") from error


def run_inference(image_data: str, artifacts_dir: Path = DEFAULT_ARTIFACTS) -> dict[str, object]:
    model, labels, image_size = load_checkpoint(artifacts_dir)
    image = decode_image(image_data)
    preprocess = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    tensor = preprocess(image).unsqueeze(0)
    activations: torch.Tensor | None = None

    def save_activations(_module: nn.Module, _inputs: tuple[torch.Tensor, ...], output: torch.Tensor) -> None:
        nonlocal activations
        activations = output

    with _INFERENCE_LOCK:
        target_layer = model.features[-1]
        activation_hook = target_layer.register_forward_hook(save_activations)
        try:
            model.zero_grad(set_to_none=True)
            logits = model(tensor)
            probabilities = torch.softmax(logits, dim=1)
            class_index = int(probabilities.argmax(dim=1).item())
            score = logits[0, class_index]
            if activations is None:
                raise RuntimeError("Grad-CAM activations were not captured.")
            gradients = torch.autograd.grad(score, activations, retain_graph=False)[0]
            weights = gradients.mean(dim=(2, 3), keepdim=True)
            cam = torch.relu((weights * activations).sum(dim=1, keepdim=True))
            cam = torch.nn.functional.interpolate(cam, size=image.size[::-1], mode="bilinear", align_corners=False)
            cam = cam[0, 0]
            cam -= cam.min()
            maximum = cam.max()
            if float(maximum.detach()) > 0:
                cam /= maximum
            heatmap = (cam.mul(140).byte()).numpy()
            overlay = Image.new("RGBA", image.size, (255, 48, 48, 0))
            overlay.putalpha(Image.fromarray(heatmap, mode="L"))
            blended = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
            output = io.BytesIO()
            blended.save(output, format="PNG")
            return {
                "className": labels[class_index],
                "confidence": float(probabilities[0, class_index].item()),
                "gradcamDataUrl": "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii"),
            }
        finally:
            activation_hook.remove()


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(run_inference(payload.get("imageData"))))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
