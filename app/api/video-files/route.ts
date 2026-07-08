import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { readServerApiProfiles } from "../api-profiles/store";

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://api.aifastgate.com";
const ALLOWED_HOSTS = new Set(["api.aifastgate.com", "console.aifastgate.com", "gw.aifastgate.com", "43.159.135.17", "ark-acg-cn-beijing.tos-cn-beijing.volces.com", "zjljzn.ltd"]);
const ALLOWED_HOST_SUFFIXES = [".tos-cn-beijing.volces.com"];

type ApiProfile = { name?: string; baseUrl?: string; apiKey?: string; model?: string };

type FastGateStatusResponse = {
  id?: string;
  status?: string;
  url?: string;
  video_url?: string;
  content?: { video_url?: string; url?: string };
  output?: string | string[] | { url?: string; video_url?: string };
  data?: {
    id?: string;
    status?: string;
    url?: string;
    video_url?: string;
    content?: { video_url?: string; url?: string };
    output?: string | string[] | { url?: string; video_url?: string };
  } | Array<{ id?: string; status?: string; url?: string; video_url?: string }>;
  items?: Array<{ id?: string; status?: string; url?: string; video_url?: string; content?: { video_url?: string; url?: string } }>;
};

function isHttpUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
    dataObject?.content?.url
  ];
  return candidates.find(isHttpUrl) || "";
}

function safeTargetUrl(rawUrl: string, allowTrustedHttps = false) {
  const targetUrl = new URL(rawUrl);
  const allowedProtocol = targetUrl.protocol === "https:" || (targetUrl.protocol === "http:" && targetUrl.hostname === "43.159.135.17");
  if (allowTrustedHttps && targetUrl.protocol === "https:") return targetUrl;
  const allowedHost = ALLOWED_HOSTS.has(targetUrl.hostname) || ALLOWED_HOST_SUFFIXES.some(suffix => targetUrl.hostname.endsWith(suffix));
  if (!allowedProtocol || !allowedHost) return null;
  return targetUrl;
}

function resolveApiProfile(profile?: ApiProfile) {
  return {
    apiKey: profile?.apiKey?.trim() || process.env.SEEDANCE_API_KEY || "",
    baseUrl: (profile?.baseUrl?.trim() || BASE_URL).replace(/\/$/, "")
  };
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

async function fetchVideo(url: string, apiKey?: string, allowTrustedHttps = false) {
  const targetUrl = safeTargetUrl(url, allowTrustedHttps);
  if (!targetUrl) return null;
  const headers: HeadersInit = {};
  if (apiKey && ["api.aifastgate.com", "console.aifastgate.com", "gw.aifastgate.com", "43.159.135.17", "zjljzn.ltd"].includes(targetUrl.hostname)) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchWithTimeout(targetUrl.toString(), { headers, cache: "no-store" }, 60000);
  return { response, targetUrl };
}

async function latestVideoUrl(taskId: string, apiKey: string | undefined, baseUrl: string) {
  if (!apiKey) return "";
  const endpoints = baseUrl.includes("/api/v3") ? [`${baseUrl}/contents/generations/tasks/${taskId}`, `${baseUrl}/contents/generations/tasks`] : isZJProvider(baseUrl) ? [appendPath(baseUrl, `/v1/videos/generations/${taskId}`), appendPath(baseUrl, `/v1/video/generations/${taskId}`)] : [`${baseUrl}/v1/video/generations/${taskId}`];
  for (const endpoint of endpoints) {
    const response = await fetchWithTimeout(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store"
    }, 30000);
    if (!response.ok) continue;
    const text = await response.text();
    let result: FastGateStatusResponse = {};
    try { result = text ? JSON.parse(text) as FastGateStatusResponse : {}; } catch { result = {}; }
    const matchedItem = result.items?.find(item => item.id === taskId);
    const matchedDataItem = Array.isArray(result.data) ? result.data.find(item => item.id === taskId) || result.data[0] : undefined;
    const videoUrl = [matchedItem?.video_url, matchedItem?.url, matchedItem?.content?.video_url, matchedItem?.content?.url, matchedDataItem?.video_url, matchedDataItem?.url, extractVideoUrl(result)].find(isHttpUrl) || "";
    if (videoUrl) return videoUrl;
  }
  return "";
}

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `video:file:${membership.userId}`, limit: 120, windowMs: 60 * 1000 });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profile_id") || "";
  const profiles = profileId ? await readServerApiProfiles() : [];
  const serverProfile = profileId ? profiles.find(profile => profile.id === profileId) : undefined;
  if (profileId && !serverProfile) return NextResponse.json({ code: 404, message: "当前选中的 API Profile 不存在，请重新选择后再播放。" }, { status: 404 });
  const { apiKey, baseUrl } = resolveApiProfile(serverProfile);
  const rawUrl = searchParams.get("url") || "";
  const taskId = searchParams.get("task_id") || "";
  const download = searchParams.get("download") === "1";

  let latestUrl = "";
  try {
    latestUrl = taskId ? await latestVideoUrl(taskId, apiKey, baseUrl) : "";
  } catch (error) {
    return NextResponse.json({ code: 504, message: error instanceof Error ? error.message : "查询最新视频地址失败。" }, { status: 504 });
  }
  const resolvedUrl = latestUrl || rawUrl;
  const allowTrustedHttps = Boolean(latestUrl && taskId && profileId);
  if (!resolvedUrl) {
    return NextResponse.json({ code: 400, message: "缺少视频地址或后台任务 ID。" }, { status: 400 });
  }
  if (!isHttpUrl(resolvedUrl)) {
    return NextResponse.json({ code: 400, message: "当前任务没有可用视频地址，请同步任务状态或重新生成。" }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof fetchVideo>>;
  try {
    result = await fetchVideo(resolvedUrl, apiKey, allowTrustedHttps);
  } catch (error) {
    const message = error instanceof Error ? error.message : "视频地址格式不正确。";
    return NextResponse.json({ code: message.includes("超时") ? 504 : 400, message }, { status: message.includes("超时") ? 504 : 400 });
  }

  if (!result) {
    return NextResponse.json({ code: 400, message: "不支持的视频地址来源。" }, { status: 400 });
  }

  let { response, targetUrl } = result;
  if ((!response.ok || !response.body) && taskId && rawUrl && rawUrl !== resolvedUrl) {
    const fallback = await fetchVideo(rawUrl, apiKey).catch(() => null);
    if (fallback) ({ response, targetUrl } = fallback);
  }

  if (!response.ok || !response.body) {
    return NextResponse.json(
      { code: response.status, message: "视频文件暂时无法访问，请点击同步后台状态后重试。" },
      { status: response.status }
    );
  }

  const contentType = response.headers.get("content-type") || "video/mp4";
  const contentLength = response.headers.get("content-length");
  const fileName = targetUrl.pathname.split("/").pop() || "manjing-video.mp4";
  const proxyHeaders = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
    "Cache-Control": "private, max-age=300"
  });
  if (contentLength) proxyHeaders.set("Content-Length", contentLength);

  return new Response(response.body, { status: 200, headers: proxyHeaders });
}
