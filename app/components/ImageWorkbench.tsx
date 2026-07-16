"use client";

import { useState } from "react";
import type { AspectRatio, ImageQuality, MaterialAsset } from "./types";

type ImageWorkbenchProps = {
  active: boolean;
  prompt: string;
  shotPrompt: string;
  models: string[];
  model: string;
  quality: ImageQuality;
  width: number;
  height: number;
  ratio: AspectRatio;
  count: number;
  referenceMaterial?: MaterialAsset;
  referencePreviewUrl?: string;
  generatedImages: MaterialAsset[];
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onQualityChange: (value: ImageQuality) => void;
  onSizeChange: (width: number, height: number) => void;
  onRatioChange: (value: AspectRatio) => void;
  onCountChange: (value: number) => void;
  onOpenReferencePicker: () => void;
  onRemoveReference: () => void;
  onGenerate: () => void;
  onPreview: (material: MaterialAsset) => void;
  onReuse: (material: MaterialAsset) => void;
};

const EXAMPLE_PROMPT = "电影感角色参考图，精致五官，统一服装设定，干净背景，适合短剧分镜制作";
const QUALITIES: ImageQuality[] = ["auto", "high", "medium", "low"];
const RATIOS: AspectRatio[] = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "auto"];
const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function qualityLabel(quality: ImageQuality) {
  if (quality === "auto") return "自动";
  if (quality === "high") return "高";
  if (quality === "medium") return "中";
  return "低";
}

export function ImageWorkbench({
  active,
  prompt,
  shotPrompt,
  models,
  model,
  quality,
  width,
  height,
  ratio,
  count,
  referenceMaterial,
  referencePreviewUrl,
  generatedImages,
  isGenerating,
  onPromptChange,
  onModelChange,
  onQualityChange,
  onSizeChange,
  onRatioChange,
  onCountChange,
  onOpenReferencePicker,
  onRemoveReference,
  onGenerate,
  onPreview,
  onReuse
}: ImageWorkbenchProps) {
  const [showAllResults, setShowAllResults] = useState(false);
  const hiddenResultCount = Math.max(generatedImages.length - 5, 0);
  const visibleResults = showAllResults ? generatedImages : generatedImages.slice(0, 5);

  return (
    <section id="image-workbench" className="image-workbench card" style={{ display: active ? "block" : "none" }}>
      <div className="image-head"><div><h2>生图工作台</h2><p className="muted">填写提示词、选择模型与尺寸，生成图片素材后可用于视频生成参考。</p></div></div>
      <div className="image-form-block">
        <label>提示词</label>
        <div className="image-prompt-tools">
          <button type="button" className="btn-ghost btn-small" onClick={() => onPromptChange(shotPrompt)}>复用当前分镜提示词</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => onPromptChange(EXAMPLE_PROMPT)}>套用示例</button>
        </div>
        <textarea className="image-prompt" value={prompt} onChange={event => onPromptChange(event.target.value)} placeholder="描述画面主体、风格、构图、光线和用途" />
      </div>
      <div className="image-form-block">
        <label>参考图</label>
        <div className={`reference-box ${referenceMaterial ? "has-reference" : ""}`}>
          {referenceMaterial
            ? <div className="image-reference-selection">{referencePreviewUrl ? <img src={referencePreviewUrl} alt={referenceMaterial.name} /> : <span>图片</span>}<div><strong>{referenceMaterial.name}</strong><small>将作为本次生图参考</small></div></div>
            : <span>未选择参考图，将使用纯文本生图</span>}
          <button type="button" className="btn-ghost btn-small" onClick={onOpenReferencePicker}>{referenceMaterial ? "更换参考图" : "去素材库选择"}</button>
          {referenceMaterial && <button type="button" className="btn-ghost btn-small" onClick={onRemoveReference}>移除</button>}
        </div>
      </div>
      <div className="image-settings-grid">
        <div><label>模型</label><select value={model} onChange={event => onModelChange(event.target.value)}>{models.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
        <div><label>质量</label><div className="segmented">{QUALITIES.map(item => <button type="button" key={item} className={quality === item ? "active" : ""} onClick={() => onQualityChange(item)}>{qualityLabel(item)}</button>)}</div></div>
        <div><label>尺寸</label><div className="size-row"><input type="number" value={width} onChange={event => onSizeChange(Number(event.target.value), height)} /><span>×</span><input type="number" value={height} onChange={event => onSizeChange(width, Number(event.target.value))} /></div></div>
      </div>
      <div className="image-form-block"><label>宽高比</label><div className="ratio-grid">{RATIOS.map(item => <button type="button" key={item} className={ratio === item ? "active" : ""} onClick={() => onRatioChange(item)}><span className="ratio-icon">▭</span>{item}</button>)}</div></div>
      <div className="image-form-block"><label>生成张数</label><div className="count-grid">{COUNTS.map(item => <button type="button" key={item} className={count === item ? "active" : ""} onClick={() => onCountChange(item)}>{item} 张</button>)}</div></div>
      <button type="button" className="btn-primary image-generate" disabled={isGenerating} onClick={onGenerate}>{isGenerating ? "生成中..." : "开始生成"}</button>
      <div className="image-results">
        <h2>生成结果</h2>
        {visibleResults.length
          ? <div className="material-grid">{visibleResults.map(item => <div className="material-card" key={item.id}><button type="button" className="material-preview" onClick={() => onPreview(item)}>{item.previewUrl ? <img src={item.previewUrl} alt={item.name} /> : <span>图片</span>}</button><strong>{item.name}</strong><p className="muted">{item.width && item.height ? `${item.width}x${item.height}` : ratio}</p><div className="task-video-actions"><span className="reviewed-badge">已入素材库</span><button type="button" className="btn-ghost btn-small" onClick={() => onReuse(item)}>复用参数</button></div></div>)}</div>
          : <div className="empty-result"><div className="empty-ico">▧</div><strong>还没有生成图片</strong><p className="muted">填写提示词并点击“开始生成”，成功后会自动保存到素材库。</p></div>}
        {hiddenResultCount > 0 && <button type="button" className="collapse-toggle" onClick={() => setShowAllResults(value => !value)}>{showAllResults ? "收起" : `展开全部 ${hiddenResultCount}`}</button>}
      </div>
    </section>
  );
}
