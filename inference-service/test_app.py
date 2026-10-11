import io
import os
import unittest
from unittest.mock import patch

from PIL import Image

os.environ["INFERENCE_SERVICE_API_KEY"] = "test-key"

from app import app  # noqa: E402


class InferenceServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_predict_rejects_missing_api_key(self):
        response = self.client.post("/predict")
        self.assertEqual(response.status_code, 401)

    @patch("ml.inference.load_checkpoint")
    def test_health_reports_ready_model(self, load_checkpoint):
        load_checkpoint.return_value = (object(), ["Neem_Healthy"], 224)
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["modelReady"])

    def test_predict_rejects_malformed_image(self):
        response = self.client.post(
            "/predict",
            headers={"X-API-Key": "test-key"},
            data={"file": (io.BytesIO(b"not-an-image"), "leaf.jpg", "image/jpeg")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

    @patch("app.run_inference")
    def test_predict_returns_inference_error(self, run_inference):
        run_inference.side_effect = RuntimeError("model failed")
        image = Image.new("RGB", (2, 2), "white")
        image_data = io.BytesIO()
        image.save(image_data, format="PNG")
        image_data.seek(0)
        response = self.client.post(
            "/predict",
            headers={"X-API-Key": "test-key"},
            data={"file": (image_data, "leaf.png", "image/png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 502)


if __name__ == "__main__":
    unittest.main()
