# Primary Google Colab inference

Google Colab is the **primary** EfficientNet-B0 inference runtime for AyurSatya.
The website talks to this Flask service through server-side `COLAB_INFERENCE_URL`
and `COLAB_INFERENCE_API_KEY`. Render remains an optional fallback only.

The tunnel URL expires when the Colab runtime stops. Availability is determined
by `GET /ready` (`status: "ready"` and `modelReady: true`), not by an open
browser tab or a liveness-only `/health` response.

## Setup

1. Open a new Google Colab notebook with a Python 3 runtime.
2. Install the service dependencies and tunnel client from this repository:

   ```python
   %pip install -r inference-service/requirements.txt pyngrok
   ```

3. Provision the existing model artifacts into `ml/artifacts/` using the same
   private Hugging Face repository, or upload the three files securely to the
   temporary runtime:

   - `best_efficientnet_b0.pt`
   - `class_to_index.json`
   - `training_config.json`

   Never paste credentials or artifact URLs into a committed notebook.
4. Set temporary notebook-only secrets without displaying them:

   ```python
   import os, getpass
   os.environ["INFERENCE_SERVICE_API_KEY"] = getpass.getpass("Temporary API key (32+ chars): ")
   os.environ["INFERENCE_ARTIFACTS_DIR"] = "/content/AyurSatya/ml/artifacts"
   os.environ["ENABLE_GRADCAM"] = "1"
   os.environ["TORCH_NUM_THREADS"] = "1"
   os.environ["TORCH_INTEROP_THREADS"] = "1"
   ```

   Grad-CAM is generated from the final EfficientNet-B0 feature layer. If the
   runtime runs out of memory, set `ENABLE_GRADCAM=0` and restart the service.
   The website will then show an honest Grad-CAM-unavailable state. Do not
   fabricate a heatmap.

   `pyngrok` also requires `NGROK_AUTHTOKEN` in the Colab environment.

5. Run `colab_notebook.py` from the repository's `inference-service` directory.
   Configure `COLAB_INFERENCE_URL` on the Next.js server with the printed HTTPS
   tunnel URL and configure `COLAB_INFERENCE_API_KEY` with the same temporary key.
   These variables must remain server-side; never use `NEXT_PUBLIC_` names.
6. In AyurSatya, keep **Google Colab (primary)** selected and click **Check status**.
   The status endpoint performs a live `/ready` request.

## Shutdown

Stop the Colab runtime and remove the temporary URL and key from the server
environment when finished. The tunnel URL expires when the runtime ends.
