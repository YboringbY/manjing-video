"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import type { LibraryFilter, MaterialAsset, MaterialKind, MaterialRole } from "./types";
import {
  filterProjectMaterials,
  filterSharedMaterials,
  isSmallVideoReferenceImage,
  materialApiUrl,
  materialDimensionText,
  materialKindLabel,
  materialLibraryCounts,
  materialPreviewUrl,
  materialRoleOptions,
  materialUploadAccept
} from "@/lib/material-library";

type AssetScope = "project" | "shared";

type MaterialLibrarySectionProps = {
  active: boolean;
  scope: AssetScope;
  activeTab: MaterialKind;
  projectMaterials: MaterialAsset[];
  sharedMaterials: MaterialAsset[];
  selectedMaterialIds: number[];
  selectingImageReference: boolean;
  imageReferenceMaterialId: number | null;
  materialName: string;
  materialRole: MaterialRole;
  materialMessage: string;
  isUploading: boolean;
  shareUploadToTeam: boolean;
  onScopeChange: (scope: AssetScope) => void;
  onTabChange: (kind: MaterialKind) => void;
  onCancelImageReference: () => void;
  onOpenPromptDialog: () => void;
  onOpenImageWorkbench: () => void;
  onSelectImageReference: (material: MaterialAsset) => void;
  onToggleMaterial: (id: number) => void;
  onPreview: (material: MaterialAsset) => void;
  onRename: (material: MaterialAsset, name: string) => Promise<boolean>;
  onDelete: (id: number) => void;
  onToggleSharedMaterial: (material: MaterialAsset) => void;
  onMaterialNameChange: (name: string) => void;
  onMaterialRoleChange: (role: MaterialRole) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onShareUploadChange: (shared: boolean) => void;
};

const SCOPE_TABS: Array<[AssetScope, string]> = [["project", "当前项目"], ["shared", "共享素材"]];
const MATERIAL_TABS: Array<[MaterialKind, string]> = [["image", "图片"], ["video", "视频"], ["audio", "音频"], ["sd2", "提示词"]];
const LIBRARY_FILTERS: Array<[LibraryFilter, string]> = [["all", "全部"], ["image", "图片"], ["video", "视频"], ["audio", "音频"], ["prompt", "提示词"]];

function emptyProjectMessage(kind: MaterialKind) {
  if (kind === "image") return "图片分类暂无素材。可以上传本地图片，或到生图工作台生成图片。";
  if (kind === "video") return "视频分类暂无素材。可以上传本地视频。";
  if (kind === "audio") return "音频分类暂无素材。可以上传本地音频。";
  return "提示词分类暂无内容。可以生成提示词并保存到素材库。";
}

function MaterialPreview({ material }: { material: MaterialAsset }) {
  const previewUrl = materialPreviewUrl(material);
  if (material.kind === "image" && previewUrl) return <img src={previewUrl} alt={material.name} />;
  if (material.kind === "video" && previewUrl) return <video src={previewUrl} muted preload="metadata" />;
  if (material.kind === "audio" && previewUrl) return <span>音频</span>;
  return <span>{material.kind === "sd2" ? "提示词" : material.kind}</span>;
}

