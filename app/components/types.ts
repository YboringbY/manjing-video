export type ShotStatus = "pending" | "running" | "done" | "failed";
export type TaskStatus = "pending" | "running" | "done" | "failed";
export type MaterialKind = "image" | "video" | "audio" | "sd2";
export type MaterialRole = "reference_image" | "first_frame" | "last_frame" | "reference_video" | "reference_audio";
export type ImageQuality = "auto" | "high" | "medium" | "low";
export type AspectRatio = "1:1" | "3:2" | "2:3" | "4:3" | "3:4" | "16:9" | "9:16" | "auto";
export type LibraryFilter = "all" | "text" | "image" | "video";

export type Project = { id: number; name: string; type: string; script: string };
export type Shot = { id: number; title: string; prompt: string; ratio: string; duration: number; status: ShotStatus; resolution?: "480p" | "720p" | "1080p"; width?: number; height?: number };
export type VideoTask = { id: string; shotId: number; shotTitle: string; provider: string; status: TaskStatus; result: string; providerTaskId?: string };
export type VideoAsset = { id: number; shotId: number; title: string; meta: string; gradient: string; videoUrl?: string; providerTaskId?: string };
export type MaterialAsset = { id: number; name: string; url: string; kind: MaterialKind; role: MaterialRole; previewUrl?: string; seedanceAssetUrl?: string; reviewedAssetUrl?: string };
export type AppState = { project: Project; shots: Shot[]; tasks: VideoTask[]; assets: VideoAsset[]; materials: MaterialAsset[]; assetGroupId?: string | number };
export type ProjectStates = Record<number, AppState>;

export type MemberRole = "super_admin" | "tenant_admin" | "user";
export type ProfileSection = "basic" | "security";
export type WorkspaceSection = "project-home" | "overview" | "script" | "shots" | "image-workbench" | "material-assets" | "tasks" | "assets" | "members" | "channel-management" | "profile";
export type ApiProfile = { id: string; name: string; baseUrl: string; apiKey?: string; model?: string; videoModels: string[]; imageModels: string[]; concurrencyLimit?: number; active: boolean; createdAt: number; hasApiKey?: boolean };
export type VisualAsset = {
  id: string;
  asset_url: string;
  asset_name: string;
  类型: string;
  同步状态: string;
  失败原因: string;
  资产状态: string;
  所属组: string;
  group_id: string;
  创建时间: string;
  操作: string[];
  原始URL: string;
};
