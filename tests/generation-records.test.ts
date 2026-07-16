import assert from "node:assert/strict";
import test from "node:test";
import type { VideoTask } from "../app/components/types";
import { filterGenerationTasks, generationRecordCounts, proxiedVideoUrl, sortGenerationTasks, taskSnapshotText } from "../lib/generation-records";

function task(id: string, status: VideoTask["status"], createdAt?: string): VideoTask {
  return { id, shotId: 1, shotTitle: "分镜", provider: "测试渠道", status, result: "测试", createdAt };
}

test("sortGenerationTasks orders dated tasks newest first without mutating input", () => {
  const input = [task("older", "done", "2026-07-15T00:00:00.000Z"), task("newer", "done", "2026-07-16T00:00:00.000Z")];
  const sorted = sortGenerationTasks(input);

  assert.deepEqual(sorted.map(item => item.id), ["newer", "older"]);
  assert.deepEqual(input.map(item => item.id), ["older", "newer"]);
});

test("running generation filter includes queued and active tasks", () => {
  const tasks = [task("pending", "pending"), task("running", "running"), task("done", "done"), task("failed", "failed")];

  assert.deepEqual(filterGenerationTasks(tasks, "running").map(item => item.id), ["pending", "running"]);
  assert.deepEqual(generationRecordCounts(tasks), { all: 4, running: 2, done: 1, failed: 1 });
});

test("taskSnapshotText preserves compact generation parameters", () => {
  const item = task("snapshot", "done");
  item.snapshot = { prompt: "测试", ratio: "9:16 竖屏短剧", duration: 10, resolution: "480p", materialIds: [], externalAssetIds: [] };

  assert.equal(taskSnapshotText(item), "10s / 9:16 / 480p");
  assert.equal(taskSnapshotText(task("legacy", "done")), "历史任务未记录完整参数");
});

test("proxiedVideoUrl encodes upstream URL and download mode", () => {
  const url = proxiedVideoUrl({ url: "https://example.com/a b.mp4?x=1", taskId: "task/1", profileId: "profile 1", download: true });

  assert.equal(url, "/api/video-files?url=https%3A%2F%2Fexample.com%2Fa+b.mp4%3Fx%3D1&task_id=task%2F1&profile_id=profile+1&download=1");
  assert.equal(proxiedVideoUrl({}), "");
});
