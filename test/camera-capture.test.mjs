import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_FACING,
  cameraConstraints,
  captureVideoFrame,
  isCameraSupported,
  mapCameraError,
  nextCameraFacing,
  requestCameraStream,
  stopMediaStream,
  videoFrameSize
} from "../lib/camera-capture.js";

test("camera helpers prefer the rear camera and stay jpeg-only", () => {
  assert.equal(isCameraSupported({ getUserMedia() {} }, true), true);
  assert.equal(isCameraSupported({ getUserMedia() {} }, false), false);
  assert.equal(isCameraSupported({}, true), false);
  assert.equal(nextCameraFacing(CAMERA_FACING.ENVIRONMENT), CAMERA_FACING.USER);
  assert.deepEqual(cameraConstraints().video.facingMode, { ideal: "environment" });
  assert.equal(videoFrameSize({ videoWidth: 1280, videoHeight: 720 }).width, 1280);
  assert.equal(videoFrameSize({ videoWidth: 0, videoHeight: 720 }), null);
});

test("camera permission errors stay specific and do not invent capture success", () => {
  assert.match(mapCameraError({ name: "NotAllowedError" }), /blocked/i);
  assert.match(mapCameraError({ name: "NotFoundError" }), /No camera/);
  assert.match(mapCameraError({ name: "NotReadableError" }), /already in use/);
  assert.match(mapCameraError({ name: "SecurityError" }), /HTTPS/);
});

test("stopMediaStream stops every track", () => {
  const stopped = [];
  stopMediaStream({
    getTracks() {
      return [
        { stop() { stopped.push("audio"); } },
        { stop() { stopped.push("video"); } }
      ];
    }
  });
  assert.deepEqual(stopped, ["audio", "video"]);
  stopMediaStream(null);
});

test("captureVideoFrame writes a jpeg file from the live frame", async () => {
  const video = { videoWidth: 8, videoHeight: 6 };
  const drawn = [];
  const file = await captureVideoFrame(video, {
    createCanvas(width, height) {
      return {
        width,
        height,
        getContext() {
          return {
            drawImage(...args) {
              drawn.push(args);
            }
          };
        },
        toBlob(callback, type, quality) {
          assert.equal(type, "image/jpeg");
          assert.equal(quality, 0.92);
          callback(new Blob(["jpeg-bytes"], { type }));
        }
      };
    }
  });
  assert.equal(file.type, "image/jpeg");
  assert.equal(file.name, "leaf-capture.jpg");
  assert.equal(drawn[0][0], video);
  await assert.rejects(captureVideoFrame({ videoWidth: 0, videoHeight: 0 }), /not ready/);
});

test("requestCameraStream falls back when facingMode is overconstrained", async () => {
  const calls = [];
  const stream = { id: "cam" };
  const getUserMedia = async (constraints) => {
    calls.push(constraints);
    if (constraints.video?.facingMode) {
      const error = new Error("overconstrained");
      error.name = "OverconstrainedError";
      throw error;
    }
    return stream;
  };
  const result = await requestCameraStream(getUserMedia, CAMERA_FACING.ENVIRONMENT);
  assert.equal(result, stream);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { audio: false, video: true });
});
