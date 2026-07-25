import assert from "node:assert/strict";
import test from "node:test";
import { buildShotDurationControlledPrompt, createSinglePromptShot, estimatePromptDuration, prepareBatchShots, splitPromptIntoShots } from "../lib/shot-splitting";

const ratio = "9:16 竖屏短剧";

test("estimatePromptDuration accepts common Chinese duration statements", () => {
  assert.equal(estimatePromptDuration("总时长 12 秒，雨夜追逐。", 6), 12);
  assert.equal(estimatePromptDuration("一个 9s 视频", 6), 9);
  assert.equal(estimatePromptDuration("没有明确时长", 6), 6);
});

test("timeline prompts become ordered shots and keep their own durations", () => {
  const shots = splitPromptIntoShots("总时长12秒。\n0-3秒：女主推门进入。\n3-8秒：男主回头看她。\n8-12秒：两人沉默对视。", { ratio, preferredDuration: 12, now: 1000 });

  assert.deepEqual(shots.map(shot => ({ id: shot.id, duration: shot.duration })), [{ id: 1000, duration: 3 }, { id: 1001, duration: 5 }, { id: 1002, duration: 4 }]);
  assert.match(shots[1].prompt, /第 2 个镜头/);
  assert.match(shots[2].title, /两人沉默对视/);
});

test("long text splits into a bounded set of sequential shots", () => {
  const shots = splitPromptIntoShots("女主在雨夜赶到车站等待男主。男主撑伞走来却没有立刻开口。两人在站台尽头对视并说出误会。列车经过时女主终于转身离开。", { ratio, preferredDuration: 12, now: 2000 });

  assert.equal(shots.length, 4);
  assert.deepEqual(shots.map(shot => shot.id), [2000, 2001, 2002, 2003]);
  assert(shots.every(shot => shot.duration >= 3));
  assert(shots.every(shot => shot.ratio === ratio));
});

test("batch preparation falls back to one duration-controlled shot when text cannot split", () => {
  const shots = prepareBatchShots("一个人物缓慢回头。", { ratio, selectedDuration: 9, now: 3000 });

  assert.equal(shots.length, 1);
  assert.equal(shots[0].id, 3000);
  assert.equal(shots[0].duration, 9);
  assert.match(shots[0].prompt, /完整连续的 9秒 视频/);
});

test("duration-controlled prompt is idempotent and single-shot creation keeps selected ratio", () => {
  const prompt = buildShotDurationControlledPrompt("两人在走廊相遇。", 6);
  const shot = createSinglePromptShot("两人在走廊相遇。", 6, "16:9 横屏", 4000);

  assert.equal(buildShotDurationControlledPrompt(prompt, 6), prompt);
  assert.equal(shot.ratio, "16:9 横屏");
  assert.equal(shot.status, "pending");
  assert.equal(shot.id, 4000);
});
