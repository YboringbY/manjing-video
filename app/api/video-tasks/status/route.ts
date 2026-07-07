import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { readServerApiProfiles } from "../../api-profiles/store";

type ApiProfile = { id?: string; name?: string; baseUrl?: string; apiKey?: string; model?: string };

type StatusPayload = {
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

function extractVideoUrl(result: FastGateStatusResponse) {
  const dataObject = Array.isArray(result.data) ? undefined : result.data;
  const dataItem = Array.isArray(result.data) ? result.data[0] : undefined;
  const output = result.output || dataObject?.output;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output[0];
  return output?.video_url || output?.url || result.video_url || dataObject?.video_url || dataItem?.video_url || result.url || dataObject?.url || dataItem?.url || result.content?.video_url || result.content?.url || dataObject?.content?.video_url || dataObject?.content?.url || result.result?.video_url || result.result?.url || dataObject?.result?.video_url || dataObject?.result?.url;
}

function extractError(result: FastGateStatusResponse) {
  const dataObject = Array.isArray(result.data) ? undefined : result.data;
  const message = typeof result.error === "string" ? result.error : result.error?.message || dataObject?.error || result.message;
  if (message?.includes("pre_consume_token_quota_failed") || message?.includes("token quota is not enough")) return "账户余额不足，当前额度不足以生成该视频，请充值后重试。";
  return message;
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `video:status:${membership.userId}`, limit: 240, windowMs: 60 * 1000 });
  if (limited) return limited;

  const body = await request.json() as StatusPayload;
  const profiles = body.profile_id ? await readServerApiProfiles() : [];
  const serverProfile = body.profile_id ? profiles.find(profile => profile.id === body.profile_id) : undefined;
  if (body.profile_id && !serverProfile) return NextResponse.json({ code: 404, message: "当前选中的 API Profile 不存在，请重新选择后再同步。" }, { status: 404 });
  const { apiKey, baseUrl } = resolveApiProfile(serverProfile);

  if (!apiKey) {
    return NextResponse.json(
      { code: 500, message: "缺少视频生成 API Key，请先在 .env.local 或管理员 API Profile 中配置。" },
      { status: 500 }
    );
  }

  if (!body.task_id) {
    return NextResponse.json(
      { code: 400, message: "缺少 task_id。" },
      { status: 400 }
    );
  }

  const endpoints = baseUrl.includes("/api/v3") ? [
    `${baseUrl}/contents/generations/tasks?page=1&page_size=500`,
    `${baseUrl}/contents/generations/tasks/${body.task_id}`
  ] : isZJProvider(baseUrl) ? [
    appendPath(baseUrl, `/v1/videos/generations/${body.task_id}`),
    appendPath(baseUrl, `/v1/video/generations/${body.task_id}`)
  ] : [
    `${baseUrl}/v1/video/generations/${body.task_id}`,
    `${baseUrl}/v1/tasks/${body.task_id}`,
    `${baseUrl}/v1/video/tasks/${body.task_id}`
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
  const matchedItem = result.items?.find(item => item.id === body.task_id || item.task_id === body.task_id);
  const matchedResult = matchedItem ? { ...matchedItem } as FastGateStatusResponse : result;
  const dataObject = Array.isArray(matchedResult.data) ? undefined : matchedResult.data;
  const rawStatus = matchedResult.status || matchedResult.task_status || dataObject?.status || dataObject?.task_status || matchedResult.result?.status || dataObject?.result?.status;
  const videoUrl = extractVideoUrl(matchedResult);
  const normalizedStatus = videoUrl ? "succeeded" : normalizeStatus(rawStatus);

  if (!finalResponse.ok) {
    if (finalResponse.status === 404) {
      return NextResponse.json({
        code: 0,
        data: {
          task_id: body.task_id,
          status: "pending",
          error: extractError(result) || "上游任务状态暂未可查，继续等待同步。",
          raw: result
        }
      });
    }
    return NextResponse.json(
      {
        code: finalResponse.status,
        message: extractError(result) || "查询 Seedance 任务状态失败",
        raw: result
      },
      { status: finalResponse.status }
    );
  }

  return NextResponse.json({
    code: 0,
    data: {
      task_id: matchedResult.id || matchedResult.task_id || dataObject?.id || dataObject?.task_id || body.task_id,
      status: normalizedStatus,
      video_url: videoUrl,
      error: extractError(matchedResult),
      raw: matchedResult
    }
  });
}
