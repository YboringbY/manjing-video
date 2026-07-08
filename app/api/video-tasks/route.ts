import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { fetchWithTimeout } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { resolveModelRoute, toPublicProfile } from "../api-profiles/store";

type MediaInput = {
  url: string;
  role?: string;
};

type ApiProfile = { id?: string; name?: string; baseUrl?: string; apiKey?: string; model?: string; videoModels?: string[] };

type GenerateVideoPayload = {
  profile_id?: string;
  model_id?: string;
  shot?: {
    id?: number;
    title?: string;
    prompt?: string;
    ratio?: string;
    duration?: number;
  };
  mode?: "fast" | "pro";
  resolution?: "480p" | "720p" | "1080p";
  input_type?: "reference" | "first_last_frame";
  generate_audio?: boolean;
  watermark?: boolean;
  images?: MediaInput[];
  videos?: MediaInput[];
  audios?: MediaInput[];
};

type FastGateTaskResponse = {
  id?: string;
  task_id?: string;
  status?: string;
  error?: { message?: string } | string;
  message?: string;
  data?: {
    id?: string;
    task_id?: string;
    status?: string;
  };
};

type FastGateListItem = {
  id?: string;
  status?: string;
  url?: string;
  video_url?: string;
  content?: { video_url?: string; url?: string };
  data?: Array<{ url?: string; video_url?: string }>;
  prompt?: string;
  created_at?: number;
  error?: string | { message?: string };
};

type FastGateListResponse = {
  data?: FastGateListItem[];
  items?: FastGateListItem[];
};

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://api.aifastgate.com";
const MODEL = process.env.SEEDANCE_MODEL || "doubao-seedance-2.0-fast";
const MAX_VIDEO_PROMPT_LENGTH = 8000;
const MAX_MEDIA_URL_LENGTH = 2048;

function normalizeBaseUrl(value?: string) {
  return (value || BASE_URL).trim().replace(/\/$/, "");
}

function isZJProvider(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname === "zjljzn.ltd";
  } catch {
    return baseUrl.includes("zjljzn.ltd");
  }
}

function appendPath(baseUrl: string, path: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  if (normalized.endsWith("/v1")) return `${normalized}${path.replace(/^\/v1/, "")}`;
  return `${normalized}${path}`;
}

function resolveApiProfile(profile?: ApiProfile) {
  const videoModels = Array.isArray(profile?.videoModels) ? profile.videoModels.map(item => item.trim()).filter(Boolean) : [];
  return {
    apiKey: profile?.apiKey?.trim() || process.env.SEEDANCE_API_KEY || "",
    baseUrl: normalizeBaseUrl(profile?.baseUrl),
    videoModels,
    model: profile?.model?.trim() || videoModels[0] || MODEL,
    name: profile?.name?.trim() || "默认 AIfastgate"
  };
}

function normalizeRatio(value?: string) {
  if (!value) return "9:16";
  return value.split(" ")[0];
}

function normalizeDuration(value?: number) {
  const duration = Number(value || 5);
  if (duration < 4) return 4;
  if (duration > 15) return 15;
  return duration;
}

function buildDurationControlledPrompt(prompt: string, duration: number) {
  const text = prompt.trim();
  if (text.includes("严格时长控制")) return text;
  return [
    `严格时长控制：生成一个完整连续的 ${duration}秒 视频。`,
    text,
    `多场景要求：如果提示词包含“场景1/2、场景2/2”或多个段落，请把它们理解为同一个 ${duration}秒 视频内部的连续场景变化，不要拆成多个独立视频。`,
    `节奏要求：所有场景、动作、表情、镜头运动和停顿必须共同铺满 ${duration}秒，不要提前结束，不要把每个场景单独压缩成 3 秒。`,
    "结构要求：只生成一个完整视频，禁止自动分割、禁止输出多个片段、禁止新增无关剧情或字幕。"
  ].join("\n");
}

