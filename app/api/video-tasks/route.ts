import { NextResponse } from "next/server";
import { resolveModelRoute, toPublicProfile } from "../api-profiles/store";

type MediaInput = {
  url: string;
  role?: string;
};

type ApiProfile = { id?: string; name?: string; baseUrl?: string; apiKey?: string; model?: string; videoModels?: string[] };

type GenerateVideoPayload = {
  profile_id?: string;
  api_profile?: ApiProfile;
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

function parseProfileParam(request: Request) {
  const profile = new URL(request.url).searchParams.get("profile");
  if (!profile) return undefined;
  try { return JSON.parse(profile) as ApiProfile; } catch { return undefined; }
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

function extractTaskId(result: FastGateTaskResponse) {
  return result.task_id || result.data?.task_id || result.id || result.data?.id;
}

function extractError(result: FastGateTaskResponse) {
  if (typeof result.error === "string") return result.error;
  return result.error?.message || result.message || "创建 Seedance 任务失败";
}

export async function GET(request: Request) {
  const { apiKey, baseUrl } = resolveApiProfile(parseProfileParam(request));

  if (!apiKey) {
    return NextResponse.json(
      { code: 500, message: "缺少视频生成 API Key，请先在 .env.local 或管理员 API Profile 中配置。" },
      { status: 500 }
    );
  }

  const listEndpoint = baseUrl.includes("/api/v3") ? `${baseUrl}/contents/generations/tasks` : isZJProvider(baseUrl) ? appendPath(baseUrl, "/v1/videos/generations") : `${baseUrl}/v1/video/generations`;
  const response = await fetch(listEndpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

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
  const body = await request.json() as GenerateVideoPayload;
  const route = await resolveModelRoute("video", body.model_id);
  if (body.model_id && !route) {
    return NextResponse.json({ code: 400, message: "当前没有启用的渠道支持所选视频模型，请在模型渠道管理中补充后重试。" }, { status: 400 });
  }
  const { apiKey, baseUrl, model, name } = resolveApiProfile(route?.profile || body.api_profile);
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

  const imageUrls = normalizeMediaUrls(body.images, 9);
  const videoUrls = normalizeMediaUrls(body.videos, 3);
  const audioUrls = normalizeMediaUrls(body.audios, 3);
  const content = [
    { type: "text", text: shot.prompt },
    ...normalizeMedia(body.images, 9, "image"),
    ...normalizeMedia(body.videos, 3, "video"),
    ...normalizeMedia(body.audios, 3, "audio")
  ];

  const inputType = imageUrls.length || videoUrls.length || audioUrls.length ? body.input_type || "reference" : "text_to_video";
  const payload = isZJProvider(baseUrl) ? {
    model: requestedModel,
    prompt: shot.prompt,
    input_type: inputType,
    images: imageUrls,
    videos: videoUrls,
    audios: audioUrls,
    ratio: normalizeRatio(shot.ratio),
    duration: normalizeDuration(shot.duration),
    resolution: body.resolution || "720p",
    metadata: {
      draft: false,
      generate_audio: body.generate_audio ?? true,
      watermark: body.watermark ?? false
    }
  } : {
    model: requestedModel,
    prompt: shot.prompt,
    content,
    ratio: normalizeRatio(shot.ratio),
    duration: normalizeDuration(shot.duration),
    resolution: body.resolution || "720p",
    generate_audio: body.generate_audio ?? true,
    watermark: body.watermark ?? false
  };

  const endpoint = baseUrl.includes("/api/v3") ? `${baseUrl}/contents/generations/tasks` : isZJProvider(baseUrl) ? appendPath(baseUrl, "/v1/videos/generations") : `${baseUrl}/v1/video/generations`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let result: FastGateTaskResponse = {};
  try { result = text ? JSON.parse(text) as FastGateTaskResponse : {}; } catch { result = { message: text }; }
  const taskId = extractTaskId(result);

  if (!response.ok || !taskId) {
    return NextResponse.json(
      {
        code: response.status,
        message: extractError(result),
        raw: result
      },
      { status: response.ok ? 400 : response.status }
    );
  }

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
