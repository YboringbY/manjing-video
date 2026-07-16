"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MaterialAsset } from "../components/types";
import { imageTaskRetryDelay, imageTaskStatusMessage } from "@/lib/image-workbench";

export type ImageGenerationTask = {
  id: string;
  projectId: number;
  status: "pending" | "running" | "done" | "failed";
  error?: string;
  materials?: MaterialAsset[];
};

type ImageTaskApiResult = {
  code: number;
  message?: string;
  data?: ImageGenerationTask | null;
};

type ImageTaskSubmission = {
  model: string;
  prompt: string;
  size: string;
  count: number;
  referenceMaterialId?: number;
};

type UseImageGenerationTaskOptions = {
  enabled: boolean;
  projectId: number;
  readApiJson: (response: Response, fallbackMessage: string) => Promise<ImageTaskApiResult>;
  onCompleted: (task: ImageGenerationTask) => void;
  onFailed?: () => void;
  onMessage: (message: string) => void;
};

export function useImageGenerationTask({
  enabled,
  projectId,
  readApiJson,
  onCompleted,
  onFailed,
  onMessage
}: UseImageGenerationTaskOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const projectIdRef = useRef(projectId);
  const activeTaskIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const submissionInFlightRef = useRef(false);
  const callbacksRef = useRef({ readApiJson, onCompleted, onFailed, onMessage });
  callbacksRef.current = { readApiJson, onCompleted, onFailed, onMessage };

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
    activeTaskIdRef.current = null;
    submissionInFlightRef.current = false;
    setIsGenerating(false);
  }, []);

  const applyCompletedTask = useCallback((task: ImageGenerationTask, taskProjectId: number) => {
    if (projectIdRef.current !== taskProjectId) return stopPolling();
    callbacksRef.current.onCompleted(task);
    stopPolling();
  }, [stopPolling]);

  const pollTask = useCallback(async function poll(taskId: string, taskProjectId: number, attempt = 0) {
    if (projectIdRef.current !== taskProjectId || activeTaskIdRef.current !== taskId) return;
    try {
      const response = await fetch(`/api/image-tasks?projectId=${taskProjectId}&id=${encodeURIComponent(taskId)}`);
      const result = await callbacksRef.current.readApiJson(response, "同步生图任务失败");
      if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "同步生图任务失败");
      const task = result.data;
      if (activeTaskIdRef.current !== task.id) return;
      if (task.status === "done") return applyCompletedTask(task, taskProjectId);
      if (task.status === "failed") {
        callbacksRef.current.onFailed?.();
        callbacksRef.current.onMessage(task.error || "图片生成失败，请检查渠道后重试。");
        return stopPolling();
      }
      callbacksRef.current.onMessage(imageTaskStatusMessage(task.status));
      pollTimerRef.current = window.setTimeout(() => void poll(taskId, taskProjectId, attempt + 1), 2000);
    } catch (error) {
      if (attempt >= 120) {
        callbacksRef.current.onMessage("生图任务仍在后台处理，但状态同步暂时不可用。请稍后刷新素材库查看结果。");
        return stopPolling();
      }
      callbacksRef.current.onMessage(error instanceof Error ? `生图状态暂未同步：${error.message}` : "生图状态暂未同步，正在重试...");
      pollTimerRef.current = window.setTimeout(() => void poll(taskId, taskProjectId, attempt + 1), imageTaskRetryDelay(attempt));
    }
  }, [applyCompletedTask, stopPolling]);

  const beginPolling = useCallback((task: ImageGenerationTask, taskProjectId: number) => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    activeTaskIdRef.current = task.id;
    submissionInFlightRef.current = false;
    setIsGenerating(true);
    if (task.status === "done") return applyCompletedTask(task, taskProjectId);
    if (task.status === "failed") {
      callbacksRef.current.onFailed?.();
      callbacksRef.current.onMessage(task.error || "图片生成失败，请检查渠道后重试。");
      return stopPolling();
    }
    void pollTask(task.id, taskProjectId);
  }, [applyCompletedTask, pollTask, stopPolling]);

  const submit = useCallback(async (input: ImageTaskSubmission) => {
    if (!enabled || submissionInFlightRef.current || activeTaskIdRef.current) return;
    const taskProjectId = projectIdRef.current;
    submissionInFlightRef.current = true;
    setIsGenerating(true);
    callbacksRef.current.onMessage("正在提交生图任务...");
    try {
      const response = await fetch("/api/image-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          size: input.size,
          n: input.count,
          projectId: taskProjectId,
          referenceMaterialId: input.referenceMaterialId
        })
      });
      const result = await callbacksRef.current.readApiJson(response, "图片生成失败");
      if (response.status === 409 && result.data?.id) {
        beginPolling(result.data, taskProjectId);
        callbacksRef.current.onMessage("当前项目已有生图任务，已恢复状态同步。");
        return;
      }
      if (!response.ok || result.code !== 0 || !result.data?.id) throw new Error(result.message || "图片生成任务创建失败");
      beginPolling(result.data, taskProjectId);
      callbacksRef.current.onMessage("生图任务已提交，正在后台处理。刷新页面不会中断任务。");
    } catch (error) {
      callbacksRef.current.onMessage(error instanceof Error ? error.message : "图片生成失败");
      stopPolling();
    }
  }, [beginPolling, enabled, stopPolling]);

  useEffect(() => {
    projectIdRef.current = projectId;
    stopPolling();
  }, [projectId, stopPolling]);

  useEffect(() => {
    if (!enabled) {
      stopPolling();
      return;
    }
    let cancelled = false;
    fetch(`/api/image-tasks?projectId=${projectId}`)
      .then(response => callbacksRef.current.readApiJson(response, "恢复生图任务失败"))
      .then(result => {
        if (cancelled || result.code !== 0 || !result.data?.id) return;
        beginPolling(result.data, projectId);
        callbacksRef.current.onMessage("检测到当前项目仍有生图任务，正在恢复状态同步...");
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [beginPolling, enabled, projectId, stopPolling]);

  useEffect(() => () => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
  }, []);

  return { isGenerating, submit };
}
