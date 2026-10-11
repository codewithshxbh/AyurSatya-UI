import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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


if __name__ == "__main__":
    unittest.main()
