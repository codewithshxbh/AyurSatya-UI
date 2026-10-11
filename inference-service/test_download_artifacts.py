import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from download_artifacts import ArtifactDownloadError, download_artifacts


class ArtifactDownloaderTests(unittest.TestCase):
    def test_rejects_missing_environment_variables(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ArtifactDownloadError, "HF_TOKEN"):
                download_artifacts()

        with patch.dict(os.environ, {"HF_TOKEN": "test-token"}, clear=True):
            with self.assertRaisesRegex(ArtifactDownloadError, "HF_MODEL_REPO_ID"):
                download_artifacts()

    def test_reports_sanitized_provider_failure_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch(
                "download_artifacts._download_file",
                side_effect=ArtifactDownloadError(
                    "Could not download required model artifact 'best_efficientnet_b0.pt'. "
                    "Check the private repository, HF_TOKEN permissions, and Render network access."
                ),
            ) as download_file:
                with self.assertRaisesRegex(ArtifactDownloadError, "Could not download required model artifact"):
                    download_artifacts("private/repo", "secret-token", directory)
                download_file.assert_called_once()

    def test_verifies_allowlisted_files_without_network(self):
        def fake_download(filename, _repo_id, _token, target_dir):
            path = Path(target_dir) / filename
            path.write_bytes(b"artifact")
            return path

        with tempfile.TemporaryDirectory() as directory, patch(
            "download_artifacts._download_file", side_effect=fake_download
        ):
            paths = download_artifacts("private/repo", "secret-token", directory)

        self.assertEqual([path.name for path in paths], [
            "best_efficientnet_b0.pt",
            "class_to_index.json",
            "training_config.json",
        ])


if __name__ == "__main__":
    unittest.main()
