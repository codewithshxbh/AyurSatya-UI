# Temporary Google Colab inference

The website's **Try with Google Colab** option is optional and works only while
the Colab runtime and its HTTPS tunnel remain active. Render remains the default.

## Setup

1. Open a new Google Colab notebook with a Python 3 runtime.
2. Install the service dependencies and tunnel client:

   ```python
   %pip install -r https://raw.githubusercontent.com/codewithshxbh/AyurSatya-UI/master/inference-service/requirements.txt pyngrok
   ```

3. Provision the existing model artifacts into `ml/artifacts/` using the same
   private Hugging Face repository used by Render, or upload the three files
   securely to the temporary runtime:

   - `best_efficientnet_b0.pt`
   - `class_to_index.json`
   - `training_config.json`

   Never paste credentials or artifact URLs into a committed notebook.
4. Set temporary notebook-only secrets without displaying them:

   ```python
   import os, getpass
   os.environ["INFERENCE_SERVICE_API_KEY"] = getpass.getpass("Temporary API key (32+ chars): ")
   os.environ["INFERENCE_ARTIFACTS_DIR"] = "/content/AyurSatya/ml/artifacts"
   os.environ["ENABLE_GRADCAM"] = "0"
   os.environ["TORCH_NUM_THREADS"] = "1"
   os.environ["TORCH_INTEROP_THREADS"] = "1"
   ```

5. Run `colab_notebook.py` from the repository's `inference-service` directory.
   Configure `COLAB_INFERENCE_URL` on the Next.js server with the printed HTTPS
   tunnel URL and configure `COLAB_INFERENCE_API_KEY` with the same temporary key.
   These variables must remain server-side; never use `NEXT_PUBLIC_` names.
6. In AyurSatya, choose **Try with Google Colab** and click **Check status**.
   The status endpoint performs a live `/health` request; an open browser tab is
   not considered availability.

## Shutdown

Stop the Colab runtime and remove the temporary URL and key from the server
environment when finished. The tunnel URL expires when the runtime ends.
