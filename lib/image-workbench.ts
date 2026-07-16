import type { AspectRatio, MaterialAsset } from "@/app/components/types";

const IMAGE_RATIO_SIZES: Record<AspectRatio, [number, number]> = {
  "1:1": [1024, 1024],
  "3:2": [1216, 832],
  "2:3": [832, 1216],
  "4:3": [1152, 896],
  "3:4": [896, 1152],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  auto: [1024, 1024]
};

function materialKey(material: MaterialAsset) {
  return material.dbId ? `db:${material.dbId}` : material.storagePath ? `storage:${material.storagePath}` : `url:${material.url}`;
}

export function mergeMaterials(current: MaterialAsset[], incoming: MaterialAsset[]) {
  const seen = new Set<string>();
  return [...incoming, ...current].filter(material => {
    const key = materialKey(material);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function imageSizeForRatio(ratio: AspectRatio) {
  return IMAGE_RATIO_SIZES[ratio];
}

export function imageTaskStatusMessage(status: "pending" | "running") {
  return status === "pending"
    ? "生图任务已排队，等待后台处理..."
    : "图片正在后台生成，离开页面或刷新不会中断任务...";
}

export function imageTaskRetryDelay(attempt: number) {
  return Math.min(10000, 2500 + Math.max(0, attempt) * 250);
}
