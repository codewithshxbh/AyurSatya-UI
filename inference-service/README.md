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
3. Provide the trained artifacts during the Render build from a private artifact
download or a Render secret-file workflow, or set `INFERENCE_ARTIFACTS_DIR` to a
private mounted artifact path. The required files are:
   `best_efficientnet_b0.pt`, `class_to_index.json`, and `training_config.json`.
4. Use the included `render.yaml`, or set:
   - Build: `pip install -r inference-service/requirements.txt`
   - Start: `gunicorn --chdir inference-service --bind 0.0.0.0:$PORT app:app`
5. Verify `GET /health` reports `{"status":"ready","modelReady":true}` before configuring the web app.

The repository's `.gitignore` excludes model artifacts. A Render deployment created
from the repository alone is therefore not ready to predict until the three artifact
files are supplied through a secure artifact workflow. Render Free does not provide
a persistent disk, so do not rely on uploading files manually into a running
instance; supply them at build time from private storage or use a plan with the
required persistent storage. Free services may also sleep when idle, so the first
prediction can be slow or time out; the Next.js route returns an honest unavailable
state rather than fabricating a result.
