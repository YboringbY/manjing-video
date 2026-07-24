import assert from "node:assert/strict";
import test from "node:test";
import { extractVideoError, extractVideoUrl, upstreamHost } from "../lib/video-status";

test("extractVideoUrl accepts common top-level and nested provider response shapes", () => {
  assert.equal(extractVideoUrl({ output: "https://cdn.example.com/output.mp4" }), "https://cdn.example.com/output.mp4");
  assert.equal(extractVideoUrl({ data: { result: { video_url: "https://cdn.example.com/nested.mp4" } } }), "https://cdn.example.com/nested.mp4");
  assert.equal(extractVideoUrl({ data: [{ url: "https://cdn.example.com/list.mp4" }] }), "https://cdn.example.com/list.mp4");
  assert.equal(extractVideoUrl({ output: "javascript:alert(1)", url: "/uploads/local.mp4" }), "");
});

test("extractVideoError prioritizes useful provider details", () => {
  assert.equal(extractVideoError({ error: { message: "provider failed" } }), "provider failed");
  assert.equal(extractVideoError({ message: "detailed upstream failure", error: "fallback" }), "detailed upstream failure");
  assert.equal(extractVideoError({ output: "generation failed: invalid input" }), "generation failed: invalid input");
});

test("quota errors are translated into an actionable Chinese message", () => {
  const expected = "账户余额不足，当前额度不足以生成该视频，请充值后重试。";

  assert.equal(extractVideoError({ error: "pre_consume_token_quota_failed" }), expected);
  assert.equal(extractVideoError({ data: { error: "token quota is not enough" } }), expected);
});

test("upstreamHost returns hostnames while preserving invalid configuration for diagnostics", () => {
  assert.equal(upstreamHost("https://api.example.com/v1"), "api.example.com");
  assert.equal(upstreamHost("not-a-url"), "not-a-url");
});
