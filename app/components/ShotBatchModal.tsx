type ShotBatchModalProps = {
  open: boolean;
  targetDuration: number;
  prompt: string;
  onClose: () => void;
  onTargetDurationChange: (duration: number) => void;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void | Promise<void>;
};

export function ShotBatchModal({ open, targetDuration, prompt, onClose, onTargetDurationChange, onPromptChange, onSubmit }: ShotBatchModalProps) {
  return (
    <div className={`modal shot-batch-modal ${open ? "open" : ""}`} onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal-card modal-card-wide">
        <div className="modal-head"><h2>提示词拆分分镜</h2><button type="button" className="btn-ghost btn-small" onClick={onClose}>关闭</button></div>
        <div className="form">
          <div><label>目标总时长</label><select value={targetDuration} onChange={event => onTargetDurationChange(Number(event.target.value))}><option value="6">6s</option><option value="9">9s</option><option value="12">12s</option></select></div>
          <div><label>完整视频提示词</label><textarea className="batch-prompt" value={prompt} onChange={event => onPromptChange(event.target.value)} placeholder="粘贴一整段视频提示词。系统会自动拆成 2-7 个镜头，并保存为分镜列表；不可拆分时会按上方目标总时长生成一条完整分镜。" /></div>
          <div className="batch-preview"><strong>拆分结果会进入分镜列表</strong><p>镜头01就是拆分后的第一段，不会把整段提示词原样保留。支持 0-3秒 时间轴，也支持无时间轴长文本自动拆分。不可拆分时按 6s/9s/12s 完整生成一条分镜。</p></div>
          <button type="button" className="btn-primary" onClick={onSubmit}>生成分镜</button>
        </div>
      </div>
    </div>
  );
}
