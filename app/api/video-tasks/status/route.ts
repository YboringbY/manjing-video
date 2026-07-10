import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { fetchWithTimeout } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicVideoTask, VideoTaskRecord } from "@/lib/video-task";
import { readServerApiProfiles } from "../../api-profiles/store";

type ApiProfile = { id?: string; name?: string; baseUrl?: string; apiKey?: string; model?: string };

type StatusPayload = {
  project_id?: number;
  internal_task_id?: string;
  task_id?: string;
  profile_id?: string;
};

type FastGateStatusResponse = {
  id?: string;
  task_id?: string;
  status?: string;
  task_status?: string;
  output?: string | string[] | { url?: string; video_url?: string };
  url?: string;
  video_url?: string;
  content?: { video_url?: string; url?: string };
  result?: { video_url?: string; url?: string; status?: string };
  error?: { message?: string } | string;
  message?: string;
  data?: {
    id?: string;
    task_id?: string;
    status?: string;
    task_status?: string;
    output?: string | string[] | { url?: string; video_url?: string };
    url?: string;
    video_url?: string;
    content?: { video_url?: string; url?: string };
    result?: { video_url?: string; url?: string; status?: string };
    error?: string;
  } | Array<{ url?: string; video_url?: string }>;
  items?: Array<{
    id?: string;
    task_id?: string;
    status?: string;
    task_status?: string;
    url?: string;
    video_url?: string;
    content?: { video_url?: string; url?: string };
    result?: { video_url?: string; url?: string; status?: string };
    error?: string | { message?: string };
  }>;
};

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://api.aifastgate.com";
const MAX_DATABASE_INT = 2147483647;

function cleanProjectId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT ? number : 0;
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
  return {
    apiKey: profile?.apiKey?.trim() || process.env.SEEDANCE_API_KEY || "",
    baseUrl: (profile?.baseUrl?.trim() || BASE_URL).replace(/\/$/, "")
  };
}

function normalizeStatus(value?: string) {
  const status = (value || "pending").toLowerCase();
  if (["succeeded", "success", "completed", "done"].includes(status)) return "succeeded";
  if (["failed", "error", "cancelled"].includes(status)) return "failed";
  if (["running", "processing", "in_progress"].includes(status)) return "running";
  return "pending";
}

function isHttpUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function failedOutputMessage(value?: string) {
  const text = value?.trim();
  if (!text || isHttpUrl(text)) return "";
  if (/fail|error|cancel|invalid|quota|insufficient|not enough/i.test(text)) return text;
  return "";
}

function extractVideoUrl(result: FastGateStatusResponse) {
  const dataObject = Array.isArray(result.data) ? undefined : result.data;
  const dataItem = Array.isArray(result.data) ? result.data[0] : undefined;
  const output = result.output || dataObject?.output;
  const outputObject = typeof output === "object" && !Array.isArray(output) ? output : undefined;
  const candidates = [
    typeof output === "string" ? output : undefined,
    Array.isArray(output) ? output[0] : undefined,
    outputObject?.video_url,
    outputObject?.url,
    result.video_url,
    dataObject?.video_url,
    dataItem?.video_url,
    result.url,
    dataObject?.url,
    dataItem?.url,
    result.content?.video_url,
    result.content?.url,
    dataObject?.content?.video_url,
    dataObject?.content?.url,
    result.result?.video_url,
    result.result?.url,
    dataObject?.result?.video_url,
    dataObject?.result?.url
  ];
  return candidates.find(isHttpUrl) || "";
}

function extractError(result: FastGateStatusResponse) {
  const dataObject = Array.isArray(result.data) ? undefined : result.data;
  const output = result.output || dataObject?.output;
  const outputText = typeof output === "string" ? output : Array.isArray(output) && typeof output[0] === "string" ? output[0] : "";
  const errorMessage = typeof result.error === "string" ? result.error : result.error?.message;
  const detailedMessage = result.message && result.message !== "task failed" ? result.message : undefined;
  const message = detailedMessage || dataObject?.error || errorMessage || result.message || failedOutputMessage(outputText);
  if (message?.includes("pre_consume_token_quota_failed") || message?.includes("token quota is not enough")) return "账户余额不足，当前额度不足以生成该视频，请充值后重试。";
  return message;
}

function upstreamHost(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

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
    return updated;
  });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `video:status:${membership.userId}`, limit: 240, windowMs: 60 * 1000 });
  if (limited) return limited;

  const body = await request.json() as StatusPayload;
  const projectId = cleanProjectId(body.project_id);
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
  const { apiKey, baseUrl } = resolveApiProfile(serverProfile);

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

  const endpoints = baseUrl.includes("/api/v3") ? [
    `${baseUrl}/contents/generations/tasks?page=1&page_size=500`,
    `${baseUrl}/contents/generations/tasks/${upstreamTaskId}`
  ] : isZJProvider(baseUrl) ? [
    appendPath(baseUrl, `/v1/videos/generations/${upstreamTaskId}`),
    appendPath(baseUrl, `/v1/video/generations/${upstreamTaskId}`)
  ] : [
    `${baseUrl}/v1/video/generations/${upstreamTaskId}`,
    `${baseUrl}/v1/tasks/${upstreamTaskId}`,
    `${baseUrl}/v1/video/tasks/${upstreamTaskId}`
  ];

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

  let result: FastGateStatusResponse = {};
  try { result = text ? JSON.parse(text) as FastGateStatusResponse : {}; } catch { result = { message: text }; }
  const matchedItem = result.items?.find(item => item.id === upstreamTaskId || item.task_id === upstreamTaskId);
  const matchedResult = matchedItem ? { ...matchedItem } as FastGateStatusResponse : result;
  const dataObject = Array.isArray(matchedResult.data) ? undefined : matchedResult.data;
  const rawStatus = matchedResult.status || matchedResult.task_status || dataObject?.status || dataObject?.task_status || matchedResult.result?.status || dataObject?.result?.status;
  const videoUrl = extractVideoUrl(matchedResult);
  const extractedError = extractError(matchedResult);
  const normalizedStatus = videoUrl ? "succeeded" : extractedError ? "failed" : normalizeStatus(rawStatus);
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
          error: extractError(result) || "上游任务状态暂未可查，继续等待同步。",
          task: updatedTask ? publicVideoTask(updatedTask) : undefined
        }
      });
    }
    if (persistedTask) await persistTaskStatus(persistedTask, { status: "pending", rawStatus: rawStatus || `http_${finalResponse.status}` });
    return NextResponse.json(
      {
        code: finalResponse.status,
        message: extractError(result) || "查询 Seedance 任务状态失败"
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
