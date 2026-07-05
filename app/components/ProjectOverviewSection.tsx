"use client";

import { ApiProfile, AppState, WorkspaceSection } from "./types";

type OverviewStats = {
  total: number;
  done: number;
  failed: number;
  running: boolean;
  percent: number;
  totalDuration: number;
  completedAssets: number;
  runningTasks: number;
  failedTasks: number;
};

type OverviewNextAction = {
  label: string;
  section: WorkspaceSection;
  description: string;
};

type ProjectOverviewSectionProps = {
  active: boolean;
  state: AppState;
  stats: OverviewStats;
  activeApiProfile?: ApiProfile;
  nextAction: OverviewNextAction;
  onSelectSection: (section: WorkspaceSection) => void;
};

export function ProjectOverviewSection({
  active,
  state,
  stats,
  activeApiProfile,
  nextAction,
  onSelectSection
}: ProjectOverviewSectionProps) {
  return (
    <section id="overview" className="overview-page" style={active ? { display: "grid" } : { display: "none" }}>
      <div className="overview-head card">
        <div>
          <div className="pills"><span className="pill green">{stats.total && stats.done === stats.total ? "可交付" : "制作中"}</span><span className="pill">{state.project.type}</span><span className="pill">{activeApiProfile ? "生成配置已就绪" : "生成配置待完善"}</span></div>
          <h1>{state.project.name}</h1>
          <p>{state.project.script ? "当前项目已进入生产流程。概览只展示有明确数据来源的信息：剧本、分镜、素材、任务和交付。" : "当前项目还没有剧本。建议先导入剧本，再创建分镜并生成视频。"}</p>
        </div>
        <div className="overview-progress">
          <span>交付进度</span>
          <strong>{stats.percent}%</strong>
          <div className="progress"><b style={{ width: `${stats.percent}%` }} /></div>
          <small>{stats.done}/{stats.total} 条分镜已有可预览视频</small>
        </div>
      </div>

      <section className="overview-flow card">
        <div className="card-title-row"><div><h2>生产链路</h2><p className="muted">项目概览按真实工作顺序组织：剧本先定义内容，分镜承接剧本，素材辅助生成，任务产生视频，最后进入交付。</p></div><button className="btn-primary btn-small" onClick={() => onSelectSection(nextAction.section)}>{nextAction.label}</button></div>
        <div className="overview-flow-grid">
          <div className={state.project.script ? "done" : "pending"}><span>1</span><strong>剧本</strong><em>{state.project.script ? "已导入" : "未导入"}</em></div>
          <div className={state.shots.length ? "done" : "pending"}><span>2</span><strong>分镜</strong><em>{state.shots.length} 条</em></div>
          <div className={state.materials.length ? "done" : "pending"}><span>3</span><strong>素材</strong><em>{state.materials.length} 个</em></div>
          <div className={state.tasks.length ? "done" : "pending"}><span>4</span><strong>生成记录</strong><em>{state.tasks.length} 条</em></div>
          <div className={stats.done ? "done" : "pending"}><span>5</span><strong>交付视频</strong><em>{stats.done} 条</em></div>
        </div>
      </section>

      <section className="overview-action-row">
        <div className="card overview-next-card">
          <h2>下一步</h2>
          <strong>{nextAction.label}</strong>
          <p className="muted">{nextAction.description}</p>
          <button className="btn-primary" onClick={() => onSelectSection(nextAction.section)}>进入对应工作台</button>
          <div className="overview-risk-list"><span className={activeApiProfile ? "ok" : "warn"}>{activeApiProfile ? "模型渠道已配置" : "未配置模型渠道"}</span><span className={stats.failed || stats.failedTasks ? "warn" : "ok"}>{stats.failed || stats.failedTasks ? `${stats.failed + stats.failedTasks} 个失败项需要处理` : "暂无失败任务"}</span></div>
        </div>
      </section>

      <section className="overview-metrics card">
        <div><span>剧本</span><strong>{state.project.script ? "已导入" : "未导入"}</strong></div>
        <div><span>分镜</span><strong>{stats.total}</strong></div>
        <div><span>素材</span><strong>{state.materials.length}</strong></div>
        <div><span>任务</span><strong>{state.tasks.length}</strong></div>
        <div><span>可预览视频</span><strong>{stats.done}</strong></div>
        <div><span>预计时长</span><strong>{stats.totalDuration}秒</strong></div>
      </section>
    </section>
  );
}
