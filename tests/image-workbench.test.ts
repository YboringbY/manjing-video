import assert from "node:assert/strict";
import test from "node:test";
import type { MaterialAsset } from "../app/components/types";
import { imageSizeForRatio, imageTaskRetryDelay, imageTaskStatusMessage, mergeMaterials } from "../lib/image-workbench";

function material(id: number, overrides: Partial<MaterialAsset> = {}): MaterialAsset {
  return {
    id,
    name: `素材 ${id}`,
    url: `/uploads/${id}.png`,
    kind: "image",
    role: "reference_image",
    ...overrides
  };
}

test("mergeMaterials keeps incoming items first and deduplicates persisted materials", () => {
  const existing = [material(1, { dbId: 1, name: "旧名称" }), material(2, { dbId: 2 })];
  const incoming = [material(1, { dbId: 1, name: "新名称" }), material(3, { dbId: 3 })];

  const merged = mergeMaterials(existing, incoming);

  assert.deepEqual(merged.map(item => item.id), [1, 3, 2]);
  assert.equal(merged[0].name, "新名称");
});

test("mergeMaterials falls back to storage path and URL identities", () => {
  const merged = mergeMaterials(
    [material(1, { storagePath: "/data/a.png" }), material(2, { url: "/same.png" })],
    [material(3, { storagePath: "/data/a.png" }), material(4, { url: "/same.png" })]
  );

  assert.deepEqual(merged.map(item => item.id), [3, 4]);
});

test("imageSizeForRatio returns provider-compatible presets", () => {
  assert.deepEqual(imageSizeForRatio("1:1"), [1024, 1024]);
  assert.deepEqual(imageSizeForRatio("16:9"), [1344, 768]);
  assert.deepEqual(imageSizeForRatio("9:16"), [768, 1344]);
  assert.deepEqual(imageSizeForRatio("auto"), [1024, 1024]);
});

test("image task messages distinguish queued and running states", () => {
  assert.equal(imageTaskStatusMessage("pending"), "生图任务已排队，等待后台处理...");
  assert.equal(imageTaskStatusMessage("running"), "图片正在后台生成，离开页面或刷新不会中断任务...");
});

test("image task retry delay grows gradually and caps at ten seconds", () => {
  assert.equal(imageTaskRetryDelay(-1), 2500);
  assert.equal(imageTaskRetryDelay(0), 2500);
  assert.equal(imageTaskRetryDelay(10), 5000);
  assert.equal(imageTaskRetryDelay(100), 10000);
});
