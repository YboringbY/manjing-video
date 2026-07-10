import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { fetchWithTimeout } from "@/lib/http";
import { isSmallReferenceImage, MIN_VIDEO_REFERENCE_IMAGE_SIDE, readLocalUploadImageDimensions } from "@/lib/image-dimensions";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicVideoTask } from "@/lib/video-task";
import { resolveModelRoute } from "../api-profiles/store";

type MediaInput = {
  url: string;
  role?: string;
};

type ApiProfile = { id?: string; name?: string; baseUrl?: string; apiKey?: string; model?: string; videoModels?: string[] };

type GenerateVideoPayload = {
  project_id?: number;
  profile_id?: string;
  model_id?: string;
  snapshot?: Record<string, unknown>;
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
const MAX_DATABASE_INT = 2147483647;

function cleanProjectId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT ? number : 0;
}

function cleanShotId(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? BigInt(number) : null;
}

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

async function findSmallLocalReferenceImages(urls: string[]) {
  const checked = await Promise.all(urls.map(async url => ({ url, dimensions: await readLocalUploadImageDimensions(url) })));
  return checked.filter(item => isSmallReferenceImage(item.dimensions));
}

function extractTaskId(result: FastGateTaskResponse) {
  return result.task_id || result.data?.task_id || result.id || result.data?.id;
}

function extractError(result: FastGateTaskResponse) {
  if (typeof result.error === "string") return result.error;
  return result.error?.message || result.message || "创建 Seedance 任务失败";
}

function videoAuditMetadata(params: {
  model: string;
  provider: string;
  profileId?: string;
  duration?: number;
  ratio?: string;
  resolution?: string;
  inputType?: string;
  imageCount?: number;
  videoCount?: number;
  audioCount?: number;
  promptLength?: number;
  status?: number;
  message?: string;
}) {
  return {
    model: params.model,
    provider: params.provider,
    profileId: params.profileId,
    duration: params.duration,
    ratio: params.ratio,
    resolution: params.resolution,
    inputType: params.inputType,
    imageCount: params.imageCount,
    videoCount: params.videoCount,
    audioCount: params.audioCount,
    promptLength: params.promptLength,
    status: params.status,
    message: params.message
  };
}

