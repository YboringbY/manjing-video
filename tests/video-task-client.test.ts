import assert from "node:assert/strict";
import test from "node:test";
import { isFailedVideoStatus, isHttpVideoUrl, isRunningVideoStatus, videoTaskPollDelay, videoTaskPollLimitExceeded } from "../lib/video-task-client";

test("video task status groups cover provider variants", () => {
  for (const status of ["pending", "submitted", "queued", "running", "processing"]) assert.equal(isRunningVideoStatus(status), true);
  for (const status of ["failed", "error", "cancelled", "canceled"]) assert.equal(isFailedVideoStatus(status), true);
  assert.equal(isRunningVideoStatus("succeeded"), false);
  assert.equal(isFailedVideoStatus("succeeded"), false);
});

test("video polling delay backs off after failed requests and caps at thirty seconds", () => {
  assert.equal(videoTaskPollDelay(-1), 5000);
  assert.equal(videoTaskPollDelay(0), 5000);
  assert.equal(videoTaskPollDelay(3), 11000);
  assert.equal(videoTaskPollDelay(100), 30000);
});

test("video polling stops on elapsed, total, or failed attempt limits", () => {
  assert.equal(videoTaskPollLimitExceeded({ elapsedMs: 30 * 60 * 1000, attempt: 359, failedAttempts: 11 }), false);
  assert.equal(videoTaskPollLimitExceeded({ elapsedMs: 30 * 60 * 1000 + 1, attempt: 0, failedAttempts: 0 }), true);
  assert.equal(videoTaskPollLimitExceeded({ elapsedMs: 0, attempt: 360, failedAttempts: 0 }), true);
  assert.equal(videoTaskPollLimitExceeded({ elapsedMs: 0, attempt: 0, failedAttempts: 12 }), true);
});

test("video URL validation only accepts HTTP protocols", () => {
  assert.equal(isHttpVideoUrl("https://cdn.example.com/video.mp4"), true);
  assert.equal(isHttpVideoUrl("http://cdn.example.com/video.mp4"), true);
  assert.equal(isHttpVideoUrl("/uploads/video.mp4"), false);
  assert.equal(isHttpVideoUrl("javascript:alert(1)"), false);
});
