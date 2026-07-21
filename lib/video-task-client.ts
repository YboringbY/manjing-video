const RUNNING_VIDEO_STATUSES = new Set(["pending", "submitted", "queued", "running", "processing"]);
const FAILED_VIDEO_STATUSES = new Set(["failed", "error", "cancelled", "canceled"]);

export function isHttpVideoUrl(value?: string): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isRunningVideoStatus(status?: string) {
  return RUNNING_VIDEO_STATUSES.has(status || "");
}

export function isFailedVideoStatus(status?: string) {
  return FAILED_VIDEO_STATUSES.has(status || "");
}

export function videoTaskPollDelay(failedAttempts: number) {
  return Math.min(30000, 5000 + Math.max(0, failedAttempts) * 2000);
}

export function videoTaskPollLimitExceeded(params: { elapsedMs: number; attempt: number; failedAttempts: number }) {
  return params.elapsedMs > 30 * 60 * 1000 || params.attempt >= 360 || params.failedAttempts >= 12;
}