async function failPersistedTask(params: { tenantId: string; projectId: number; taskId: string; shotId: bigint; message: string }) {
  return prisma.$transaction(async tx => {
    const task = await tx.videoTask.update({
      where: { tenantId_projectId_id: { tenantId: params.tenantId, projectId: params.projectId, id: params.taskId } },
      data: { status: "failed", result: params.message, error: params.message, completedAt: new Date() }
    });
    await tx.shot.updateMany({
      where: { tenantId: params.tenantId, projectId: params.projectId, id: params.shotId },
      data: { status: "failed" }
    });
    return task;
  });
}

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const projectId = cleanProjectId(searchParams.get("project_id"));
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });

  const tasks = await prisma.videoTask.findMany({
    where: { tenantId: membership.tenantId, projectId },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return NextResponse.json({ code: 0, data: tasks.map(publicVideoTask) });
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
  const projectId = cleanProjectId(body.project_id);
  const shotId = cleanShotId(shot.id);
  if (!projectId || !shotId) {
    return NextResponse.json({ code: 400, message: "缺少有效的项目或分镜 ID。" }, { status: 400 });
  }
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: membership.tenantId } });
  if (!project) {
    return NextResponse.json({ code: 404, message: "当前项目尚未同步到服务器，请稍后重试。" }, { status: 404 });
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
  const inputType = imageUrls.length || videoUrls.length || audioUrls.length ? body.input_type || "reference" : "text_to_video";
  const smallReferenceImages = await findSmallLocalReferenceImages(imageUrls);
  if (smallReferenceImages.length) {
    const details = smallReferenceImages.map(item => `${item.dimensions?.width}x${item.dimensions?.height}`).join("、");
    const message = `参考图片尺寸过小（${details}）。视频参考图要求宽高都至少 ${MIN_VIDEO_REFERENCE_IMAGE_SIDE}px，请上传更高清图片后再生成。`;
    await logAudit({
      request,
      actor: membership,
      action: "video_task.create",
      targetType: "video_task",
      result: "blocked",
      metadata: videoAuditMetadata({ model: requestedModel, provider: name, profileId: route?.profile.id, duration, ratio: normalizeRatio(shot.ratio), resolution: body.resolution || "720p", inputType, imageCount: imageUrls.length, videoCount: videoUrls.length, audioCount: audioUrls.length, promptLength: prompt.length, message })
    });
    return NextResponse.json({ code: 400, message }, { status: 400 });
  }
  const payloadImageUrls = body.input_type === "first_last_frame" ? imageUrls.slice(0, 2) : imageUrls;
  const content = [
    { type: "text", text: prompt },
    ...normalizeMedia(body.input_type === "first_last_frame" ? body.images?.slice(0, 2) : body.images, 9, "image"),
    ...normalizeMedia(body.videos, 3, "video"),
    ...normalizeMedia(body.audios, 3, "audio")
  ];

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

  const internalTaskId = randomUUID();
  const snapshot = body.snapshot && typeof body.snapshot === "object" && !Array.isArray(body.snapshot)
    ? body.snapshot as Prisma.InputJsonObject
    : {
        prompt: shot.prompt,
        model: requestedModel,
        ratio: shot.ratio || "9:16 竖屏短剧",
        duration,
        resolution: body.resolution || "720p",
        materialIds: [],
        externalAssetIds: [],
        inputType
      };
  await prisma.$transaction(async tx => {
    await tx.shot.upsert({
      where: { tenantId_projectId_id: { tenantId: membership.tenantId, projectId, id: shotId } },
      create: {
        tenantId: membership.tenantId,
        projectId,
        id: shotId,
        title: shot.title?.trim() || "未命名视频",
        prompt: String(snapshot.prompt || shot.prompt),
        ratio: shot.ratio?.trim() || "9:16 竖屏短剧",
        duration,
        status: "running",
        resolution: body.resolution || "720p"
      },
      update: { status: "running" }
    });
    await tx.videoTask.create({
      data: {
        id: internalTaskId,
        tenantId: membership.tenantId,
        projectId,
        shotId,
        shotTitle: shot.title?.trim() || "未命名视频",
        provider: name,
        status: "pending",
        result: "正在提交生成任务。",
        apiProfileId: route?.profile.id,
        snapshot
      }
    });
  });

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
    const message = error instanceof Error ? error.message : "视频生成上游请求失败。";
    const failedTask = await failPersistedTask({ tenantId: membership.tenantId, projectId, taskId: internalTaskId, shotId, message });
    await logAudit({
      request,
      actor: membership,
      action: "video_task.create",
      targetType: "video_task",
      result: "failure",
      metadata: videoAuditMetadata({ model: requestedModel, provider: name, profileId: route?.profile.id, duration, ratio: normalizeRatio(shot.ratio), resolution: body.resolution || "720p", inputType, imageCount: imageUrls.length, videoCount: videoUrls.length, audioCount: audioUrls.length, promptLength: prompt.length, message })
    });
    return NextResponse.json({ code: 504, message, data: { task: publicVideoTask(failedTask) } }, { status: 504 });
  }

  const text = await response.text();
  let result: FastGateTaskResponse = {};
  try { result = text ? JSON.parse(text) as FastGateTaskResponse : {}; } catch { result = { message: text }; }
  const taskId = extractTaskId(result);

  if (!response.ok || !taskId) {
    const message = extractError(result);
    const failedTask = await failPersistedTask({ tenantId: membership.tenantId, projectId, taskId: internalTaskId, shotId, message });
    await logAudit({
      request,
      actor: membership,
      action: "video_task.create",
      targetType: "video_task",
      result: "failure",
      metadata: videoAuditMetadata({ model: requestedModel, provider: name, profileId: route?.profile.id, duration, ratio: normalizeRatio(shot.ratio), resolution: body.resolution || "720p", inputType, imageCount: imageUrls.length, videoCount: videoUrls.length, audioCount: audioUrls.length, promptLength: prompt.length, status: response.status, message })
    });
    return NextResponse.json(
      {
        code: response.ok ? 400 : response.status,
        message,
        data: { task: publicVideoTask(failedTask) }
      },
      { status: response.ok ? 400 : response.status }
    );
  }

  const persistedTask = await prisma.videoTask.update({
    where: { tenantId_projectId_id: { tenantId: membership.tenantId, projectId, id: internalTaskId } },
    data: {
      providerTaskId: taskId,
      status: "running",
      result: `任务已提交：${taskId}`,
      error: null
    }
  });

  await logAudit({
    request,
    actor: membership,
    action: "video_task.create",
    targetType: "video_task",
    targetId: taskId,
    metadata: {
      ...videoAuditMetadata({ model: requestedModel, provider: name, profileId: route?.profile.id, duration, ratio: normalizeRatio(shot.ratio), resolution: body.resolution || "720p", inputType, imageCount: imageUrls.length, videoCount: videoUrls.length, audioCount: audioUrls.length, promptLength: prompt.length })
    }
  });

  return NextResponse.json({
    code: 0,
    data: {
      task_id: taskId,
      internal_task_id: internalTaskId,
      provider: name,
      profile_id: route?.profile.id,
      model: requestedModel,
      status: result.status || result.data?.status || "pending",
      task: publicVideoTask(persistedTask),
      created_at: new Date().toISOString()
    }
  });
}

