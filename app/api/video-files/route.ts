import { NextResponse } from "next/server";
import { readServerApiProfiles } from "../api-profiles/store";

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://api.aifastgate.com";
const ALLOWED_HOSTS = new Set(["api.aifastgate.com", "console.aifastgate.com", "gw.aifastgate.com", "43.159.135.17", "ark-acg-cn-beijing.tos-cn-beijing.volces.com"]);

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
  };
  items?: Array<{ id?: string; status?: string; url?: string; video_url?: string; content?: { video_url?: string; url?: string } }>;
};

function extractVideoUrl(result: FastGateStatusResponse) {
  const output = result.output || result.data?.output;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output[0];
  return output?.video_url || output?.url || result.video_url || result.data?.video_url || result.url || result.data?.url || result.content?.video_url || result.content?.url || result.data?.content?.video_url || result.data?.content?.url;
}

function safeTargetUrl(rawUrl: string) {
  const targetUrl = new URL(rawUrl);
  const allowedProtocol = targetUrl.protocol === "https:" || (targetUrl.protocol === "http:" && targetUrl.hostname === "43.159.135.17");
  if (!allowedProtocol || !ALLOWED_HOSTS.has(targetUrl.hostname)) return null;
  return targetUrl;
}

function resolveApiProfile(profile?: ApiProfile) {
  return {
    apiKey: profile?.apiKey?.trim() || process.env.SEEDANCE_API_KEY || "",
    baseUrl: (profile?.baseUrl?.trim() || BASE_URL).replace(/\/$/, "")
  };
}

function parseProfileParam(value: string | null) {
  if (!value) return undefined;
  try { return JSON.parse(value) as ApiProfile; } catch { return undefined; }
}

async function fetchVideo(url: string, apiKey?: string) {
  const targetUrl = safeTargetUrl(url);
  if (!targetUrl) return null;
  const headers: HeadersInit = {};
  if (apiKey && ["api.aifastgate.com", "console.aifastgate.com", "gw.aifastgate.com", "43.159.135.17"].includes(targetUrl.hostname)) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(targetUrl.toString(), { headers, cache: "no-store" });
  return { response, targetUrl };
}

async function latestVideoUrl(taskId: string, apiKey: string | undefined, baseUrl: string) {
  if (!apiKey) return "";
  const endpoints = baseUrl.includes("/api/v3") ? [`${baseUrl}/contents/generations/tasks/${taskId}`, `${baseUrl}/contents/generations/tasks`] : [`${baseUrl}/v1/video/generations/${taskId}`];
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store"
    });
    if (!response.ok) continue;
    const text = await response.text();
    let result: FastGateStatusResponse = {};
    try { result = text ? JSON.parse(text) as FastGateStatusResponse : {}; } catch { result = {}; }
    const matchedItem = result.items?.find(item => item.id === taskId);
    const videoUrl = matchedItem?.video_url || matchedItem?.url || matchedItem?.content?.video_url || matchedItem?.content?.url || extractVideoUrl(result);
    if (videoUrl) return videoUrl;
  }
  return "";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profile_id") || "";
  const profiles = profileId ? await readServerApiProfiles() : [];
  const serverProfile = profileId ? profiles.find(profile => profile.id === profileId) : undefined;
  if (profileId && !serverProfile) return NextResponse.json({ code: 404, message: "当前选中的 API Profile 不存在，请重新选择后再播放。" }, { status: 404 });
  const { apiKey, baseUrl } = resolveApiProfile(serverProfile || parseProfileParam(searchParams.get("profile")));
  const rawUrl = searchParams.get("url") || "";
  const taskId = searchParams.get("task_id") || "";
  const download = searchParams.get("download") === "1";

  const resolvedUrl = taskId ? await latestVideoUrl(taskId, apiKey, baseUrl) || rawUrl : rawUrl;
  if (!resolvedUrl) {
    return NextResponse.json({ code: 400, message: "缺少视频地址或后台任务 ID。" }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof fetchVideo>>;
  try {
    result = await fetchVideo(resolvedUrl, apiKey);
  } catch {
    return NextResponse.json({ code: 400, message: "视频地址格式不正确。" }, { status: 400 });
  }

  if (!result) {
    return NextResponse.json({ code: 400, message: "不支持的视频地址来源。" }, { status: 400 });
  }

  let { response, targetUrl } = result;
  if ((!response.ok || !response.body) && taskId && rawUrl && rawUrl !== resolvedUrl) {
    const fallback = await fetchVideo(rawUrl, apiKey);
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
