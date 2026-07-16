"use client";

import { useMemo, useState } from "react";
import type { ApiProfile, TaskStatus, VideoAsset, VideoTask } from "./types";
import { filterGenerationTasks, generationRecordCounts, GenerationRecordFilter, proxiedVideoUrl, sortGenerationTasks, taskSnapshotText } from "@/lib/generation-records";

type GenerationRecordsSectionProps = {
  active: boolean;
  tasks: VideoTask[];
  assets: VideoAsset[];
  activeApiProfile?: ApiProfile;
  onRefresh: () => void;
  onRerun: (task: VideoTask) => void;
  onEdit: (task: VideoTask) => void;
  onFeedback: (task: VideoTask, rating: "satisfied" | "unsatisfied") => void;
  onDelete: (taskId: string) => void;
};

const FILTERS: Array<[GenerationRecordFilter, string]> = [
  ["all", "全部"],
  ["running", "生成中"],
  ["done", "已完成"],
  ["failed", "失败"]
];

function isHttpVideoUrl(value?: string): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function taskStatusTag(status: TaskStatus) {
  const map = { pending: ["pending", "等待生成"], running: ["running", "生成中"], done: ["done", "完成"], failed: ["pending", "失败"] } as const;
  const [className, text] = map[status];
  return <span className={`tag ${className}`}>{text}</span>;
}

export function GenerationRecordsSection({
  active,
  tasks,
  assets,
  activeApiProfile,
  onRefresh,
  onRerun,
  onEdit,
  onFeedback,
  onDelete
}: GenerationRecordsSectionProps) {
  const [filter, setFilter] = useState<GenerationRecordFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const sortedTasks = useMemo(() => sortGenerationTasks(tasks), [tasks]);
  const counts = useMemo(() => generationRecordCounts(sortedTasks), [sortedTasks]);
  const filteredTasks = useMemo(() => filterGenerationTasks(sortedTasks, filter), [filter, sortedTasks]);
  const hiddenTaskCount = Math.max(filteredTasks.length - 5, 0);
  const visibleTasks = showAll ? filteredTasks : filteredTasks.slice(0, 5);

  function selectFilter(nextFilter: GenerationRecordFilter) {
    setFilter(nextFilter);
    setShowAll(false);
  }

  return (
    <div style={{ display: active ? "block" : "none" }}>
      <div className="card-title-row"><div><h2 id="tasks">生成记录</h2><p className="muted">统一管理所有视频生成任务；最新任务始终在最前面，成功结果可直接预览和下载。</p></div><button type="button" className="btn-primary btn-small" onClick={onRefresh}>同步任务状态</button></div>
      <section className="card">
        <div className="task-head">
          <div className="record-filter-tabs">
            {FILTERS.map(([key, label]) => <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => selectFilter(key)}>{label}<span>{counts[key]}</span></button>)}
          </div>
          <p className="muted">默认展示最近 5 个任务；完成后可直接预览、下载或用同一组参数重新生成。</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>提交时间</th><th>关联分镜</th><th>参数</th><th>进度</th><th>结果</th><th>操作</th></tr></thead>
            <tbody>
              {visibleTasks.length ? visibleTasks.map(task => {
                const taskAsset = assets.find(asset => asset.shotId === task.shotId && isHttpVideoUrl(asset.videoUrl));
                const taskVideoUrl = task.videoUrl || taskAsset?.videoUrl;
                const taskVideoId = taskAsset?.providerTaskId || task.providerTaskId;
                const profileId = task.apiProfile?.id || activeApiProfile?.id;
                const canRegenerate = task.status !== "running";
                return (
                  <tr key={task.id}>
                    <td><div>{task.createdAt ? new Date(task.createdAt).toLocaleString() : "历史记录"}</div><small className="muted">{task.id}</small></td>
                    <td><div>#{String(task.shotId).padStart(2, "0")} {task.shotTitle}</div><small className="muted">{taskSnapshotText(task)}</small></td>
                    <td>{task.provider}</td>
                    <td>{taskStatusTag(task.status)}</td>
                    <td>
                      {task.result}
                      {taskVideoUrl && <div className="task-result-video"><video src={proxiedVideoUrl({ url: taskVideoUrl, taskId: taskVideoId, profileId })} controls preload="metadata" /><div className="task-video-actions"><a href={proxiedVideoUrl({ url: taskVideoUrl, taskId: taskVideoId, profileId })} target="_blank" rel="noreferrer">新窗口打开</a><a href={proxiedVideoUrl({ url: taskVideoUrl, taskId: taskVideoId, profileId, download: true })}>下载视频</a></div></div>}
                    </td>
                    <td>
                      <div className="task-row-actions">
                        <button type="button" className="btn-ghost btn-small" onClick={() => onRerun(task)} disabled={!canRegenerate}>直接重新生成</button>
                        <button type="button" className="btn-ghost btn-small" onClick={() => onEdit(task)} disabled={!canRegenerate}>编辑后重新生成</button>
                        {task.status === "done" && <button type="button" className={`btn-ghost btn-small ${task.rating === "satisfied" ? "active" : ""}`} onClick={() => onFeedback(task, "satisfied")}>满意</button>}
                        {task.status === "done" && <button type="button" className={`btn-ghost btn-small ${task.rating === "unsatisfied" ? "active" : ""}`} onClick={() => onFeedback(task, "unsatisfied")}>需改进</button>}
                        <button type="button" className="btn-danger btn-small" onClick={() => onDelete(task.id)} disabled={task.status === "running" || task.status === "pending"}>删除</button>
                      </div>
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={6}><div className="empty">{filter === "all" ? "暂无生成记录。请先到视频工作台提交任务。" : "当前筛选下暂无生成记录。"}</div></td></tr>}
            </tbody>
          </table>
        </div>
        {hiddenTaskCount > 0 && <button type="button" className="collapse-toggle" onClick={() => setShowAll(value => !value)}>{showAll ? "收起" : `展开全部 ${hiddenTaskCount}`}</button>}
      </section>
    </div>
  );
}
