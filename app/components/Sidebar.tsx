"use client";

import { Project, WorkspaceSection } from "./types";

type SidebarProps = {
  activeSection: WorkspaceSection;
  currentProjectId: number;
  currentProject: Project;
  projects: Project[];
  projectSwitcherOpen: boolean;
  canManageMembers: boolean;
  canManageApiProfiles: boolean;
  onToggleProjectSwitcher: () => void;
  onSwitchProject: (project: Project) => void;
  onSelectSection: (section: WorkspaceSection) => void;
};

const projectNav: [WorkspaceSection, string][] = [
  ["project-home", "⌂ 项目列表"],
  ["overview", "▦ 项目概览"]
];

const workspaceNav: [WorkspaceSection, string][] = [
  ["script", "▤ 剧本工作台"],
  ["image-workbench", "▧ 生图工作台"],
  ["shots", "▥ 视频工作台"],
  ["tasks", "◎ 生成记录"]
];

const assetNav: [WorkspaceSection, string][] = [
  ["material-assets", "◈ 素材库"]
];

export function Sidebar({
  activeSection,
  currentProjectId,
  currentProject,
  projects,
  projectSwitcherOpen,
  canManageMembers,
  canManageApiProfiles,
  onToggleProjectSwitcher,
  onSwitchProject,
  onSelectSection
}: SidebarProps) {
  const managementNav: [WorkspaceSection, string][] = [
    ...(canManageMembers ? [["members", "▤ 人员管理"] as [WorkspaceSection, string]] : []),
    ...(canManageApiProfiles ? [["channel-management", "◎ 模型渠道管理"] as [WorkspaceSection, string]] : [])
  ];

  function renderNav(items: [WorkspaceSection, string][]) {
    return items.map(([section, label]) => (
      <button key={section} className={activeSection === section ? "active" : ""} onClick={() => onSelectSection(section)}>{label}</button>
    ));
  }

  return (
    <aside>
      <div className="brand"><div className="logo">漫</div>漫镜视频</div>
      <button className="workspace" onClick={onToggleProjectSwitcher}>
        <small>当前项目 · 点击切换</small>
        <strong>{currentProject.name}</strong>
        <span>{currentProject.type} ▾</span>
      </button>
      {projectSwitcherOpen && <div className="project-list project-list-floating">
        <small>选择项目</small>
        {projects.map(project => (
          <button key={project.id} className={project.id === currentProjectId ? "active" : ""} onClick={() => onSwitchProject(project)}>
            <span>{project.name}</span>
            <em>{project.type}</em>
          </button>
        ))}
      </div>}
      <nav className="workspace-nav">
        <div className="nav-group-label">项目</div>
        {renderNav(projectNav)}
        <div className="nav-group-label">工作台</div>
        {renderNav(workspaceNav)}
        <div className="nav-group-label">资产</div>
        {renderNav(assetNav)}
        {managementNav.length > 0 && <div className="nav-group-label">设置与管理</div>}
        {renderNav(managementNav)}
      </nav>
    </aside>
  );
}
