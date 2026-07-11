export type VideoStatusResponse = {
  id?: string; task_id?: string; status?: string; task_status?: string;
  output?: string | string[] | { url?: string; video_url?: string }; url?: string; video_url?: string;
  content?: { video_url?: string; url?: string }; result?: { video_url?: string; url?: string; status?: string };
  error?: { message?: string } | string; message?: string;
  data?: {
    id?: string; task_id?: string; status?: string; task_status?: string;
    output?: string | string[] | { url?: string; video_url?: string }; url?: string; video_url?: string;
    content?: { video_url?: string; url?: string }; result?: { video_url?: string; url?: string; status?: string }; error?: string;
  } | Array<{ url?: string; video_url?: string }>;
  items?: Array<{
    id?: string; task_id?: string; status?: string; task_status?: string; url?: string; video_url?: string;
    content?: { video_url?: string; url?: string }; result?: { video_url?: string; url?: string; status?: string }; error?: string | { message?: string };
  }>;
};

function isHttpUrl(value?: string): value is string {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

function failedOutputMessage(value?: string) {
  const text = value?.trim();
  if (!text || isHttpUrl(text)) return "";
  return /fail|error|cancel|invalid|quota|insufficient|not enough/i.test(text) ? text : "";
}

export function extractVideoUrl(result: VideoStatusResponse) {
  const dataObject = Array.isArray(result.data) ? undefined : result.data;
  const dataItem = Array.isArray(result.data) ? result.data[0] : undefined;
  const output = result.output || dataObject?.output;
  const outputObject = typeof output === "object" && !Array.isArray(output) ? output : undefined;
  const candidates = [
    typeof output === "string" ? output : undefined, Array.isArray(output) ? output[0] : undefined,
    outputObject?.video_url, outputObject?.url, result.video_url, dataObject?.video_url, dataItem?.video_url,
    result.url, dataObject?.url, dataItem?.url, result.content?.video_url, result.content?.url,
    dataObject?.content?.video_url, dataObject?.content?.url, result.result?.video_url, result.result?.url,
    dataObject?.result?.video_url, dataObject?.result?.url
  ];
  return candidates.find(isHttpUrl) || "";
}

export function extractVideoError(result: VideoStatusResponse) {
  const dataObject = Array.isArray(result.data) ? undefined : result.data;
  const output = result.output || dataObject?.output;
  const outputText = typeof output === "string" ? output : Array.isArray(output) && typeof output[0] === "string" ? output[0] : "";
  const errorMessage = typeof result.error === "string" ? result.error : result.error?.message;
  const detailedMessage = result.message && result.message !== "task failed" ? result.message : undefined;
  const message = detailedMessage || dataObject?.error || errorMessage || result.message || failedOutputMessage(outputText);
  if (message?.includes("pre_consume_token_quota_failed") || message?.includes("token quota is not enough")) return "账户余额不足，当前额度不足以生成该视频，请充值后重试。";
  return message;
}

export function upstreamHost(baseUrl: string) {
  try { return new URL(baseUrl).hostname; } catch { return baseUrl; }
}
