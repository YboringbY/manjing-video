export function publicMaterial(material: {
  id: number;
  projectId: number | null;
  name: string;
  kind: string;
  role: string;
  url: string;
  previewUrl: string | null;
  seedanceAssetUrl: string | null;
  reviewedAssetUrl: string | null;
  width: number | null;
  height: number | null;
  byteSize?: number | null;
  mimeType?: string | null;
  source: string;
  status: string;
  scope: string;
  prompt: string | null;
  sourceProjectId: number | null;
  sourceProjectName: string | null;
  createdByName: string | null;
}) {
  return {
    id: material.id,
    dbId: material.id,
    name: material.name,
    kind: material.kind,
    role: material.role,
    url: material.url,
    previewUrl: material.previewUrl || undefined,
    seedanceAssetUrl: material.seedanceAssetUrl || undefined,
    reviewedAssetUrl: material.reviewedAssetUrl || undefined,
    width: material.width || undefined,
    height: material.height || undefined,
    byteSize: material.byteSize || undefined,
    mimeType: material.mimeType || undefined,
    source: material.source,
    status: material.status,
    scope: material.scope,
    prompt: material.prompt || undefined,
    sourceProjectId: material.sourceProjectId || material.projectId || undefined,
    sourceProjectName: material.sourceProjectName || undefined,
    createdBy: material.createdByName || undefined
  };
}
