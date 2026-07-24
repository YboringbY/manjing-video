import assert from "node:assert/strict";
import test from "node:test";
import { buildDurationControlledPrompt, buildVideoProviderPayload, createVideoError, extractCreatedTaskId, mediaUrls, normalizeVideoDuration, normalizeVideoRatio, resolveVideoApiProfile } from "../lib/video-generation";

const defaults = { baseUrl: "https://default.example.com/v1/", model: "default-model", name: "默认渠道" };

test("resolveVideoApiProfile trims configured values and keeps explicit model priority", () => {
  const profile = resolveVideoApiProfile({ apiKey: " secret ", baseUrl: "https://api.example.com/v1/", model: " chosen ", name: " 渠道 A ", videoModels: [" model-a ", "", "model-b"] }, defaults);

  assert.deepEqual(profile, {
    apiKey: "secret",
    baseUrl: "https://api.example.com/v1",
    videoModels: ["model-a", "model-b"],
    model: "chosen",
    name: "渠道 A"
  });
});

test("video ratio and duration normalization enforce provider limits", () => {
  assert.equal(normalizeVideoRatio("9:16 竖屏短剧"), "9:16");
  assert.equal(normalizeVideoRatio(), "9:16");
  assert.equal(normalizeVideoDuration(1), 4);
  assert.equal(normalizeVideoDuration(12), 12);
  assert.equal(normalizeVideoDuration(30), 15);
});

test("duration controlled prompts are explicit and idempotent", () => {
  const prompt = buildDurationControlledPrompt("场景1/2：开门。\n场景2/2：回头。", 12);

  assert.match(prompt, /完整连续的 12秒 视频/);
  assert.match(prompt, /同一个 12秒 视频内部的连续场景变化/);
  assert.equal(buildDurationControlledPrompt(prompt, 12), prompt);
});

test("mediaUrls trims empty entries and applies the provider limit", () => {
  assert.deepEqual(mediaUrls([{ url: " a " }, { url: " " }, { url: "b" }, { url: "c" }], 2), ["a", "b"]);
  assert.deepEqual(mediaUrls(undefined, 2), []);
});

test("ZJ first-last-frame payload limits images and keeps provider metadata", () => {
  const payload = buildVideoProviderPayload({
    baseUrl: "https://zjljzn.ltd/v1",
    model: "seedance",
    prompt: "测试",
    inputType: "first_last_frame",
    ratio: "16:9 横屏",
    duration: 8,
    resolution: "720p",
    generateAudio: false,
    watermark: true,
    images: [{ url: "https://cdn.example.com/first.png", role: "first_frame" }, { url: "https://cdn.example.com/last.png", role: "last_frame" }, { url: "https://cdn.example.com/ignored.png" }]
  });

  assert.deepEqual(payload.images, ["https://cdn.example.com/first.png", "https://cdn.example.com/last.png"]);
  assert.equal(payload.ratio, "16:9");
  assert.deepEqual(payload.metadata, { draft: false, generate_audio: false, watermark: true });
});

test("generic provider payload preserves media roles and limits reference counts", () => {
  const payload = buildVideoProviderPayload({
    baseUrl: "https://api.example.com/v1",
    model: "seedance",
    prompt: "测试",
    inputType: "reference",
    duration: 5,
    resolution: "480p",
    images: [{ url: "https://cdn.example.com/image.png", role: "character" }],
    videos: [{ url: "https://cdn.example.com/video.mp4" }],
    audios: [{ url: "https://cdn.example.com/audio.mp3", role: "dialogue" }]
  });

  assert.deepEqual(payload.content, [
    { type: "text", text: "测试" },
    { type: "image_url", image_url: { url: "https://cdn.example.com/image.png" }, role: "character" },
    { type: "video_url", video_url: { url: "https://cdn.example.com/video.mp4" }, role: "reference_video" },
    { type: "audio_url", audio_url: { url: "https://cdn.example.com/audio.mp3" }, role: "dialogue" }
  ]);
});

test("created task and error helpers cover nested provider responses", () => {
  assert.equal(extractCreatedTaskId({ data: { task_id: "task-1" } }), "task-1");
  assert.equal(extractCreatedTaskId({ id: "task-2" }), "task-2");
  assert.equal(createVideoError({ error: { message: "额度不足" } }), "额度不足");
  assert.equal(createVideoError({}), "创建 Seedance 任务失败");
});
