"""Download the allowlisted private model artifacts during the Render build."""

from __future__ import annotations

import os
import sys
from pathlib import Path

REQUIRED_ARTIFACTS = (
    "best_efficientnet_b0.pt",
    "class_to_index.json",
    "training_config.json",
)


class ArtifactDownloadError(RuntimeError):
    """A sanitized, user-actionable artifact provisioning failure."""


def _download_file(filename: str, repo_id: str, token: str, target_dir: Path) -> Path:
    try:
        from huggingface_hub import hf_hub_download

        hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            token=token,
            local_dir=str(target_dir),
        )
    except Exception as error:
        raise ArtifactDownloadError(
            f"Could not download required model artifact '{filename}'. "
            "Check the private repository, HF_TOKEN permissions, and Render network access."
        ) from error
    artifact_path = target_dir / filename
    if not artifact_path.is_file() or artifact_path.stat().st_size == 0:
        raise ArtifactDownloadError(
            f"Required model artifact '{filename}' was not downloaded or is empty."
        )
    return artifact_path


def download_artifacts(
    repo_id: str | None = None,
    token: str | None = None,
    artifacts_dir: str | Path | None = None,
) -> tuple[Path, ...]:
    resolved_repo_id = repo_id or os.environ.get("HF_MODEL_REPO_ID")
    resolved_token = token or os.environ.get("HF_TOKEN")
    configured_dir = artifacts_dir or os.environ.get("INFERENCE_ARTIFACTS_DIR")
    resolved_dir = Path(configured_dir) if configured_dir else None

    if not resolved_token:
        raise ArtifactDownloadError("HF_TOKEN is missing from the Render environment.")
    if not resolved_repo_id:
        raise ArtifactDownloadError("HF_MODEL_REPO_ID is missing from the Render environment.")
    if resolved_dir is None:
        raise ArtifactDownloadError("INFERENCE_ARTIFACTS_DIR is missing from the Render environment.")

    try:
        resolved_dir.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise ArtifactDownloadError("INFERENCE_ARTIFACTS_DIR could not be created.") from error

    return tuple(
        _download_file(filename, resolved_repo_id, resolved_token, resolved_dir)
        for filename in REQUIRED_ARTIFACTS
    )


def main() -> int:
    try:
        paths = download_artifacts()
    except ArtifactDownloadError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Downloaded and verified {len(paths)} required model artifacts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
