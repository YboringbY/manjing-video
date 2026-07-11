export type AuditLogRecord = { id: number; action: string; targetType: string; targetId?: string | null; result: string; actorAccount?: string | null; ip?: string | null; metadata?: Record<string, unknown> | null; createdAt: string };

type AuditLogsSectionProps = {
  visible: boolean; logs: AuditLogRecord[]; message: string; actorFilter: string; resultFilter: string; loading: boolean;
  onActorFilterChange: (value: string) => void; onResultFilterChange: (value: string) => void; onRefresh: () => void;
};

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "auth.login": "登录", "api_profile.create": "新增渠道", "api_profile.update": "编辑渠道", "api_profile.activate": "切换渠道", "api_profile.delete": "删除渠道",
    "user.create": "新增成员", "user.update": "更新成员", "user.disable": "停用成员", "project.delete": "删除项目", "asset.upload": "上传素材",
    "image.generate": "生成图片", "script.generate": "生成剧本", "material.delete": "删除素材", "video_task.create": "创建视频任务", "video_task.status": "同步视频状态"
  };
  return labels[action] || action;
}

function resultTag(result: string) {
  if (result === "success") return <span className="tag done">成功</span>;
  return <span className="tag pending">{result === "blocked" ? "拦截" : "失败"}</span>;
}

function metadataText(metadata?: Record<string, unknown> | null) {
  if (!metadata) return "-";
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return entries.length ? entries.slice(0, 4).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ") : "-";
}

export function AuditLogsSection(props: AuditLogsSectionProps) {
  return (
    <section className="card" style={{ display: props.visible ? "block" : "none" }}>
      <div className="asset-workspace-head"><div><h2>审计日志</h2><p className="muted">记录登录、成员、渠道、项目、素材和生成调用等关键操作。</p></div><button className="btn-primary" onClick={props.onRefresh} disabled={props.loading}>{props.loading ? "刷新中..." : "刷新"}</button></div>
      <div className="script-core-grid" style={{ marginTop: 12 }}><div><label>操作者账号</label><input value={props.actorFilter} onChange={event => props.onActorFilterChange(event.target.value)} placeholder="可选，输入账号筛选" /></div><div><label>结果</label><select value={props.resultFilter} onChange={event => props.onResultFilterChange(event.target.value)}><option value="">全部</option><option value="success">成功</option><option value="failure">失败</option><option value="blocked">拦截</option></select></div><div className="actions" style={{ alignItems: "end" }}><button className="btn-ghost" onClick={props.onRefresh} disabled={props.loading}>应用筛选</button></div></div>
      {props.message && <div className="api-active-banner">{props.message}</div>}
      <div className="table-wrap" style={{ marginTop: 14 }}><table className="table"><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th><th>结果</th><th>IP</th><th>摘要</th></tr></thead><tbody>{props.logs.length ? props.logs.map(log => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString()}</td><td>{log.actorAccount || "-"}</td><td>{actionLabel(log.action)}</td><td>{log.targetType}{log.targetId ? ` · ${log.targetId}` : ""}</td><td>{resultTag(log.result)}</td><td>{log.ip || "-"}</td><td className="muted">{metadataText(log.metadata)}</td></tr>) : <tr><td colSpan={7}><div className="empty">暂无审计记录。</div></td></tr>}</tbody></table></div>
    </section>
  );
}
