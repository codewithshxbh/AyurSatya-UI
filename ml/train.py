"""Reproducible EfficientNet-B0 training pipeline for the AyurSatya dataset.

The script validates the folder-per-class dataset before training, removes exact
duplicates from split boundaries by assigning duplicate groups to one split, and
writes all reproducibility and evaluation artifacts under ml/artifacts/.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import random
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image, UnidentifiedImageError
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import datasets, models, transforms


LOGGER = logging.getLogger("ayursatya.training")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
DEFAULT_DATASET = Path(__file__).resolve().parents[1] / "datasets" / "Medicinal Plant Leaf Disease Dataset" / "Medicinal_leaf_dataset"
DEFAULT_ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


@dataclass(frozen=True)
class Sample:
    path: str
    label: str
    digest: str


@dataclass(frozen=True)
class TrainingConfig:
    dataset_dir: str
    output_dir: str
    seed: int
    epochs: int
    batch_size: int
    learning_rate: float
    weight_decay: float
    validation_fraction: float
    test_fraction: float
    image_size: int
    patience: int
    num_workers: int
    device: str


class IndexedSamples(Dataset[tuple[torch.Tensor, int]]):
    def __init__(self, samples: list[Sample], class_to_index: dict[str, int], transform: transforms.Compose) -> None:
        self.samples = samples
        self.class_to_index = class_to_index
        self.transform = transform

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        sample = self.samples[index]
        with Image.open(sample.path) as image:
            image = image.convert("RGB")
            return self.transform(image), self.class_to_index[sample.label]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_ARTIFACTS)
    parser.add_argument("--seed", type=int, default=20261010)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--patience", type=int, default=6)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--validate-only", action="store_true")
    return parser.parse_args()


def configure_reproducibility(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def discover_and_validate(dataset_dir: Path) -> tuple[list[Sample], dict[str, Any]]:
    if not dataset_dir.is_dir():
        raise FileNotFoundError(f"Dataset directory does not exist: {dataset_dir}")
    class_dirs = sorted(path for path in dataset_dir.iterdir() if path.is_dir())
    if not class_dirs:
        raise ValueError(f"No class directories found in {dataset_dir}")

    samples: list[Sample] = []
    invalid_files: list[dict[str, str]] = []
    digest_labels: dict[str, set[str]] = defaultdict(set)
    digest_paths: dict[str, list[str]] = defaultdict(list)
    counts: Counter[str] = Counter()

    for class_dir in class_dirs:
        image_paths = sorted(path for path in class_dir.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS)
        for path in image_paths:
            try:
                with Image.open(path) as image:
                    image.verify()
                digest = sha256_file(path)
            except (OSError, UnidentifiedImageError) as error:
                invalid_files.append({"path": str(path), "error": str(error)})
                continue
            label = class_dir.name
            sample = Sample(str(path.resolve()), label, digest)
            samples.append(sample)
            counts[label] += 1
            digest_labels[digest].add(label)
            digest_paths[digest].append(str(path.resolve()))

    conflicting_duplicates = {digest: paths for digest, paths in digest_paths.items() if len(digest_labels[digest]) > 1}
    duplicate_groups = {digest: paths for digest, paths in digest_paths.items() if len(paths) > 1}
    if invalid_files:
        raise ValueError(f"Found {len(invalid_files)} unreadable image(s). First: {invalid_files[0]}")
    if conflicting_duplicates:
        raise ValueError("Exact duplicate bytes occur under multiple labels; refusing to train. "
                         f"First digest: {next(iter(conflicting_duplicates))}")
    if not samples:
        raise ValueError("No readable images found.")

    report = {
        "dataset_dir": str(dataset_dir.resolve()),
        "total_readable_images": len(samples),
        "class_count": len(counts),
        "class_counts": dict(sorted(counts.items())),
        "invalid_image_count": len(invalid_files),
        "exact_duplicate_group_count": len(duplicate_groups),
        "exact_duplicate_image_count": sum(len(paths) for paths in duplicate_groups.values()),
        "verified_labels": sorted(counts),
    }
    return samples, report


def split_samples(samples: list[Sample], seed: int) -> tuple[list[Sample], list[Sample], list[Sample]]:
    groups: dict[str, list[Sample]] = defaultdict(list)
    for sample in samples:
        groups[sample.digest].append(sample)
    group_items = list(groups.values())
    group_labels = [items[0].label for items in group_items]
    indices = np.arange(len(group_items))
    train_indices, temp_indices = train_test_split(
        indices, test_size=0.30, random_state=seed, stratify=group_labels
    )
    temp_labels = [group_labels[index] for index in temp_indices]
    val_indices, test_indices = train_test_split(
        temp_indices, test_size=0.50, random_state=seed, stratify=temp_labels
    )

    def flatten(selected: np.ndarray) -> list[Sample]:
        return [sample for index in selected for sample in group_items[int(index)]]

    train, validation, test = flatten(train_indices), flatten(val_indices), flatten(test_indices)
    assert not ({sample.digest for sample in train} & {sample.digest for sample in validation})
    assert not ({sample.digest for sample in train} & {sample.digest for sample in test})
    assert not ({sample.digest for sample in validation} & {sample.digest for sample in test})
    return train, validation, test


def build_model(class_count: int) -> nn.Module:
    weights = models.EfficientNet_B0_Weights.DEFAULT
    model = models.efficientnet_b0(weights=weights)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, class_count)
    return model


def transforms_for(image_size: int) -> tuple[transforms.Compose, transforms.Compose]:
    train_transform = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(12),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    eval_transform = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    return train_transform, eval_transform


def run_epoch(model: nn.Module, loader: DataLoader, criterion: nn.Module, optimizer: Any, device: torch.device) -> float:
    model.train(optimizer is not None)
    total_loss = 0.0
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        with torch.set_grad_enabled(optimizer is not None):
            output = model(images)
            loss = criterion(output, labels)
            if optimizer is not None:
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()
        total_loss += loss.item() * images.size(0)
    return total_loss / len(loader.dataset)


@torch.inference_mode()
def collect_predictions(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[list[int], list[int]]:
    model.eval()
    actual: list[int] = []
    predicted: list[int] = []
    for images, labels in loader:
        logits = model(images.to(device))
        actual.extend(labels.tolist())
        predicted.extend(logits.argmax(dim=1).cpu().tolist())
    return actual, predicted


def evaluate(model: nn.Module, loader: DataLoader, class_names: list[str], device: torch.device) -> dict[str, Any]:
    actual, predicted = collect_predictions(model, loader, device)
    precision, recall, f1, _ = precision_recall_fscore_support(actual, predicted, average="macro", zero_division=0)
    return {
        "accuracy": float(accuracy_score(actual, predicted)),
        "macro_precision": float(precision),
        "macro_recall": float(recall),
        "macro_f1": float(f1),
        "classification_report": classification_report(actual, predicted, target_names=class_names, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(actual, predicted, labels=list(range(len(class_names)))).tolist(),
        "class_names": class_names,
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def main() -> None:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    configure_reproducibility(args.seed)
    samples, validation_report = discover_and_validate(args.dataset_dir)
    train_samples, validation_samples, test_samples = split_samples(samples, args.seed)
    split_report = {
        "train_count": len(train_samples),
        "validation_count": len(validation_samples),
        "test_count": len(test_samples),
        "train_class_counts": dict(sorted(Counter(item.label for item in train_samples).items())),
        "validation_class_counts": dict(sorted(Counter(item.label for item in validation_samples).items())),
        "test_class_counts": dict(sorted(Counter(item.label for item in test_samples).items())),
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.output_dir / "dataset_validation.json", validation_report)
    write_json(args.output_dir / "split_manifest.json", {
        "seed": args.seed,
        "splits": {
            "train": [asdict(item) for item in train_samples],
            "validation": [asdict(item) for item in validation_samples],
            "test": [asdict(item) for item in test_samples],
        },
        "summary": split_report,
    })
    LOGGER.info("Validated %d readable images across %d classes.", len(samples), len(validation_report["verified_labels"]))
    LOGGER.info("Split sizes: %s", split_report)
    if args.validate_only:
        return

    class_names = validation_report["verified_labels"]
    class_to_index = {name: index for index, name in enumerate(class_names)}
    train_transform, eval_transform = transforms_for(224)
    train_dataset = IndexedSamples(train_samples, class_to_index, train_transform)
    validation_dataset = IndexedSamples(validation_samples, class_to_index, eval_transform)
    test_dataset = IndexedSamples(test_samples, class_to_index, eval_transform)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    config = TrainingConfig(str(args.dataset_dir.resolve()), str(args.output_dir.resolve()), args.seed, args.epochs, args.batch_size,
                            args.learning_rate, args.weight_decay, 0.15, 0.15, 224, args.patience, args.num_workers, str(device))
    write_json(args.output_dir / "class_to_index.json", class_to_index)
    write_json(args.output_dir / "training_config.json", {**asdict(config), "created_at": datetime.now(timezone.utc).isoformat()})

    loaders = {
        "train": DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=args.num_workers, pin_memory=device.type == "cuda"),
        "validation": DataLoader(validation_dataset, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers, pin_memory=device.type == "cuda"),
        "test": DataLoader(test_dataset, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers, pin_memory=device.type == "cuda"),
    }
    model = build_model(len(class_names)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", patience=2, factor=0.3)
    best_loss = float("inf")
    stale_epochs = 0
    history: list[dict[str, float]] = []
    for epoch in range(1, args.epochs + 1):
        train_loss = run_epoch(model, loaders["train"], criterion, optimizer, device)
        validation_loss = run_epoch(model, loaders["validation"], criterion, None, device)
        scheduler.step(validation_loss)
        history.append({"epoch": epoch, "train_loss": train_loss, "validation_loss": validation_loss, "learning_rate": optimizer.param_groups[0]["lr"]})
        LOGGER.info("epoch=%d train_loss=%.4f validation_loss=%.4f", epoch, train_loss, validation_loss)
        if validation_loss < best_loss:
            best_loss = validation_loss
            stale_epochs = 0
            torch.save({"model_state_dict": model.state_dict(), "class_to_index": class_to_index, "config": asdict(config), "best_validation_loss": best_loss}, args.output_dir / "best_efficientnet_b0.pt")
        else:
            stale_epochs += 1
            if stale_epochs >= args.patience:
                LOGGER.info("Early stopping after %d stale epochs.", stale_epochs)
                break
    write_json(args.output_dir / "training_history.json", history)
    checkpoint = torch.load(args.output_dir / "best_efficientnet_b0.pt", map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    write_json(args.output_dir / "test_evaluation.json", evaluate(model, loaders["test"], class_names, device))
    LOGGER.info("Held-out test evaluation written to %s", args.output_dir / "test_evaluation.json")


if __name__ == "__main__":
    main()
