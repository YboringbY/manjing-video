type GeneratedPromptModalProps = {
  open: boolean;
  prompt: string;
  onClose: () => void;
  onPromptChange: (prompt: string) => void;
  onSave: () => void | Promise<void>;
};

export function GeneratedPromptModal({ open, prompt, onClose, onPromptChange, onSave }: GeneratedPromptModalProps) {
  return (
    <div className={`modal generated-prompt-modal ${open ? "open" : ""}`} onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head"><h2>生成提示词</h2><button type="button" className="btn-ghost btn-small" onClick={onClose}>关闭</button></div>
        <div className="form"><div><label>提示词内容</label><textarea style={{ minHeight: 180 }} value={prompt} onChange={event => onPromptChange(event.target.value)} /></div><button type="button" className="btn-primary" onClick={onSave}>保存到分镜与素材库</button><p className="muted">保存后会写入当前分镜提示词，并出现在素材库的提示词分类。</p></div>
      </div>
    </div>
  );
}
