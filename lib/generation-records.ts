import type { VideoTask } from "@/app/components/types";

export type GenerationRecordFilter = "all" | "running" | "done" | "failed";

export function sortGenerationTasks(tasks: VideoTask[]) {
  return [...tasks].sort((left, right) => {
    const createdDiff = Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "");
    if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;
    return right.id.localeCompare(left.id);
  });
}

export function filterGenerationTasks(tasks: VideoTask[], filter: GenerationRecordFilter) {
  if (filter === "all") return tasks;
  if (filter === "running") return tasks.filter(task => task.status === "running" || task.status === "pending");
  return tasks.filter(task => task.status === filter);
}

export function generationRecordCounts(tasks: VideoTask[]) {
  return {
    all: tasks.length,
    running: tasks.filter(task => task.status === "running" || task.status === "pending").length,
    done: tasks.filter(task => task.status === "done").length,
    failed: tasks.filter(task => task.status === "failed").length
  };
}

export function taskSnapshotText(task: VideoTask) {
  const snapshot = task.snapshot;
  if (!snapshot) return "历史任务未记录完整参数";
  return `${snapshot.duration}s / ${snapshot.ratio.split(" ")[0]} / ${snapshot.resolution || "720p"}`;
}

export function proxiedVideoUrl(options: { url?: string; download?: boolean; taskId?: string; profileId?: string }) {
  if (!options.url && !options.taskId) return "";
  const params = new URLSearchParams();
  if (options.url) params.set("url", options.url);
  if (options.taskId) params.set("task_id", options.taskId);
  if (options.profileId) params.set("profile_id", options.profileId);
  if (options.download) params.set("download", "1");
  return `/api/video-files?${params.toString()}`;
}
