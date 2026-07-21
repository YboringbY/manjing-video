"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import type { AppState, VideoAsset, VideoTask } from "../components/types";
import { isFailedVideoStatus, isHttpVideoUrl, isRunningVideoStatus, videoTaskPollDelay, videoTaskPollLimitExceeded } from "@/lib/video-task-client";

type VideoTaskStatusData = {
  status: string;
  video_url?: string;
  duration?: number;
  error?: string;
  task?: VideoTask;
};

type VideoTaskApiResult = {
  code: number;
  message?: string;
  data?: {
    task_id?: string;
    task?: VideoTask;
    status?: string;
    video_url?: string;
    duration?: number;
    error?: string;
  } | null;
};

type VideoTaskSubmission = {
  shotId: number;
  body: Record<string, unknown>;
};

type UseVideoGenerationTaskOptions = {
  enabled: boolean;
  projectId: number;
  tasks: VideoTask[];
  setState: Dispatch<SetStateAction<AppState>>;
  readApiJson: (response: Response, fallbackMessage: string) => Promise<VideoTaskApiResult>;
  onMessage: (message: string) => void;
};

const POLL_LIMIT_MESSAGE = "状态同步已超过安全重试上限，请稍后手动同步后台状态。";
const VIDEO_GRADIENTS = [
  "linear-gradient(135deg,#14213d,#0f9f7a)",
  "linear-gradient(135deg,#312e81,#0ea5e9)",
  "linear-gradient(135deg,#431407,#f97316)",
  "linear-gradient(135deg,#4c1d95,#ec4899)",
  "linear-gradient(135deg,#064e3b,#84cc16)"
];

function randomVideoGradient() {
  return VIDEO_GRADIENTS[Math.floor(Math.random() * VIDEO_GRADIENTS.length)];
}

