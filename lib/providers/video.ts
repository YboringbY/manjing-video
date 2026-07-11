export function normalizeProviderBaseUrl(value: string | undefined, fallback = "") {
  return (value || fallback).trim().replace(/\/$/, "");
}

export function appendProviderPath(baseUrl: string, routePath: string) {
  const normalized = normalizeProviderBaseUrl(baseUrl);
  if (normalized.endsWith("/v1")) return `${normalized}${routePath.replace(/^\/v1/, "")}`;
  return `${normalized}${routePath}`;
}

export function isZJVideoProvider(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname === "zjljzn.ltd";
  } catch {
    return false;
  }
}

export function videoCreateEndpoint(baseUrl: string) {
  if (baseUrl.includes("/api/v3")) return `${baseUrl}/contents/generations/tasks`;
  if (isZJVideoProvider(baseUrl)) return appendProviderPath(baseUrl, "/v1/videos/generations");
  return appendProviderPath(baseUrl, "/v1/video/generations");
}

export function videoStatusEndpoints(baseUrl: string, taskId: string) {
  if (baseUrl.includes("/api/v3")) {
    return [`${baseUrl}/contents/generations/tasks?page=1&page_size=500`, `${baseUrl}/contents/generations/tasks/${taskId}`];
  }
  if (isZJVideoProvider(baseUrl)) {
    return [appendProviderPath(baseUrl, `/v1/videos/generations/${taskId}`), appendProviderPath(baseUrl, `/v1/video/generations/${taskId}`)];
  }
  return [
    appendProviderPath(baseUrl, `/v1/video/generations/${taskId}`),
    appendProviderPath(baseUrl, `/v1/tasks/${taskId}`),
    appendProviderPath(baseUrl, `/v1/video/tasks/${taskId}`)
  ];
}

export function videoRecoveryEndpoints(baseUrl: string, taskId: string) {
  if (baseUrl.includes("/api/v3")) return [`${baseUrl}/contents/generations/tasks/${taskId}`, `${baseUrl}/contents/generations/tasks`];
  if (isZJVideoProvider(baseUrl)) {
    return [appendProviderPath(baseUrl, `/v1/videos/generations/${taskId}`), appendProviderPath(baseUrl, `/v1/video/generations/${taskId}`)];
  }
  return [appendProviderPath(baseUrl, `/v1/video/generations/${taskId}`)];
}

export function normalizeVideoStatus(value?: string) {
  const status = (value || "pending").toLowerCase();
  if (["succeeded", "success", "completed", "done"].includes(status)) return "succeeded";
  if (["failed", "error", "cancelled", "canceled"].includes(status)) return "failed";
  if (["running", "processing", "in_progress"].includes(status)) return "running";
  return "pending";
}
