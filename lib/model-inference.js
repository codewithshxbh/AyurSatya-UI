import { spawn } from "node:child_process";
import path from "node:path";

const repositoryRoot = process.cwd();

export function getInferenceAvailability() {
  if (process.env.VERCEL) {
    return { available: false, reason: "EfficientNet-B0 inference is not available in the Vercel runtime." };
  }
  return { available: true, reason: null };
}

export function runEfficientNetInference(imageData) {
  return new Promise((resolve, reject) => {
    const python = process.env.MODEL_PYTHON_PATH || (
      process.platform === "win32"
        ? path.join(repositoryRoot, ".venv", "Scripts", "python.exe")
        : path.join(repositoryRoot, ".venv", "bin", "python")
    );
    const child = spawn(python, [path.join(repositoryRoot, "ml", "inference.py")], {
      cwd: repositoryRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("EfficientNet-B0 inference timed out."));
    }, 30000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`EfficientNet-B0 runtime could not start: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stdout.trim() || stderr.trim() || "EfficientNet-B0 inference failed."));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("EfficientNet-B0 runtime returned invalid output."));
      }
    });
    child.stdin.end(JSON.stringify({ imageData }));
  });
}