export function MaterialLibrarySection({
  active,
  scope,
  activeTab,
  projectMaterials,
  sharedMaterials,
  selectedMaterialIds,
  selectingImageReference,
  imageReferenceMaterialId,
  materialName,
  materialRole,
  materialMessage,
  isUploading,
  shareUploadToTeam,
  onScopeChange,
  onTabChange,
  onCancelImageReference,
  onOpenPromptDialog,
  onOpenImageWorkbench,
  onSelectImageReference,
  onToggleMaterial,
  onPreview,
  onRename,
  onDelete,
  onToggleSharedMaterial,
  onMaterialNameChange,
  onMaterialRoleChange,
  onUpload,
  onShareUploadChange
}: MaterialLibrarySectionProps) {
  const [projectSearch, setProjectSearch] = useState("");
  const [sharedFilter, setSharedFilter] = useState<LibraryFilter>("all");
  const [sharedSearch, setSharedSearch] = useState("");
  const [showAllProject, setShowAllProject] = useState(false);
  const [showAllShared, setShowAllShared] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renamingName, setRenamingName] = useState("");

  const filteredProjectMaterials = useMemo(
    () => filterProjectMaterials(projectMaterials, activeTab, projectSearch),
    [activeTab, projectMaterials, projectSearch]
  );
  const filteredSharedMaterials = useMemo(
    () => filterSharedMaterials(sharedMaterials, sharedFilter, sharedSearch),
    [sharedFilter, sharedMaterials, sharedSearch]
  );
  const counts = materialLibraryCounts(projectMaterials, sharedMaterials);
  const visibleProjectMaterials = showAllProject ? filteredProjectMaterials : filteredProjectMaterials.slice(0, 5);
  const visibleSharedMaterials = showAllShared ? filteredSharedMaterials : filteredSharedMaterials.slice(0, 5);
  const hiddenProjectCount = Math.max(filteredProjectMaterials.length - 5, 0);
  const hiddenSharedCount = Math.max(filteredSharedMaterials.length - 5, 0);

  useEffect(() => {
    if (!selectingImageReference) return;
    setProjectSearch("");
    setShowAllProject(false);
  }, [selectingImageReference]);

  function selectTab(kind: MaterialKind) {
    setShowAllProject(false);
    onTabChange(kind);
  }

  function startRename(material: MaterialAsset) {
    setRenamingId(material.id);
    setRenamingName(material.name);
  }

  async function saveRename(material: MaterialAsset) {
    const name = renamingName.trim();
    if (!name) return window.alert("请输入素材名称。");
    if (await onRename(material, name)) {
      setRenamingId(null);
      setRenamingName("");
    }
  }

  return (
    <div style={{ display: active ? "block" : "none" }}>
      <section className="card asset-dynamic-workspace">
        <div className="asset-workspace-head"><div><h2>素材库</h2><p className="muted">当前项目素材 {counts.project} 个；团队共享素材 {counts.shared} 个。</p></div><span className="source-pill internal">{scope === "project" ? "当前项目" : "团队共享"}</span></div>
        {selectingImageReference && <div className="api-active-banner"><strong>正在选择生图参考</strong><small>选择一张可用图片后会自动返回生图工作台。</small><button type="button" className="btn-ghost btn-small" onClick={onCancelImageReference}>取消选择</button></div>}
        <div className="asset-tabs">
          {SCOPE_TABS.map(([key, label]) => <button type="button" key={key} className={scope === key ? "active" : ""} onClick={() => onScopeChange(key)}>{label}</button>)}
        </div>
        {scope === "project" && <div className="asset-tabs">
          {MATERIAL_TABS.map(([key, label]) => <button type="button" key={key} className={activeTab === key ? "active" : ""} onClick={() => selectTab(key)}>{label}</button>)}
        </div>}
        {scope === "project" && <div className="asset-filterbar">
          {activeTab === "sd2" && <button type="button" className="btn-ghost btn-small" onClick={onOpenPromptDialog}>生成提示词</button>}
          {activeTab === "image" && <button type="button" className="btn-ghost btn-small" onClick={onOpenImageWorkbench}>去生图工作台</button>}
          <input value={projectSearch} placeholder="搜索素材名称..." onChange={event => setProjectSearch(event.target.value)} />
          <span className="muted" style={{ marginLeft: "auto" }}>排序</span>
          <select onChange={event => window.alert(`排序方式：${event.target.value}`)}><option>类型</option><option>名称</option><option>创建时间</option></select>
        </div>}
        {scope === "shared" && <div className="asset-filterbar">
          <div className="library-filter"><span>类型</span>{LIBRARY_FILTERS.map(([key, label]) => <button type="button" key={key} className={sharedFilter === key ? "active" : ""} onClick={() => { setSharedFilter(key); setShowAllShared(false); }}>{label}</button>)}</div>
          <input value={sharedSearch} onChange={event => setSharedSearch(event.target.value)} placeholder="搜索共享素材名称..." />
        </div>}
        {scope === "project" && <div className="material-grid">
          {visibleProjectMaterials.length ? visibleProjectMaterials.map(material => {
            const usable = Boolean(materialApiUrl(material));
            const selected = selectingImageReference && imageReferenceMaterialId === material.id || selectedMaterialIds.includes(material.id);
            return <div className={`material-card ${selected ? "selected" : ""}`} key={material.id} onClick={() => selectingImageReference ? onSelectImageReference(material) : onToggleMaterial(material.id)}>
              <div className={`material-preview ${material.kind}`} onClick={event => { event.stopPropagation(); if (material.kind !== "sd2") onPreview(material); }}><MaterialPreview material={material} /></div>
              {renamingId === material.id
                ? <div className="material-rename-row" onClick={event => event.stopPropagation()}><input value={renamingName} onChange={event => setRenamingName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void saveRename(material); if (event.key === "Escape") setRenamingId(null); }} autoFocus /><button type="button" className="btn-primary btn-small" onClick={() => void saveRename(material)}>保存</button><button type="button" className="btn-ghost btn-small" onClick={() => setRenamingId(null)}>取消</button></div>
                : <strong>{material.name}</strong>}
              <p className="muted">{materialKindLabel(material.kind)}{material.source === "generated" ? " / 生图" : material.source === "upload" ? " / 上传" : ""}{materialDimensionText(material) ? ` / ${materialDimensionText(material)}` : ""}{isSmallVideoReferenceImage(material) ? " / 尺寸偏小" : ""}{material.scope === "team" ? " / 团队共享" : " / 项目独享"}</p>
              <span className={usable ? "reviewed-badge" : "local-only-badge"}>{usable ? "可用" : material.kind === "sd2" ? "提示词" : "处理中"}</span>
              <div className="actions">{selectingImageReference
                ? <button type="button" className="btn-primary btn-small" disabled={!usable || material.kind !== "image"} onClick={event => { event.stopPropagation(); onSelectImageReference(material); }}>选为生图参考</button>
                : <><button type="button" className="btn-ghost btn-small" onClick={event => { event.stopPropagation(); startRename(material); }}>重命名</button><button type="button" className="btn-ghost btn-small" onClick={event => { event.stopPropagation(); onToggleMaterial(material.id); }}>{selectedMaterialIds.includes(material.id) ? "取消参考" : "选为参考"}</button><button type="button" className="btn-danger btn-small" onClick={event => { event.stopPropagation(); onDelete(material.id); }}>删除</button></>}
              </div>
            </div>;
          }) : <div className="empty">当前 {emptyProjectMessage(activeTab)}</div>}
        </div>}
        {scope === "shared" && <div className="material-grid">
          {visibleSharedMaterials.map(material => {
            const imported = projectMaterials.some(item => item.id === material.id);
            const selected = selectedMaterialIds.includes(material.id);
            return <div className={`material-card ${selected ? "selected" : ""}`} key={`team-${material.id}`} onClick={() => onToggleSharedMaterial(material)}>
              <div className={`material-preview ${material.kind}`} onClick={event => { event.stopPropagation(); if (material.kind !== "sd2") onPreview(material); }}><MaterialPreview material={material} /></div>
              <strong>{material.name}</strong>
              <p className="muted">{materialKindLabel(material.kind)}{materialDimensionText(material) ? ` / ${materialDimensionText(material)}` : ""}{isSmallVideoReferenceImage(material) ? " / 尺寸偏小" : ""} / 团队共享</p>
              <span className="reviewed-badge">{imported ? "已在当前项目" : "可复用"}</span>
              <p className="muted">来自 {material.sourceProjectName || "项目"} · {material.createdBy || "团队成员"}</p>
              <div className="actions"><button type="button" className="btn-ghost btn-small" onClick={event => { event.stopPropagation(); onToggleSharedMaterial(material); }}>{selected ? "取消参考" : imported ? "选为参考" : "加入并参考"}</button></div>
            </div>;
          })}
          {!visibleSharedMaterials.length && <div className="empty">暂无共享素材。上传素材时勾选“同时加入团队共享”，角色、车辆、场景、道具、音乐等内容就可以在多个项目复用。</div>}
        </div>}
        {scope === "project" && hiddenProjectCount > 0 && <button type="button" className="collapse-toggle" onClick={() => setShowAllProject(value => !value)}>{showAllProject ? "收起" : `展开全部 ${hiddenProjectCount}`}</button>}
        {scope === "shared" && hiddenSharedCount > 0 && <button type="button" className="collapse-toggle" onClick={() => setShowAllShared(value => !value)}>{showAllShared ? "收起" : `展开全部 ${hiddenSharedCount}`}</button>}
      </section>

      {scope === "project" && activeTab !== "sd2" && <section className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>上传到当前项目</h2>
        <div className="form">
          <div><label>素材名称</label><input value={materialName} onChange={event => onMaterialNameChange(event.target.value)} placeholder="留空则使用本地文件名" /></div>
          <div><label>素材类型</label><input value={materialKindLabel(activeTab)} readOnly /></div>
          <div><label>素材角色</label><select value={materialRole} onChange={event => onMaterialRoleChange(event.target.value as MaterialRole)}>{materialRoleOptions(activeTab).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label>选择文件</label><input type="file" accept={materialUploadAccept(activeTab)} onChange={onUpload} disabled={isUploading} /></div>
          <label className="checkbox-line"><input type="checkbox" checked={shareUploadToTeam} onChange={event => onShareUploadChange(event.target.checked)} /> 同时加入团队共享</label>
          <p className="muted">{materialMessage || (shareUploadToTeam ? "上传后会保存到当前项目，也会进入团队共享，供其他项目复用。" : "上传后系统会自动生成素材地址并保存到当前项目，默认项目独享。")}</p>
        </div>
      </section>}
      {scope === "project" && activeTab === "sd2" && <section className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>提示词素材</h2>
        <div className="form"><p className="muted">{materialMessage || "提示词用于整理分镜和生成描述，不需要上传文件。"}</p><button type="button" className="btn-primary" onClick={onOpenPromptDialog}>生成提示词</button></div>
      </section>}
    </div>
  );
}
