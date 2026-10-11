"""Run the inference-service Flask app from Google Colab.

Paste the setup section into a Colab cell, provide the three environment
variables, then run this file. The printed HTTPS URL is temporary and must be
copied into the website's server-side COLAB_INFERENCE_URL setting.
"""

from __future__ import annotations

import os
from threading import Thread

from pyngrok import ngrok

from app import app


def start_colab_service() -> str:
    api_key = os.environ.get("INFERENCE_SERVICE_API_KEY")
    if not api_key or len(api_key) < 32:
        raise RuntimeError("Set a strong temporary INFERENCE_SERVICE_API_KEY first.")
    port = int(os.environ.get("PORT", "10000"))
    tunnel = ngrok.connect(port, "http")
    Thread(
        target=app.run,
        kwargs={"host": "0.0.0.0", "port": port, "threaded": True, "use_reloader": False},
        daemon=True,
    ).start()
    return tunnel.public_url.replace("http://", "https://", 1)


if __name__ == "__main__":
    print(f"Temporary Colab inference URL: {start_colab_service()}")
