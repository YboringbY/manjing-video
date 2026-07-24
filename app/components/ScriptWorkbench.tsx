"use client";

import { useState } from "react";

type ScriptWorkbenchProps = {
  active: boolean;
  theme: string;
  characters: string;
  episodeCount: string;
  script: string;
  savedScript: string;
  textModels: string[];
  selectedTextModel: string;
  optimizationNote: string;
  outline: string;
  episodeSplit: string;
  onThemeChange: (value: string) => void;
  onCharactersChange: (value: string) => void;
  onEpisodeCountChange: (value: string) => void;
  onScriptChange: (value: string) => void;
  onTextModelChange: (value: string) => void;
  onGenerateDraft: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onOptimize: () => void | Promise<void>;
  onSplit: () => void | Promise<void>;
};

export function ScriptWorkbench({
  active,
  theme,
  characters,
  episodeCount,
  script,
  savedScript,
  textModels,
  selectedTextModel,
  optimizationNote,
  outline,
  episodeSplit,
  onThemeChange,
  onCharactersChange,
  onEpisodeCountChange,
  onScriptChange,
  onTextModelChange,
  onGenerateDraft,
  onSave,
  onOptimize,
  onSplit
}: ScriptWorkbenchProps) {
  const [showFullScript, setShowFullScript] = useState(false);
  const scriptTooLong = savedScript.length > 220;
  const scriptPreview = showFullScript || !scriptTooLong ? savedScript : `${savedScript.slice(0, 220)}...`;

  function importScript(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => onScriptChange(String(event.target?.result || ""));
    reader.readAsText(file);
  }

  return (
    <section id="script" className="card script-workbench" style={{ display: active ? "block" : "none" }}>
      <div className="asset-workspace-head"><div><h2>剧本工作台</h2><p className="muted">先输入故事想法生成初稿；当前剧本正文可以手动编辑、导入文件、保存到项目，并继续优化或拆分。</p></div><span className="source-pill internal">文字处理</span></div>
      <div className="form">
        <section className="api-profile-panel">
          <div className="card-title-row"><div><h2 style={{ marginTop: 0 }}>生成输入</h2><p className="muted">用于生成初稿；不会自动保存为项目剧本。</p></div></div>
          <div className="script-core-grid">
            <div><label>故事想法</label><textarea value={theme} onChange={event => onThemeChange(event.target.value)} placeholder="例如：被替嫁的女主重回豪门，发现男主一直在暗中保护她。" /></div>
            <div><label>主要人物</label><textarea value={characters} onChange={event => onCharactersChange(event.target.value)} placeholder="可选。写清主要人物、关系和反差；不填时系统会根据故事想法补全。" /></div>
            <div><label>目标集数</label><input inputMode="numeric" value={episodeCount} onChange={event => onEpisodeCountChange(event.target.value.replace(/[^\d]/g, ""))} placeholder="可选" /></div>
            {textModels.length > 0 && <div><label>文字处理模型</label><select value={selectedTextModel} onChange={event => onTextModelChange(event.target.value)}>{textModels.map(model => <option key={model} value={model}>{model}</option>)}</select></div>}
          </div>
          <div className="actions"><button type="button" className="btn-primary" onClick={onGenerateDraft}>生成初稿</button></div>
        </section>
        <section className="api-profile-panel">
          <div className="card-title-row"><div><h2 style={{ marginTop: 0 }}>当前剧本正文</h2><p className="muted">生成初稿、导入文件或手动编辑都会更新这里；点击保存后写入当前项目。</p></div><input aria-label="导入剧本文件" type="file" accept=".txt,.md,.doc,.docx" onChange={event => { importScript(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div>
          <div><textarea className="batch-prompt" value={script} onChange={event => onScriptChange(event.target.value)} placeholder="这里是当前项目的剧本正文。可以直接粘贴完整剧本，也可以先在上方生成初稿。" /></div>
          <div className="actions"><button type="button" className="btn-primary" onClick={onSave}>保存到项目</button><button type="button" className="btn-ghost" onClick={onOptimize}>优化当前正文</button><button type="button" className="btn-ghost" onClick={onSplit}>生成大纲 / 单集拆分</button><button type="button" className="btn-ghost" onClick={() => onScriptChange("")}>清空正文</button></div>
        </section>
        {!!optimizationNote && <div className="batch-preview"><strong>处理结果</strong><p>{optimizationNote}</p></div>}
        {!!outline && <div className="script-box">{outline}</div>}
        {!!episodeSplit && <div className="script-box">{episodeSplit}</div>}
        <div className="script-box">{scriptPreview || "当前项目还没有保存剧本。"}</div>
        {scriptTooLong && <button type="button" className="collapse-toggle" onClick={() => setShowFullScript(value => !value)}>{showFullScript ? "收起" : "展开全部剧本"}</button>}
      </div>
    </section>
  );
}
