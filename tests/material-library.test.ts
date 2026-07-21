import assert from "node:assert/strict";
import test from "node:test";
import type { MaterialAsset } from "../app/components/types";
import { filterProjectMaterials, filterSharedMaterials, materialApiUrl, materialLibraryCounts } from "../lib/material-library";

function material(id: number, overrides: Partial<MaterialAsset> = {}): MaterialAsset {
  return {
    id,
    name: `素材 ${id}`,
    url: `https://cdn.example.com/${id}.png`,
    kind: "image",
    role: "reference_image",
    ...overrides
  };
}

test("project filters keep the active kind and match metadata", () => {
  const materials = [
    material(1, { name: "王振" }),
    material(2, { name: "渡边", kind: "video", role: "reference_video" }),
    material(3, { sourceProjectName: "上海场景" })
  ];

  assert.deepEqual(filterProjectMaterials(materials, "image", "").map(item => item.id), [1, 3]);
  assert.deepEqual(filterProjectMaterials(materials, "image", "上海").map(item => item.id), [3]);
});

test("shared filters distinguish prompts from media", () => {
  const materials = [
    material(1),
    material(2, { kind: "sd2", role: "reference_image", name: "雨夜提示词" }),
    material(3, { kind: "audio", role: "reference_audio", createdBy: "张三" })
  ];

  assert.deepEqual(filterSharedMaterials(materials, "prompt", "").map(item => item.id), [2]);
  assert.deepEqual(filterSharedMaterials(materials, "all", "张三").map(item => item.id), [3]);
});

test("material counts keep project and shared scopes explicit", () => {
  assert.deepEqual(materialLibraryCounts([material(1), material(2)], [material(3)]), { project: 2, shared: 1 });
});

test("material API URL only exposes public provider-accessible URLs", () => {
  assert.equal(materialApiUrl(material(1)), "https://cdn.example.com/1.png");
  assert.equal(materialApiUrl(material(2, { reviewedAssetUrl: "https://reviewed.example.com/2.png" })), "https://reviewed.example.com/2.png");
  assert.equal(materialApiUrl(material(3, { url: "/uploads/3.png" })), undefined);
});
