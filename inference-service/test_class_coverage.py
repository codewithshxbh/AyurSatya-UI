"""Run one TEST-SPLIT image per class through the existing checkpoint.

This is an inference contract check. It does not train, tune, or rewrite artifacts.
"""

from __future__ import annotations

import json
import math
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ml.inference import run_inference  # noqa: E402

ARTIFACTS = ROOT / "ml" / "artifacts"
CHECKPOINT = ARTIFACTS / "best_efficientnet_b0.pt"
MAPPING = ARTIFACTS / "class_to_index.json"
SPLIT = ARTIFACTS / "split_manifest.json"
REQUIRED_LABELS = [
    "Kalanchoe_Healthy",
    "Kalanchoe_Web_Blight",
    "Kalanchoe_Yellow",
    "Kalanchoe_Yellow_Blight",
    "Neem_Healthy",
    "Neem_Spot",
    "Neem_Web_Blight",
    "Neem_Yellow",
    "Tulsi_Downy_Mildew",
    "Tulsi_Healthy",
    "Tulsi_Web_Blight",
    "Tulsi_Yellow_Spot",
]


def _checkpoint_ready() -> bool:
    return CHECKPOINT.is_file() and MAPPING.is_file() and SPLIT.is_file()


@unittest.skipUnless(_checkpoint_ready(), "Local EfficientNet-B0 artifacts are not present.")
class TestSplitClassCoverage(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ["ENABLE_GRADCAM"] = "0"
        mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
        cls.mapping = mapping
        cls.labels = [label for label, _ in sorted(mapping.items(), key=lambda item: item[1])]
        manifest = json.loads(SPLIT.read_text(encoding="utf-8"))
        cls.samples = {}
        for item in manifest["splits"]["test"]:
            if item["label"] not in cls.samples and Path(item["path"]).is_file():
                cls.samples[item["label"]] = item

    def test_mapping_preserves_required_class_order(self) -> None:
        self.assertEqual(self.labels, REQUIRED_LABELS)

    def test_one_test_split_image_per_class_returns_a_valid_contract(self) -> None:
        missing = [label for label in REQUIRED_LABELS if label not in self.samples]
        self.assertEqual(missing, [], f"Test-split images missing for {missing}")

        report = []
        for expected in REQUIRED_LABELS:
            sample = self.samples[expected]
            prediction = run_inference(Path(sample["path"]).read_bytes(), ARTIFACTS)
            class_name = prediction["className"]
            confidence = prediction["confidence"]
            expected_crop = expected.split("_", 1)[0]
            predicted_crop = class_name.split("_", 1)[0]
            compatible = predicted_crop == expected_crop
            correct = class_name == expected
            self.assertIsInstance(class_name, str)
            self.assertIn(class_name, REQUIRED_LABELS)
            self.assertIsInstance(confidence, float)
            self.assertTrue(math.isfinite(confidence))
            self.assertGreaterEqual(confidence, 0.0)
            self.assertLessEqual(confidence, 1.0)
            self.assertEqual(prediction["gradcamDataUrl"], "")
            report.append({
                "expectedClass": expected,
                "predictedClass": class_name,
                "confidence": confidence,
                "correct": correct,
                "cropCompatible": compatible,
                "inferenceProvider": "local-checkpoint",
                "split": "test",
                "image": sample["path"],
            })

        print("\nPHASE2_TEST_SPLIT_COVERAGE")
        print(json.dumps(report, indent=2))
        self.assertEqual(len(report), 12)


if __name__ == "__main__":
    unittest.main()
