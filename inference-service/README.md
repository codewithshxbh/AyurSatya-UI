# AyurSatya inference service

This is a separate Flask service for Render. It reuses [`ml/inference.py`](../ml/inference.py) and exposes:

- `GET /health` — reports whether the checkpoint and companion artifacts are ready.
- `POST /predict` — accepts a JPG or PNG multipart field named `file`.

`POST /predict` requires either `X-API-Key: <INFERENCE_SERVICE_API_KEY>` or
`Authorization: Bearer <INFERENCE_SERVICE_API_KEY>`. The key is never stored in
the repository. `/health` is intentionally unauthenticated so Render can probe it.

## Render setup

1. Create a Render Web Service from this repository. Do not commit the checkpoint.
2. Set `INFERENCE_SERVICE_API_KEY` to a long random value in Render's secret environment variables.
3. Set `INFERENCE_ARTIFACTS_DIR` to the directory containing the three model
artifacts. The required files are:
`best_efficientnet_b0.pt`, `class_to_index.json`, and `training_config.json`.
4. Use the included `render.yaml`, or set:
   - Build: `pip install -r inference-service/requirements.txt`
   - Start: `gunicorn --chdir inference-service --bind 0.0.0.0:$PORT app:app`
5. Verify `GET /health` reports `{"status":"ready","modelReady":true}` before configuring the web app.

## Secure artifact workflow

The local files under `ml/artifacts/` are ignored by Git and must remain that way.
Do not put the `.pt` file in a public bucket, a GitHub release, a client-visible
environment variable, or a repository secret that is echoed into build logs.

Before implementing an artifact download mechanism, choose a private object-storage
provider that supports server-side credentials and short-lived signed access, such as
an S3-compatible bucket, Azure Blob Storage, or Google Cloud Storage. The owner must
configure:

- a private bucket/container containing the three required files;
- a narrowly scoped read-only identity for only those files;
- a server-side secret or platform-managed identity for the Render service;
- TLS-only access, audit logging, and key rotation; and
- a build or startup step that copies the files into the directory named by
  `INFERENCE_ARTIFACTS_DIR` without printing the URL, token, or file contents.

No downloader is included yet because selecting the provider, identity mechanism,
retention policy, and Render secret delivery method is an infrastructure decision.
Until those files are provisioned into the configured directory, `/health` returns
`503` with `modelReady: false` and `/predict` returns `503`; the service never
fabricates a result.

The repository's `.gitignore` excludes model artifacts. A Render deployment created
from the repository alone is therefore not ready to predict until the three artifact
files are supplied through a secure artifact workflow. Render Free does not provide
a persistent disk, so the files must be copied at build time or otherwise made
available on every instance; do not rely on uploading files manually into a
running instance. Free services may also sleep when idle, so the first prediction
can be slow or time out; the Next.js route returns an honest unavailable state
rather than fabricating a result.
