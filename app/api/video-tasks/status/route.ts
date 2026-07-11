import { NextResponse } from "next/server";
import { databaseInt } from "@/lib/api-input";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { fetchWithTimeout } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicVideoTask, VideoTaskRecord } from "@/lib/video-task";
import { normalizeVideoStatus, videoStatusEndpoints } from "@/lib/providers/video";
import { resolveVideoApiProfile } from "@/lib/video-generation";
import { extractVideoError, extractVideoUrl, upstreamHost, VideoStatusResponse } from "@/lib/video-status";
import { readServerApiProfiles } from "../../api-profiles/store";

type StatusPayload = {
  project_id?: number;
  internal_task_id?: string;
  task_id?: string;
  profile_id?: string;
};

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://api.aifastgate.com";

async function persistTaskStatus(task: VideoTaskRecord, params: { status: string; rawStatus?: string; videoUrl?: string; error?: string }) {
  const taskStatus = params.status === "succeeded" ? "done" : params.status === "failed" ? "failed" : "running";
  const result = taskStatus === "done"
    ? "已生成，可预览下载"
    : taskStatus === "failed"
      ? params.error || "视频生成失败"
      : `生成中：${params.rawStatus || params.status || "pending"}`;
  return prisma.$transaction(async tx => {
    const updated = await tx.videoTask.update({
      where: { tenantId_projectId_id: { tenantId: task.tenantId, projectId: task.projectId, id: task.id } },
      data: {
        status: taskStatus,
        result,
        videoUrl: params.videoUrl || task.videoUrl,
        error: taskStatus === "failed" ? params.error || result : null,
        completedAt: taskStatus === "done" || taskStatus === "failed" ? task.completedAt || new Date() : null
      }
    });
    await tx.shot.updateMany({
      where: { tenantId: task.tenantId, projectId: task.projectId, id: task.shotId },
      data: { status: taskStatus }
    });
    if (taskStatus === "done" && params.videoUrl) {
      const existingAsset = task.providerTaskId
        ? await tx.videoAsset.findFirst({ where: { tenantId: task.tenantId, projectId: task.projectId, providerTaskId: task.providerTaskId } })
        : null;
      const snapshot = task.snapshot && typeof task.snapshot === "object" && !Array.isArray(task.snapshot)
        ? task.snapshot as Record<string, unknown>
        : {};
      const assetData = {
        shotId: task.shotId,
        title: `${task.shotTitle} · 可用片段`,
        meta: `${Number(snapshot.duration || 0) || "-"}秒 / ${String(snapshot.ratio || "-").split(" ")[0]}`,
        gradient: "linear-gradient(135deg, #1f2937, #111827)",
        videoUrl: params.videoUrl,
        providerTaskId: task.providerTaskId
      };
      if (existingAsset) {
        await tx.videoAsset.update({
          where: { tenantId_projectId_id: { tenantId: task.tenantId, projectId: task.projectId, id: existingAsset.id } },
          data: assetData
        });
      } else {
        await tx.videoAsset.create({
          data: { tenantId: task.tenantId, projectId: task.projectId, ...assetData }
        });
      }
    }
    return updated;
  });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `video:status:${membership.userId}`, limit: 240, windowMs: 60 * 1000 });
  if (limited) return limited;

  const body = await request.json() as StatusPayload;
  const projectId = databaseInt(body.project_id);
  const internalTaskId = body.internal_task_id?.trim();
  let persistedTask: VideoTaskRecord | null = null;
  if (internalTaskId) {
    if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
    persistedTask = await prisma.videoTask.findUnique({
      where: { tenantId_projectId_id: { tenantId: membership.tenantId, projectId, id: internalTaskId } }
    });
    if (!persistedTask) return NextResponse.json({ code: 404, message: "生成任务不存在或已被删除。" }, { status: 404 });
    if (persistedTask.status === "done" && persistedTask.videoUrl) {
      return NextResponse.json({ code: 0, data: { task_id: persistedTask.providerTaskId, status: "succeeded", video_url: persistedTask.videoUrl, task: publicVideoTask(persistedTask) } });
    }
  }

  const upstreamTaskId = persistedTask?.providerTaskId || body.task_id?.trim();
  const profileId = persistedTask?.apiProfileId || body.profile_id?.trim();
  const profiles = profileId ? await readServerApiProfiles() : [];
  const serverProfile = profileId ? profiles.find(profile => profile.id === profileId) : undefined;
  if (profileId && !serverProfile) return NextResponse.json({ code: 404, message: "这条任务使用的模型渠道已不存在，请联系管理员。" }, { status: 404 });
  const { apiKey, baseUrl } = resolveVideoApiProfile(serverProfile, { baseUrl: BASE_URL, model: "", name: "" });

  if (!apiKey) {
    return NextResponse.json(
      { code: 500, message: "缺少视频生成 API Key，请先在 .env.local 或管理员 API Profile 中配置。" },
      { status: 500 }
    );
  }

  if (!upstreamTaskId) {
    return NextResponse.json(
      { code: 400, message: "这条任务缺少上游任务 ID，无法同步状态。" },
      { status: 400 }
    );
  }

  const endpoints = videoStatusEndpoints(baseUrl, upstreamTaskId);

  let response: Response | null = null;
  let text = "";
  try {
    for (const endpoint of endpoints) {
      response = await fetchWithTimeout(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        }
      }, 30000);
      text = await response.text();
      if (response.ok || response.status !== 404) break;
    }
  } catch (error) {
    return NextResponse.json({ code: 504, message: error instanceof Error ? error.message : "查询视频任务状态失败。" }, { status: 504 });
  }

  const finalResponse = response;
  if (!finalResponse) {
    return NextResponse.json({ code: 500, message: "未能发起状态查询请求。" }, { status: 500 });
  }

  let result: VideoStatusResponse = {};
  try { result = text ? JSON.parse(text) as VideoStatusResponse : {}; } catch { result = { message: text }; }
  const matchedItem = result.items?.find(item => item.id === upstreamTaskId || item.task_id === upstreamTaskId);
  const matchedResult = matchedItem ? { ...matchedItem } as VideoStatusResponse : result;
  const dataObject = Array.isArray(matchedResult.data) ? undefined : matchedResult.data;
  const rawStatus = matchedResult.status || matchedResult.task_status || dataObject?.status || dataObject?.task_status || matchedResult.result?.status || dataObject?.result?.status;
  const videoUrl = extractVideoUrl(matchedResult);
  const extractedError = extractVideoError(matchedResult);
  const normalizedStatus = videoUrl ? "succeeded" : extractedError ? "failed" : normalizeVideoStatus(rawStatus);
  if (normalizedStatus === "failed") {
    await logAudit({
      request,
      actor: membership,
      action: "video_task.status",
      targetType: "video_task",
      targetId: upstreamTaskId,
      result: "failure",
      metadata: {
        status: rawStatus || normalizedStatus,
        message: extractedError,
        profileId,
        upstreamHost: upstreamHost(baseUrl)
      }
    });
  }

  if (!finalResponse.ok) {
    if (finalResponse.status === 404) {
      const updatedTask = persistedTask ? await persistTaskStatus(persistedTask, { status: "pending", rawStatus: "pending" }) : undefined;
      return NextResponse.json({
        code: 0,
        data: {
          task_id: upstreamTaskId,
          status: "pending",
          error: extractVideoError(result) || "上游任务状态暂未可查，继续等待同步。",
          task: updatedTask ? publicVideoTask(updatedTask) : undefined
        }
      });
    }
    if (persistedTask) await persistTaskStatus(persistedTask, { status: "pending", rawStatus: rawStatus || `http_${finalResponse.status}` });
    return NextResponse.json(
      {
        code: finalResponse.status,
        message: extractVideoError(result) || "查询 Seedance 任务状态失败"
      },
      { status: finalResponse.status }
    );
  }

  const updatedTask = persistedTask
    ? await persistTaskStatus(persistedTask, { status: normalizedStatus, rawStatus, videoUrl, error: extractedError })
    : undefined;

  return NextResponse.json({
    code: 0,
    data: {
      task_id: matchedResult.id || matchedResult.task_id || dataObject?.id || dataObject?.task_id || upstreamTaskId,
      status: normalizedStatus,
      video_url: videoUrl,
      error: extractedError,
      task: updatedTask ? publicVideoTask(updatedTask) : undefined
    }
  });
}
