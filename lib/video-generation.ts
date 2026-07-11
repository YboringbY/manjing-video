import { isZJVideoProvider, normalizeProviderBaseUrl } from "@/lib/providers/video";

export type MediaInput = { url: string; role?: string };
export type VideoApiProfile = { id?: string; name?: string; baseUrl?: string; apiKey?: string; model?: string; videoModels?: string[] };
export type CreateVideoResponse = {
  id?: string; task_id?: string; status?: string; error?: { message?: string } | string; message?: string;
  data?: { id?: string; task_id?: string; status?: string };
};

export function resolveVideoApiProfile(profile: VideoApiProfile | undefined, defaults: { baseUrl: string; model: string; name: string }) {
  const videoModels = Array.isArray(profile?.videoModels) ? profile.videoModels.map(item => item.trim()).filter(Boolean) : [];
  return {
    apiKey: profile?.apiKey?.trim() || process.env.SEEDANCE_API_KEY || "",
    baseUrl: normalizeProviderBaseUrl(profile?.baseUrl, defaults.baseUrl),
    videoModels,
    model: profile?.model?.trim() || videoModels[0] || defaults.model,
    name: profile?.name?.trim() || defaults.name
  };
}

export function normalizeVideoRatio(value?: string) {
  return value ? value.split(" ")[0] : "9:16";
}

export function normalizeVideoDuration(value?: number) {
  return Math.max(4, Math.min(15, Number(value || 5)));
}

export function buildDurationControlledPrompt(prompt: string, duration: number) {
  const text = prompt.trim();
  if (text.includes("严格时长控制")) return text;
  return [
    `严格时长控制：生成一个完整连续的 ${duration}秒 视频。`, text,
    `多场景要求：如果提示词包含“场景1/2、场景2/2”或多个段落，请把它们理解为同一个 ${duration}秒 视频内部的连续场景变化，不要拆成多个独立视频。`,
    `节奏要求：所有场景、动作、表情、镜头运动和停顿必须共同铺满 ${duration}秒，不要提前结束，不要把每个场景单独压缩成 3 秒。`,
    "结构要求：只生成一个完整视频，禁止自动分割、禁止输出多个片段、禁止新增无关剧情或字幕。"
  ].join("\n");
}

export function mediaUrls(items: MediaInput[] | undefined, limit: number) {
  return (items || []).map(item => item.url.trim()).filter(Boolean).slice(0, limit);
}

function providerMedia(items: MediaInput[] | undefined, limit: number, type: "image" | "video" | "audio") {
  return (items || []).filter(item => item.url.trim()).slice(0, limit).map(item => {
    if (type === "image") return { type: "image_url", image_url: { url: item.url.trim() }, role: item.role || "reference_image" };
    if (type === "video") return { type: "video_url", video_url: { url: item.url.trim() }, role: item.role || "reference_video" };
    return { type: "audio_url", audio_url: { url: item.url.trim() }, role: item.role || "reference_audio" };
  });
}

export function buildVideoProviderPayload(params: {
  baseUrl: string; model: string; prompt: string; inputType: string; ratio?: string; duration: number; resolution: string;
  generateAudio?: boolean; watermark?: boolean; images?: MediaInput[]; videos?: MediaInput[]; audios?: MediaInput[];
}) {
  const imageUrls = mediaUrls(params.images, 9);
  const videoUrls = mediaUrls(params.videos, 3);
  const audioUrls = mediaUrls(params.audios, 3);
  const firstLastFrame = params.inputType === "first_last_frame";
  if (isZJVideoProvider(params.baseUrl)) {
    return {
      model: params.model, prompt: params.prompt, input_type: params.inputType,
      images: firstLastFrame ? imageUrls.slice(0, 2) : imageUrls, videos: videoUrls, audios: audioUrls,
      ratio: normalizeVideoRatio(params.ratio), duration: params.duration, resolution: params.resolution,
      metadata: { draft: false, generate_audio: params.generateAudio ?? true, watermark: params.watermark ?? false }
    };
  }
  return {
    model: params.model, prompt: params.prompt,
    content: [
      { type: "text", text: params.prompt },
      ...providerMedia(firstLastFrame ? params.images?.slice(0, 2) : params.images, 9, "image"),
      ...providerMedia(params.videos, 3, "video"),
      ...providerMedia(params.audios, 3, "audio")
    ],
    ratio: normalizeVideoRatio(params.ratio), duration: params.duration, resolution: params.resolution,
    generate_audio: params.generateAudio ?? true, watermark: params.watermark ?? false
  };
}

export function extractCreatedTaskId(result: CreateVideoResponse) {
  return result.task_id || result.data?.task_id || result.id || result.data?.id;
}

export function createVideoError(result: CreateVideoResponse) {
  if (typeof result.error === "string") return result.error;
  return result.error?.message || result.message || "创建 Seedance 任务失败";
}

export function videoAuditMetadata(params: {
  model: string; provider: string; profileId?: string; duration?: number; ratio?: string; resolution?: string; inputType?: string;
  imageCount?: number; videoCount?: number; audioCount?: number; promptLength?: number; status?: number; message?: string;
}) {
  return { ...params };
}