export async function DELETE(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = cleanProjectId(searchParams.get("project_id"));
  const taskId = searchParams.get("task_id")?.trim();
  const shotId = cleanShotId(searchParams.get("shot_id"));
  if (!projectId || (!taskId && !shotId)) {
    return NextResponse.json({ code: 400, message: "缺少项目 ID 和任务/分镜 ID。" }, { status: 400 });
  }

  if (taskId) {
    const task = await prisma.videoTask.findUnique({
      where: { tenantId_projectId_id: { tenantId: membership.tenantId, projectId, id: taskId } }
    });
    if (!task) return NextResponse.json({ code: 0, data: { deleted: false } });
    if (["pending", "running"].includes(task.status)) {
      return NextResponse.json({ code: 409, message: "生成中的任务不能删除，请等待完成或失败后再处理。" }, { status: 409 });
    }
    await prisma.$transaction(async tx => {
      if (task.providerTaskId) {
        await tx.videoAsset.deleteMany({ where: { tenantId: membership.tenantId, projectId, providerTaskId: task.providerTaskId } });
      }
      await tx.videoTask.delete({ where: { tenantId_projectId_id: { tenantId: membership.tenantId, projectId, id: taskId } } });
      const remaining = await tx.videoTask.count({ where: { tenantId: membership.tenantId, projectId, shotId: task.shotId } });
      if (!remaining) {
        await tx.shot.updateMany({ where: { tenantId: membership.tenantId, projectId, id: task.shotId }, data: { status: "pending" } });
      }
    });
    await logAudit({ request, actor: membership, action: "video_task.delete", targetType: "video_task", targetId: task.id, metadata: { projectId, shotId: task.shotId.toString(), providerTaskId: task.providerTaskId } });
    return NextResponse.json({ code: 0, data: { deleted: true } });
  }

  const tasks = await prisma.videoTask.findMany({ where: { tenantId: membership.tenantId, projectId, shotId: shotId! } });
  if (tasks.some(task => ["pending", "running"].includes(task.status))) {
    return NextResponse.json({ code: 409, message: "这条分镜仍有生成中的任务，暂时不能删除。" }, { status: 409 });
  }
  await prisma.$transaction(async tx => {
    await tx.videoTask.deleteMany({ where: { tenantId: membership.tenantId, projectId, shotId: shotId! } });
    await tx.videoAsset.deleteMany({ where: { tenantId: membership.tenantId, projectId, shotId: shotId! } });
  });
  await logAudit({ request, actor: membership, action: "video_task.delete_by_shot", targetType: "shot", targetId: shotId!.toString(), metadata: { projectId, deletedTasks: tasks.length } });
  return NextResponse.json({ code: 0, data: { deleted: true, deletedTasks: tasks.length } });
}
