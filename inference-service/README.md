# AyurSatya inference service

This is a separate Flask service for Render. It reuses [`ml/inference.py`](../ml/inference.py) and exposes:

- `GET /health` — lightweight unauthenticated liveness check; it never loads the model.
- `GET /ready` — unauthenticated readiness check; loads and validates the model once per
  Gunicorn worker, then reuses the cached model.
- `POST /predict` — accepts a JPG or PNG multipart field named `file`.

`POST /predict` requires either `X-API-Key: <INFERENCE_SERVICE_API_KEY>` or
`Authorization: Bearer <INFERENCE_SERVICE_API_KEY>`. The key is never stored in
the repository. `/health` is intentionally unauthenticated so Render can probe it.

## Render setup

1. Create a Render Web Service from this repository. Do not commit the checkpoint.
   The repository pins Render to Python 3.12.6 in `runtime.txt`; keep that runtime
   aligned with the tested Torch/TorchVision environment.
2. Configure these Render environment variables:
- `INFERENCE_SERVICE_API_KEY`: a long random value, stored as a secret.
- `HF_TOKEN`: a Hugging Face token with read access to the private model repository, stored as a secret.
- `HF_MODEL_REPO_ID`: `shubh1206/ayursatya-model`.
- `INFERENCE_ARTIFACTS_DIR`: `/opt/render/project/src/ml/artifacts`.
3. The build command must run from the repository root:
`pip install -r inference-service/requirements.txt && python inference-service/download_artifacts.py`
It downloads exactly these files:
`best_efficientnet_b0.pt`, `class_to_index.json`, and `training_config.json`.
4. Use the included `render.yaml`, or set:
- Start: `gunicorn --chdir inference-service --workers 1 --timeout 180 --bind 0.0.0.0:$PORT app:app`
5. Render uses `/health` as its deployment health check because it is lightweight and does
   not block routing while the model initializes. Verify `GET /ready` reports
   `{"status":"ready","modelReady":true}` before configuring the web app.

The blueprint uses Render's Starter instance because EfficientNet-B0 + PyTorch can exceed
the 512 MB Free instance during a forward pass even though artifact readiness succeeds.
The service still uses one Gunicorn worker, one Torch thread, no Grad-CAM in hosted mode,
and bounded decoded image dimensions. If `/ready` succeeds but `/predict` returns an
empty HTTP 502, the process is being terminated outside Flask (typically an instance
memory limit or native Torch crash); Flask cannot return JSON after the worker has been
killed. Inspect the Render worker log for `OOM`, `SIGKILL`, or a native crash.

The Next.js route waits up to 180 seconds for the first hosted prediction because a
Render Free instance may sleep and the worker may need to load EfficientNet-B0 before
serving its first request. Set `INFERENCE_SERVICE_TIMEOUT_MS` in the Next.js environment
to a value from 30,000 to 180,000 milliseconds if a different test-phase timeout is
needed.

## Secure artifact workflow

The local files under `ml/artifacts/` are ignored by Git and must remain that way.
Do not put the `.pt` file in a public bucket, a GitHub release, a client-visible
environment variable, or a repository secret that is echoed into build logs.

The build downloader uses Hugging Face Hub's authenticated API; it does not put a
token in a URL or print the token. The Hugging Face repository must be private,
and the token must be read-only and scoped to that repository. Rotate the token
through Render's secret environment-variable settings, not through source control.
The build fails with a sanitized error if the token, repository access, directory,
or any required artifact is missing. Until a successful build provisions the files, `/ready` and `/predict` return `503`;
the service never fabricates a result. `/health` remains a liveness response even when
the model is not ready.

The repository's `.gitignore` excludes model artifacts. A Render deployment created
from the repository alone is therefore not ready to predict until the three artifact
files are supplied through a secure artifact workflow. Render Free does not provide
a persistent disk, so the files must be copied at build time or otherwise made
available on every instance; do not rely on uploading files manually into a
running instance. Free services may also sleep when idle, so the first prediction
can be slow or time out; the Next.js route returns an honest unavailable state
rather than fabricating a result.
