import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { databaseInt, safeBigInt } from "@/lib/api-input";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { fetchWithTimeout } from "@/lib/http";
import { isSmallReferenceImage, MIN_VIDEO_REFERENCE_IMAGE_SIDE, readLocalUploadImageDimensions } from "@/lib/image-dimensions";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicVideoTask } from "@/lib/video-task";
import { isPublicMediaUrl } from "@/lib/media-url";
import { videoCreateEndpoint } from "@/lib/providers/video";
import { buildDurationControlledPrompt, buildVideoProviderPayload, createVideoError, CreateVideoResponse, extractCreatedTaskId, MediaInput, mediaUrls, normalizeVideoDuration, normalizeVideoRatio, resolveVideoApiProfile, videoAuditMetadata } from "@/lib/video-generation";
import { resolveModelRoute } from "../api-profiles/store";

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

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://api.aifastgate.com";
const MODEL = process.env.SEEDANCE_MODEL || "doubao-seedance-2.0-fast";
const MAX_VIDEO_PROMPT_LENGTH = 8000;

async function findSmallLocalReferenceImages(urls: string[]) {
  const checked = await Promise.all(urls.map(async url => ({ url, dimensions: await readLocalUploadImageDimensions(url) })));
  return checked.filter(item => isSmallReferenceImage(item.dimensions));
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
  const projectId = databaseInt(searchParams.get("project_id"));
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });

  const tasks = await prisma.videoTask.findMany({
    where: { tenantId: membership.tenantId, projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
  const rejectRequest = async (message: string, status = 400, result: "blocked" | "failure" = "blocked") => {
    await logAudit({
      request,
      actor: membership,
      action: "video_task.create",
      targetType: "video_task",
      result,
      metadata: {
        stage: "validation",
        model: body.model_id?.trim(),
        projectId: body.project_id,
        shotId: body.shot?.id,
        promptLength: body.shot?.prompt?.length || 0,
        imageCount: body.images?.length || 0,
        videoCount: body.videos?.length || 0,
        audioCount: body.audios?.length || 0,
        message
      }
    });
    return NextResponse.json({ code: status, message }, { status });
  };
  const route = await resolveModelRoute("video", body.model_id);
  if (body.model_id && !route) {
    return rejectRequest("当前没有启用的渠道支持所选视频模型，请在模型渠道管理中补充后重试。");
  }
  const { apiKey, baseUrl, model, name } = resolveVideoApiProfile(route?.profile, { baseUrl: BASE_URL, model: MODEL, name: "默认 AIfastgate" });
  const requestedModel = body.model_id?.trim() || route?.model || model;

  if (!apiKey) {
    return rejectRequest("缺少视频生成 API Key，请先在管理员模型渠道中配置。", 500, "failure");
  }

  const shot = body.shot;

  if (!shot?.prompt) {
    return rejectRequest("缺少分镜提示词，无法创建视频生成任务。");
  }
  const projectId = databaseInt(body.project_id);
  const shotId = safeBigInt(shot.id);
  if (!projectId || !shotId) {
    return rejectRequest("缺少有效的项目或分镜 ID。");
  }
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: membership.tenantId } });
  if (!project) {
    return rejectRequest("当前项目尚未同步到服务器，请稍后重试。", 404);
  }
  const duration = normalizeVideoDuration(shot.duration);
  const prompt = buildDurationControlledPrompt(shot.prompt, duration);
  if (prompt.length > MAX_VIDEO_PROMPT_LENGTH) {
    return rejectRequest(`视频提示词最多 ${MAX_VIDEO_PROMPT_LENGTH} 字，请精简后再生成。`);
  }

  const imageUrls = mediaUrls(body.images, 9);
  const videoUrls = mediaUrls(body.videos, 3);
  const audioUrls = mediaUrls(body.audios, 3);
  if (![...imageUrls, ...videoUrls, ...audioUrls].every(isPublicMediaUrl)) {
    return rejectRequest("参考素材必须使用上游可访问的公网 http/https URL；本机、局域网或相对路径不能用于生成。");
  }
  if (body.input_type === "first_last_frame" && imageUrls.length < 2) {
    return rejectRequest("首尾帧生成需要同时提供首帧和尾帧图片。");
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
      metadata: videoAuditMetadata({ model: requestedModel, provider: name, profileId: route?.profile.id, duration, ratio: normalizeVideoRatio(shot.ratio), resolution: body.resolution || "720p", inputType, imageCount: imageUrls.length, videoCount: videoUrls.length, audioCount: audioUrls.length, promptLength: prompt.length, message })
    });
    return NextResponse.json({ code: 400, message }, { status: 400 });
  }
  const payload = buildVideoProviderPayload({ baseUrl, model: requestedModel, prompt, inputType, ratio: shot.ratio, duration, resolution: body.resolution || "720p", generateAudio: body.generate_audio, watermark: body.watermark, images: body.images, videos: body.videos, audios: body.audios });

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

  const endpoint = videoCreateEndpoint(baseUrl);

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
      metadata: videoAuditMetadata({ model: requestedModel, provider: name, profileId: route?.profile.id, duration, ratio: normalizeVideoRatio(shot.ratio), resolution: body.resolution || "720p", inputType, imageCount: imageUrls.length, videoCount: videoUrls.length, audioCount: audioUrls.length, promptLength: prompt.length, message })
    });
    return NextResponse.json({ code: 504, message, data: { task: publicVideoTask(failedTask) } }, { status: 504 });
  }

  const text = await response.text();
  let result: CreateVideoResponse = {};
  try { result = text ? JSON.parse(text) as CreateVideoResponse : {}; } catch { result = { message: text }; }
  const taskId = extractCreatedTaskId(result);

  if (!response.ok || !taskId) {
    const message = createVideoError(result);
    const failedTask = await failPersistedTask({ tenantId: membership.tenantId, projectId, taskId: internalTaskId, shotId, message });
    await logAudit({
      request,
      actor: membership,
      action: "video_task.create",
      targetType: "video_task",
      result: "failure",
      metadata: videoAuditMetadata({ model: requestedModel, provider: name, profileId: route?.profile.id, duration, ratio: normalizeVideoRatio(shot.ratio), resolution: body.resolution || "720p", inputType, imageCount: imageUrls.length, videoCount: videoUrls.length, audioCount: audioUrls.length, promptLength: prompt.length, status: response.status, message })
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
      ...videoAuditMetadata({ model: requestedModel, provider: name, profileId: route?.profile.id, duration, ratio: normalizeVideoRatio(shot.ratio), resolution: body.resolution || "720p", inputType, imageCount: imageUrls.length, videoCount: videoUrls.length, audioCount: audioUrls.length, promptLength: prompt.length })
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
  const projectId = databaseInt(searchParams.get("project_id"));
  const taskId = searchParams.get("task_id")?.trim();
  const shotId = safeBigInt(searchParams.get("shot_id"));
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