export function useVideoGenerationTask({
  enabled,
  projectId,
  tasks,
  setState,
  readApiJson,
  onMessage
}: UseVideoGenerationTaskOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const projectIdRef = useRef(projectId);
  const tasksRef = useRef(tasks);
  const pollTimersRef = useRef<Record<string, number>>({});
  const pollEpochRef = useRef(0);
  const submissionInFlightRef = useRef(false);
  const submissionTokenRef = useRef(0);
  const callbacksRef = useRef({ setState, readApiJson, onMessage });
  tasksRef.current = tasks;
  callbacksRef.current = { setState, readApiJson, onMessage };

  const clearPoll = useCallback((taskId: string) => {
    const timer = pollTimersRef.current[taskId];
    if (timer) window.clearTimeout(timer);
    delete pollTimersRef.current[taskId];
  }, []);

  const stopAll = useCallback(() => {
    Object.values(pollTimersRef.current).forEach(timer => window.clearTimeout(timer));
    pollTimersRef.current = {};
    pollEpochRef.current += 1;
    submissionTokenRef.current += 1;
    submissionInFlightRef.current = false;
    setIsSubmitting(false);
  }, []);

  const completeTask = useCallback((taskProjectId: number, shotId: number, taskId: string, videoUrl: string, realDuration?: number, providerTaskId?: string) => {
    clearPoll(taskId);
    if (projectIdRef.current !== taskProjectId) return;
    callbacksRef.current.setState(previous => {
      const shot = previous.shots.find(item => item.id === shotId);
      if (!shot) return previous;
      const index = previous.shots.findIndex(item => item.id === shotId);
      const existingTask = previous.tasks.find(item => item.id === taskId);
      const asset: VideoAsset = {
        id: Date.now(),
        shotId,
        title: `镜头 #${String(index + 1).padStart(2, "0")} 可用片段`,
        meta: `${realDuration || shot.duration}秒 / ${shot.ratio.split(" ")[0]}`,
        gradient: randomVideoGradient(),
        videoUrl,
        providerTaskId: providerTaskId || existingTask?.providerTaskId
      };
      return {
        ...previous,
        shots: previous.shots.map(item => item.id === shotId ? { ...item, status: "done" } : item),
        tasks: previous.tasks.map(item => item.id === taskId ? { ...item, status: "done", result: "已生成，可预览下载", videoUrl, error: undefined } : item),
        assets: [asset, ...previous.assets.filter(item => item.shotId !== shotId)]
      };
    });
  }, [clearPoll]);

  const failTask = useCallback((taskProjectId: number, shotId: number, taskId: string, message: string) => {
    clearPoll(taskId);
    if (projectIdRef.current !== taskProjectId) return;
    callbacksRef.current.setState(previous => ({
      ...previous,
      shots: previous.shots.map(item => item.id === shotId ? { ...item, status: "failed" } : item),
      tasks: previous.tasks.map(item => item.id === taskId ? { ...item, status: "failed", result: message, error: message } : item),
      assets: previous.assets.filter(asset => asset.shotId !== shotId)
    }));
  }, [clearPoll]);

  const pollTask = useCallback(function poll(
    taskProjectId: number,
    shotId: number,
    internalTaskId: string,
    providerTaskId: string,
    pollEpoch: number,
    attempt = 0,
    failedAttempts = 0,
    startedAt = Date.now()
  ) {
    if (!enabled || pollEpochRef.current !== pollEpoch || projectIdRef.current !== taskProjectId) return clearPoll(internalTaskId);
    clearPoll(internalTaskId);
    const timer = window.setTimeout(async () => {
      if (pollTimersRef.current[internalTaskId] !== timer) return;
      delete pollTimersRef.current[internalTaskId];
      if (pollEpochRef.current !== pollEpoch || projectIdRef.current !== taskProjectId) return;

      if (videoTaskPollLimitExceeded({ elapsedMs: Date.now() - startedAt, attempt, failedAttempts })) {
        failTask(taskProjectId, shotId, internalTaskId, POLL_LIMIT_MESSAGE);
        return;
      }

      try {
        const response = await fetch("/api/video-tasks/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: taskProjectId, internal_task_id: internalTaskId })
        });
        const result = await callbacksRef.current.readApiJson(response, "查询视频任务失败");
        if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "查询视频任务失败");
        const data = result.data as VideoTaskStatusData;
        if (data.task) callbacksRef.current.setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === internalTaskId ? data.task! : item) }));
        if (isRunningVideoStatus(data.status)) {
          callbacksRef.current.setState(previous => ({
            ...previous,
            tasks: previous.tasks.map(item => item.id === internalTaskId ? { ...item, status: "running", result: `生成中：${data.status}｜任务ID：${providerTaskId}` } : item),
            shots: previous.shots.map(item => item.id === shotId ? { ...item, status: "running" } : item)
          }));
          poll(taskProjectId, shotId, internalTaskId, providerTaskId, pollEpoch, attempt + 1, 0, startedAt);
          return;
        }
        if (data.status === "succeeded" && isHttpVideoUrl(data.video_url)) {
          completeTask(taskProjectId, shotId, internalTaskId, data.video_url, data.duration, providerTaskId);
          return;
        }
        if (data.status === "succeeded" && !data.video_url) {
          callbacksRef.current.setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === internalTaskId ? { ...item, result: "生成已完成，正在等待视频地址同步" } : item) }));
          poll(taskProjectId, shotId, internalTaskId, providerTaskId, pollEpoch, attempt + 1, 0, startedAt);
          return;
        }
        if (isFailedVideoStatus(data.status)) {
          failTask(taskProjectId, shotId, internalTaskId, data.error || "视频生成失败");
          return;
        }
        callbacksRef.current.setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === internalTaskId ? { ...item, result: `等待上游同步：${data.status || "unknown"}` } : item) }));
        poll(taskProjectId, shotId, internalTaskId, providerTaskId, pollEpoch, attempt + 1, 0, startedAt);
      } catch (error) {
        callbacksRef.current.setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === internalTaskId ? { ...item, result: error instanceof Error ? `状态查询暂未成功，继续重试：${error.message}` : "状态查询暂未成功，继续重试" } : item) }));
        poll(taskProjectId, shotId, internalTaskId, providerTaskId, pollEpoch, attempt + 1, failedAttempts + 1, startedAt);
      }
    }, videoTaskPollDelay(failedAttempts));
    pollTimersRef.current[internalTaskId] = timer;
  }, [clearPoll, completeTask, enabled, failTask]);

  const submit = useCallback(async ({ shotId, body }: VideoTaskSubmission) => {
    if (!enabled || submissionInFlightRef.current) return false;
    const taskProjectId = projectIdRef.current;
    const submissionToken = ++submissionTokenRef.current;
    submissionInFlightRef.current = true;
    setIsSubmitting(true);
    callbacksRef.current.setState(previous => ({
      ...previous,
      shots: previous.shots.map(item => item.id === shotId ? { ...item, status: "running" } : item)
    }));
    try {
      const response = await fetch("/api/video-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await callbacksRef.current.readApiJson(response, "创建视频任务失败");
      const serverTask = result.data?.task;
      if (serverTask && submissionTokenRef.current === submissionToken && projectIdRef.current === taskProjectId) {
        callbacksRef.current.setState(previous => ({
          ...previous,
          tasks: [serverTask, ...previous.tasks.filter(item => item.id !== serverTask.id && !(item.shotId === shotId && item.status === "running"))]
        }));
      }
      if (!response.ok || result.code !== 0 || !result.data?.task_id || !serverTask) throw new Error(result.message || "创建视频任务失败");
      const providerTaskId = result.data.task_id;
      if (submissionTokenRef.current !== submissionToken || projectIdRef.current !== taskProjectId) return false;
      callbacksRef.current.setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === serverTask.id ? { ...serverTask, result: `任务已提交：${providerTaskId}` } : item) }));
      pollTask(taskProjectId, shotId, serverTask.id, providerTaskId, pollEpochRef.current);
      return true;
    } catch (error) {
      if (submissionTokenRef.current === submissionToken && projectIdRef.current === taskProjectId) {
        callbacksRef.current.setState(previous => ({ ...previous, shots: previous.shots.map(item => item.id === shotId ? { ...item, status: "failed" } : item) }));
        callbacksRef.current.onMessage(error instanceof Error ? error.message : "创建视频任务失败");
      }
      return false;
    } finally {
      if (submissionTokenRef.current === submissionToken) {
        submissionInFlightRef.current = false;
        setIsSubmitting(false);
      }
    }
  }, [enabled, pollTask]);

  const refreshTask = useCallback(async (task: VideoTask) => {
    const taskProjectId = projectIdRef.current;
    try {
      callbacksRef.current.onMessage(`正在同步生成任务：${task.id}`);
      const response = await fetch("/api/video-tasks/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: taskProjectId, internal_task_id: task.id, task_id: task.providerTaskId, profile_id: task.apiProfile?.id })
      });
      const result = await callbacksRef.current.readApiJson(response, "同步任务状态失败");
      if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "同步任务状态失败");
      const data = result.data as VideoTaskStatusData;
      if (projectIdRef.current !== taskProjectId) return;
      if (data.task) callbacksRef.current.setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? data.task! : item) }));
      if (data.status === "succeeded" && isHttpVideoUrl(data.video_url)) {
        completeTask(taskProjectId, task.shotId, task.id, data.video_url, data.duration, task.providerTaskId);
        callbacksRef.current.onMessage("已从后台同步成功视频，任务状态已更新为完成。");
        return;
      }
      if (isRunningVideoStatus(data.status)) {
        callbacksRef.current.setState(previous => ({
          ...previous,
          shots: previous.shots.map(item => item.id === task.shotId ? { ...item, status: "running" } : item),
          tasks: previous.tasks.map(item => item.id === task.id ? { ...item, status: "running", result: `生成中：${data.status}` } : item)
        }));
        callbacksRef.current.onMessage(`后台任务仍在生成中：${data.status}`);
        return;
      }
      if (isFailedVideoStatus(data.status)) {
        failTask(taskProjectId, task.shotId, task.id, data.error || "视频生成失败");
        callbacksRef.current.onMessage(data.error || "后台任务仍显示失败。");
        return;
      }
      callbacksRef.current.onMessage(`后台任务等待上游同步：${data.status || "unknown"}`);
    } catch (error) {
      callbacksRef.current.onMessage(error instanceof Error ? error.message : "同步任务状态失败");
    }
  }, [completeTask, failTask]);

  const refreshAll = useCallback(async () => {
    const activeTasks = tasksRef.current.filter(task => !task.id.startsWith("imported-") && ["pending", "running"].includes(task.status));
    for (const task of activeTasks) await refreshTask(task);
    callbacksRef.current.onMessage(activeTasks.length ? `已同步 ${activeTasks.length} 条生成记录。` : "没有可同步的生成记录。");
  }, [refreshTask]);

  const deleteTask = useCallback(async (taskId: string) => {
    const taskProjectId = projectIdRef.current;
    const target = tasksRef.current.find(task => task.id === taskId);
    if (!target) return;
    try {
      const params = new URLSearchParams({ project_id: String(taskProjectId), task_id: taskId });
      const response = await fetch(`/api/video-tasks?${params.toString()}`, { method: "DELETE" });
      const result = await callbacksRef.current.readApiJson(response, "删除生成记录失败");
      if (!response.ok || result.code !== 0) throw new Error(result.message || "删除生成记录失败");
    } catch (error) {
      callbacksRef.current.onMessage(error instanceof Error ? error.message : "删除生成记录失败");
      return;
    }
    if (projectIdRef.current !== taskProjectId) return;
    clearPoll(taskId);
    callbacksRef.current.setState(previous => {
      const remainingTasks = previous.tasks.filter(task => task.id !== taskId);
      const hasOtherTaskForShot = remainingTasks.some(task => task.shotId === target.shotId);
      return {
        ...previous,
        shots: previous.shots.map(shot => shot.id === target.shotId && !hasOtherTaskForShot ? { ...shot, status: "pending" } : shot),
        tasks: remainingTasks,
        assets: previous.assets.filter(asset => asset.providerTaskId !== target.providerTaskId)
      };
    });
    callbacksRef.current.onMessage("生成记录已删除，关联分镜已恢复为待生成。");
  }, [clearPoll]);

  const isSubmissionInFlight = useCallback(() => submissionInFlightRef.current, []);

  useEffect(() => {
    projectIdRef.current = projectId;
    stopAll();
  }, [projectId, stopAll]);

  useEffect(() => {
    if (!enabled) stopAll();
  }, [enabled, stopAll]);

  useEffect(() => () => {
    Object.values(pollTimersRef.current).forEach(timer => window.clearTimeout(timer));
    pollTimersRef.current = {};
    pollEpochRef.current += 1;
    submissionTokenRef.current += 1;
    submissionInFlightRef.current = false;
  }, []);

  return { isSubmitting, isSubmissionInFlight, submit, refreshAll, deleteTask };
}