function normalizeMedia(items: MediaInput[] | undefined, limit: number, type: "image" | "video" | "audio") {
  return (items || [])
    .filter(item => item.url.trim())
    .slice(0, limit)
    .map(item => {
      if (type === "image") return { type: "image_url", image_url: { url: item.url.trim() }, role: item.role || "reference_image" };
      if (type === "video") return { type: "video_url", video_url: { url: item.url.trim() }, role: item.role || "reference_video" };
      return { type: "audio_url", audio_url: { url: item.url.trim() }, role: item.role || "reference_audio" };
    });
}

function normalizeMediaUrls(items: MediaInput[] | undefined, limit: number) {
  return (items || []).map(item => item.url.trim()).filter(Boolean).slice(0, limit);
}

function validateMediaUrl(url: string) {
  if (url.length > MAX_MEDIA_URL_LENGTH) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractTaskId(result: FastGateTaskResponse) {
  return result.task_id || result.data?.task_id || result.id || result.data?.id;
}

function extractError(result: FastGateTaskResponse) {
  if (typeof result.error === "string") return result.error;
  return result.error?.message || result.message || "创建 Seedance 任务失败";
}

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const route = await resolveModelRoute("video");
  const { apiKey, baseUrl } = resolveApiProfile(route?.profile);

  if (!apiKey) {
    return NextResponse.json(
      { code: 500, message: "缺少视频生成 API Key，请先在 .env.local 或管理员 API Profile 中配置。" },
      { status: 500 }
    );
  }

  const listEndpoint = baseUrl.includes("/api/v3") ? `${baseUrl}/contents/generations/tasks` : isZJProvider(baseUrl) ? appendPath(baseUrl, "/v1/videos/generations") : `${baseUrl}/v1/video/generations`;
  const response = await fetchWithTimeout(listEndpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  }, 30000);

  const text = await response.text();
  const result = text ? JSON.parse(text) as FastGateListResponse : {};

  if (!response.ok) {
    return NextResponse.json(
      {
        code: response.status,
        message: "读取后台视频任务列表失败",
        raw: result
      },
      { status: response.status }
    );
  }

  const items = result.data || result.items || [];
  return NextResponse.json({
    code: 0,
    data: items.map(item => ({
      task_id: item.id,
      status: item.status,
      video_url: item.video_url || item.url || item.content?.video_url || item.content?.url || item.data?.[0]?.video_url || item.data?.[0]?.url,
      prompt: item.prompt,
      created_at: item.created_at,
      error: typeof item.error === "string" ? item.error : item.error?.message
    }))
  });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `video:create:${membership.userId}`, limit: 90, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const body = await request.json() as GenerateVideoPayload;
  const route = await resolveModelRoute("video", body.model_id);
  if (body.model_id && !route) {
    return NextResponse.json({ code: 400, message: "当前没有启用的渠道支持所选视频模型，请在模型渠道管理中补充后重试。" }, { status: 400 });
  }
  const { apiKey, baseUrl, model, name } = resolveApiProfile(route?.profile);
  const requestedModel = body.model_id?.trim() || route?.model || model;

  if (!apiKey) {
    return NextResponse.json(
      { code: 500, message: "缺少视频生成 API Key，请先在 .env.local 或管理员 API Profile 中配置。" },
      { status: 500 }
    );
  }

  const shot = body.shot;

  if (!shot?.prompt) {
    return NextResponse.json(
      { code: 400, message: "缺少分镜 prompt，无法创建视频生成任务。" },
      { status: 400 }
    );
  }
  const duration = normalizeDuration(shot.duration);
  const prompt = buildDurationControlledPrompt(shot.prompt, duration);
  if (prompt.length > MAX_VIDEO_PROMPT_LENGTH) {
    return NextResponse.json({ code: 400, message: `视频提示词最多 ${MAX_VIDEO_PROMPT_LENGTH} 字，请精简后再生成。` }, { status: 400 });
  }

  const imageUrls = normalizeMediaUrls(body.images, 9);
  const videoUrls = normalizeMediaUrls(body.videos, 3);
  const audioUrls = normalizeMediaUrls(body.audios, 3);
  if (![...imageUrls, ...videoUrls, ...audioUrls].every(validateMediaUrl)) {
    return NextResponse.json({ code: 400, message: "参考素材必须是可访问的 http/https URL。" }, { status: 400 });
  }
  if (body.input_type === "first_last_frame" && imageUrls.length < 2) {
    return NextResponse.json({ code: 400, message: "首尾帧生成需要同时提供首帧和尾帧图片。" }, { status: 400 });
  }
  const payloadImageUrls = body.input_type === "first_last_frame" ? imageUrls.slice(0, 2) : imageUrls;
  const content = [
    { type: "text", text: prompt },
    ...normalizeMedia(body.input_type === "first_last_frame" ? body.images?.slice(0, 2) : body.images, 9, "image"),
    ...normalizeMedia(body.videos, 3, "video"),
    ...normalizeMedia(body.audios, 3, "audio")
  ];

  const inputType = imageUrls.length || videoUrls.length || audioUrls.length ? body.input_type || "reference" : "text_to_video";
  const payload = isZJProvider(baseUrl) ? {
    model: requestedModel,
    prompt,
    input_type: inputType,
    images: payloadImageUrls,
    videos: videoUrls,
    audios: audioUrls,
    ratio: normalizeRatio(shot.ratio),
    duration,
    resolution: body.resolution || "720p",
    metadata: {
      draft: false,
      generate_audio: body.generate_audio ?? true,
      watermark: body.watermark ?? false
    }
  } : {
    model: requestedModel,
    prompt,
    content,
    ratio: normalizeRatio(shot.ratio),
    duration,
    resolution: body.resolution || "720p",
    generate_audio: body.generate_audio ?? true,
    watermark: body.watermark ?? false
  };

  const endpoint = baseUrl.includes("/api/v3") ? `${baseUrl}/contents/generations/tasks` : isZJProvider(baseUrl) ? appendPath(baseUrl, "/v1/videos/generations") : `${baseUrl}/v1/video/generations`;

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    }, 60000);
  } catch (error) {
    await logAudit({
      request,
      actor: membership,
      action: "video_task.create",
      targetType: "video_task",
      result: "failure",
      metadata: { model: requestedModel, provider: name, message: error instanceof Error ? error.message : "视频生成上游请求失败。" }
    });
    return NextResponse.json({ code: 504, message: error instanceof Error ? error.message : "视频生成上游请求失败。" }, { status: 504 });
  }

  const text = await response.text();
  let result: FastGateTaskResponse = {};
  try { result = text ? JSON.parse(text) as FastGateTaskResponse : {}; } catch { result = { message: text }; }
  const taskId = extractTaskId(result);

  if (!response.ok || !taskId) {
    await logAudit({
      request,
      actor: membership,
      action: "video_task.create",
      targetType: "video_task",
      result: "failure",
      metadata: { model: requestedModel, provider: name, status: response.status, message: extractError(result) }
    });
    return NextResponse.json(
      {
        code: response.status,
        message: extractError(result),
        raw: result
      },
      { status: response.ok ? 400 : response.status }
    );
  }

  await logAudit({
    request,
    actor: membership,
    action: "video_task.create",
    targetType: "video_task",
    targetId: taskId,
    metadata: {
      model: requestedModel,
      provider: name,
      profileId: route?.profile.id,
      resolution: body.resolution || "720p",
      inputType,
      imageCount: imageUrls.length,
      videoCount: videoUrls.length,
      audioCount: audioUrls.length
    }
  });

  return NextResponse.json({
    code: 0,
    data: {
      task_id: taskId,
      provider: name,
      api_profile: route?.profile ? toPublicProfile(route.profile) : undefined,
      base_url: baseUrl,
      model: requestedModel,
      status: result.status || result.data?.status || "pending",
      input: payload,
      created_at: new Date().toISOString()
    }
  });
}
