import io
import os
import tempfile
import unittest
from pathlib import Path
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

    def test_unknown_route_returns_structured_json_error(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.get_json()["error"],
            "The requested inference-service endpoint was not found.",
        )

    def test_unsupported_method_returns_structured_json_error(self):
        response = self.client.get("/predict")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(
            response.get_json()["error"],
            "The HTTP method is not supported for this endpoint.",
        )

    @patch("app.load_checkpoint")
    def test_repeated_health_checks_never_load_model(self, load_checkpoint):
        first = self.client.get("/health")
        second = self.client.get("/health")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.get_json()["status"], "ok")
        load_checkpoint.assert_not_called()

    @patch(
        "ml.inference._load_checkpoint_uncached",
        return_value=(object(), ["Neem_Healthy"], 224),
    )
    def test_ready_reuses_loaded_model(self, load_uncached):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {"INFERENCE_ARTIFACTS_DIR": directory}
        ):
            for artifact in (
                "best_efficientnet_b0.pt",
                "class_to_index.json",
                "training_config.json",
            ):
                Path(directory, artifact).write_bytes(b"artifact")
            first = self.client.get("/ready")
            second = self.client.get("/ready")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(first.get_json()["modelReady"])
        self.assertEqual(load_uncached.call_count, 1)

    @patch("app.load_checkpoint", side_effect=ValueError("bad checkpoint"))
    def test_ready_rejects_invalid_checkpoint(self, _load_checkpoint):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {"INFERENCE_ARTIFACTS_DIR": directory}
        ):
            for artifact in (
                "best_efficientnet_b0.pt",
                "class_to_index.json",
                "training_config.json",
            ):
                Path(directory, artifact).write_bytes(b"artifact")
            response = self.client.get("/ready")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.get_json()["modelReady"])

    def test_predict_rejects_malformed_image(self):
        response = self.client.post(
            "/predict",
            headers={"X-API-Key": "test-key"},
            data={"file": (io.BytesIO(b"not-an-image"), "leaf.jpg", "image/jpeg")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

    def test_health_reports_missing_artifacts_without_loading_model(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"INFERENCE_ARTIFACTS_DIR": directory}):
            response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["modelReady"])
        self.assertEqual(
            response.get_json()["missingArtifacts"],
            ["best_efficientnet_b0.pt", "class_to_index.json", "training_config.json"],
        )

    def test_predict_rejects_missing_artifacts_without_fabricating(self):
        image = Image.new("RGB", (2, 2), "white")
        image_data = io.BytesIO()
        image.save(image_data, format="PNG")
        image_data.seek(0)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"INFERENCE_ARTIFACTS_DIR": directory}):
            response = self.client.post(
                "/predict",
                headers={"X-API-Key": "test-key"},
                data={"file": (image_data, "leaf.png", "image/png")},
                content_type="multipart/form-data",
            )
        self.assertEqual(response.status_code, 503)

    @patch("app.run_inference")
    def test_predict_returns_model_output(self, run_inference):
        run_inference.return_value = {
            "className": "Neem_Healthy",
            "confidence": 0.91,
            "gradcamDataUrl": "data:image/png;base64,ZmFrZQ==",
        }
        image = Image.new("RGB", (2, 2), "white")
        image_data = io.BytesIO()
        image.save(image_data, format="PNG")
        image_data.seek(0)
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {"INFERENCE_ARTIFACTS_DIR": directory}
        ):
            for artifact in (
                "best_efficientnet_b0.pt",
                "class_to_index.json",
                "training_config.json",
            ):
                Path(directory, artifact).write_bytes(b"artifact")
            response = self.client.post(
                "/predict",
                headers={"X-API-Key": "test-key"},
                data={"file": (image_data, "leaf.png", "image/png")},
                content_type="multipart/form-data",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["className"], "Neem_Healthy")
        self.assertEqual(response.get_json()["confidence"], 0.91)
        self.assertTrue(response.get_json()["gradcamDataUrl"].startswith("data:image/png"))

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
