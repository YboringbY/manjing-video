"use client";

import { Project, ProjectStates } from "./types";

type ProjectListSectionProps = {
  currentProjectId: number;
  projects: Project[];
  projectStates: ProjectStates;
  visible: boolean;
  onCreateProject: () => void;
  onSwitchProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
};

export function ProjectListSection({
  currentProjectId,
  projects,
  projectStates,
  visible,
  onCreateProject,
  onSwitchProject,
  onDeleteProject
}: ProjectListSectionProps) {
  return (
    <section id="project-home" className="project-home card" style={{ display: visible ? "block" : "none" }}>
      <div className="project-home-head">
        <div><h2>项目列表</h2><p className="muted">切换当前项目，或新建 AI 漫剧 / AI 真人剧项目。</p></div>
        <button className="btn-primary" onClick={onCreateProject}>新建项目</button>
      </div>
      <div className="project-home-grid">
        {projects.map(project => {
          const itemState = projectStates[project.id];
          return <div key={project.id} className={`project-home-card ${project.id === currentProjectId ? "active" : ""}`}>
            <button className="project-home-card-main" onClick={() => onSwitchProject(project)}>
              <span>{project.id === currentProjectId ? "当前编辑" : "点击进入"}</span>
              <strong>{project.name}</strong>
              <em>{project.type}</em>
              <small>{itemState?.shots.length || 0} 条分镜 · {itemState?.materials.length || 0} 个素材 · {itemState?.tasks.length || 0} 个任务</small>
            </button>
            <div className="project-home-card-actions">
              <button className="btn-ghost btn-small" onClick={() => onSwitchProject(project)}>进入</button>
              <button className="btn-danger btn-small" onClick={() => onDeleteProject(project)} disabled={projects.length <= 1}>删除</button>
            </div>
          </div>;
        })}
      </div>
    </section>
  );
}
