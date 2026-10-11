import tempfile
import unittest
import base64
import io
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from ml import inference


class InferenceCacheTests(unittest.TestCase):
    def test_load_checkpoint_reuses_model_for_resolved_artifact_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_dir = Path(directory)
            with patch(
                "ml.inference._load_checkpoint_uncached",
                return_value=(object(), ["Neem_Healthy"], 224),
            ) as load_uncached:
                first = inference.load_checkpoint(artifact_dir)
                second = inference.load_checkpoint(artifact_dir / ".")

        self.assertIs(first, second)
        load_uncached.assert_called_once()

    def test_decode_image_bounds_large_dimensions_before_gradcam(self):
        image = Image.new("RGB", (4096, 3072), "white")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        image_data = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

        decoded = inference.decode_image(image_data)

        self.assertLessEqual(decoded.width, 2048)
        self.assertLessEqual(decoded.height, 2048)
        self.assertEqual(decoded.size, (2048, 1536))


if __name__ == "__main__":
    unittest.main()
