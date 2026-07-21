import type { LibraryFilter, MaterialAsset, MaterialKind, MaterialRole } from "@/app/components/types";
import { isPublicMediaUrl } from "@/lib/media-url";

export const MIN_VIDEO_REFERENCE_IMAGE_SIDE = 300;

function matchesMaterialSearch(material: MaterialAsset, search: string) {
  const keyword = search.trim().toLowerCase();
  if (!keyword) return true;
  return `${material.name} ${material.sourceProjectName || ""} ${material.createdBy || ""}`.toLowerCase().includes(keyword);
}

export function filterProjectMaterials(materials: MaterialAsset[], kind: MaterialKind, search: string) {
  return materials.filter(material => material.kind === kind && matchesMaterialSearch(material, search));
}

export function filterSharedMaterials(materials: MaterialAsset[], filter: LibraryFilter, search: string) {
  return materials.filter(material => {
    const typeMatched = filter === "all"
      || (filter === "prompt" ? material.kind === "sd2" : material.kind === filter);
    return typeMatched && matchesMaterialSearch(material, search);
  });
}

export function materialLibraryCounts(projectMaterials: MaterialAsset[], sharedMaterials: MaterialAsset[]) {
  return {
    project: projectMaterials.length,
    shared: sharedMaterials.length
  };
}

export function materialDimensionText(material: Pick<MaterialAsset, "width" | "height">) {
  return material.width && material.height ? `${material.width}x${material.height}` : "";
}

export function isSmallVideoReferenceImage(material: MaterialAsset) {
  return material.kind === "image"
    && Boolean(material.width && material.height)
    && Math.min(material.width || 0, material.height || 0) < MIN_VIDEO_REFERENCE_IMAGE_SIDE;
}

export function materialApiUrl(material: MaterialAsset) {
  const candidate = material.reviewedAssetUrl || material.seedanceAssetUrl || material.url;
  return isPublicMediaUrl(candidate) ? candidate : undefined;
}

export function materialPreviewUrl(material: MaterialAsset) {
  return material.previewUrl || materialApiUrl(material);
}

export function materialKindLabel(kind: MaterialKind) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  if (kind === "audio") return "音频";
  return "提示词";
}

export function materialRoleOptions(kind: MaterialKind): Array<[MaterialRole, string]> {
  if (kind === "image") return [["reference_image", "参考图"]];
  if (kind === "video") return [["reference_video", "参考视频"]];
  return [["reference_audio", "参考音频"]];
}

export function materialUploadAccept(kind: MaterialKind) {
  if (kind === "image") return "image/*";
  if (kind === "video") return "video/*";
  return "audio/*";
}
