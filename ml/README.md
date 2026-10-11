# AyurSatya EfficientNet-B0 training

This pipeline uses the inspected dataset at:

`datasets/Medicinal Plant Leaf Disease Dataset/Medicinal_leaf_dataset`

It currently contains 2,547 JPG images in 12 verified class directories:
Neem (Healthy, Spot, Web Blight, Yellow), Tulsi (Healthy, Downy Mildew, Web Blight, Yellow Spot), and Kalanchoe (Healthy, Web Blight, Yellow, Yellow Blight).

The script validates every image, detects exact duplicate bytes, refuses conflicting duplicate labels, assigns duplicate groups to one stratified 70/15/15 split, fine-tunes pretrained torchvision EfficientNet-B0, applies ImageNet normalization, applies augmentation only to training data, saves the best validation-loss checkpoint, and evaluates the held-out test set with accuracy, macro precision, macro recall, macro F1, per-class metrics, and a confusion matrix.

## Windows PowerShell

From the repository root:

```powershell
py -3.11 -m venv .venv-training
.\.venv-training\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-training.txt
python ml\train.py --validate-only
python ml\train.py --epochs 30 --batch-size 32
```

If PowerShell blocks activation, run the commands with the interpreter directly:

```powershell
.\.venv-training\Scripts\python.exe ml\train.py --validate-only
```

For an NVIDIA GPU, install the PyTorch build recommended by https://pytorch.org before installing the remaining requirements.

## Google Colab

```python
from google.colab import drive
drive.mount("/content/drive")
%cd /content/your-repository
!pip install -r requirements-training.txt
!python ml/train.py --validate-only
!python ml/train.py --epochs 30 --batch-size 32 --num-workers 2
```

Copy `ml/artifacts/` out of the runtime after training. It contains `best_efficientnet_b0.pt`, `class_to_index.json`, `training_config.json`, `dataset_validation.json`, `split_manifest.json`, `training_history.json`, and `test_evaluation.json`. These artifacts are ignored by Git along with the dataset.

## Inference integration

The Next.js analysis route now uses `ml/inference.py` for local or self-hosted
Node deployments. It loads `best_efficientnet_b0.pt`, verifies the checkpoint
mapping against `class_to_index.json`, applies the 224px resize and ImageNet
normalization used by evaluation, and returns the actual top-class softmax
confidence plus a Grad-CAM PNG generated from the final EfficientNet feature
layer.

The current artifact was produced with `--epochs 1` and is a diagnostic
checkpoint, not a production-validated model. The API labels it
`diagnostic_checkpoint` and the UI describes predictions as preliminary.

The bridge intentionally returns an unavailable state on Vercel. Vercel's
Node runtime does not provide the repository's Python/Torch/Torchvision runtime,
and ignored `.pt` artifacts are not part of a deployable application bundle.
Use a self-hosted Node/Python runtime with the training environment for genuine
local inference, or keep the Vercel unavailable state until a separately
validated free-tier model-serving runtime is selected. No predictions or
heatmaps are fabricated when the runtime or checkpoint is missing.
