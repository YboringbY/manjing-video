import { MemberRole } from "./types";

export type MemberRecord = { id: string; account: string; role: MemberRole; status: "active" | "disabled"; displayName?: string };

type MembersSectionProps = {
  visible: boolean; users: MemberRecord[]; currentAccount: string | null; currentRole: MemberRole; canManageMembers: boolean;
  editorOpen: boolean; editingAccount: string; accountDraft: string; nameDraft: string; passwordDraft: string; roleDraft: MemberRole; roleOptions: MemberRole[];
  onOpenEditor: () => void; onEditUser: (user: MemberRecord) => void; onStatusChange: (account: string, status: MemberRecord["status"]) => void;
  onCloseEditor: () => void; onSave: () => void; onAccountDraftChange: (value: string) => void; onNameDraftChange: (value: string) => void;
  onPasswordDraftChange: (value: string) => void; onRoleDraftChange: (value: MemberRole) => void;
};

function roleLabel(role: MemberRole) {
  if (role === "super_admin") return "系统管理员";
  if (role === "tenant_admin") return "管理员";
  return "用户";
}

function roleScope(role: MemberRole) {
  if (role === "super_admin") return "平台配置、租户管理与全部功能";
  if (role === "tenant_admin") return "本租户成员管理与生产功能";
  return "项目生产功能";
}

function canManageTarget(operatorRole: MemberRole, targetRole: MemberRole) {
  return operatorRole === "super_admin" || (operatorRole === "tenant_admin" && targetRole === "user");
}

export function MembersSection(props: MembersSectionProps) {
  return (
    <section className="card" style={{ display: props.visible ? "block" : "none" }}>
      <div className="asset-workspace-head"><div><h2>人员管理</h2><p className="muted">系统管理员管理平台配置；管理员维护本租户成员；用户负责日常生产操作。</p></div><button className="btn-primary" onClick={props.onOpenEditor} disabled={!props.canManageMembers}>新增人员</button></div>
      <div className="member-role-grid"><div className="member-role-card"><strong>系统管理员</strong><p>产品提供商最高权限，管理平台 API 配置和后续租户能力。</p></div><div className="member-role-card"><strong>管理员</strong><p>租户管理员，维护本租户成员和团队生产流程。</p></div><div className="member-role-card"><strong>用户</strong><p>使用剧本、素材、分镜、视频生成和资产查看功能。</p></div></div>
      <div className="table-wrap" style={{ marginTop: 18 }}><table className="table"><thead><tr><th>账号</th><th>显示名</th><th>角色</th><th>状态</th><th>权限范围</th><th>操作</th></tr></thead><tbody>{props.users.map(user => {
        const manageable = props.canManageMembers && canManageTarget(props.currentRole, user.role);
        return <tr key={user.account}><td>{user.account}</td><td>{user.displayName || user.account}</td><td>{roleLabel(user.role)}</td><td><span className={user.status === "active" ? "tag done" : "tag pending"}>{user.status === "active" ? "启用" : "停用"}</span></td><td>{roleScope(user.role)}</td><td><button className="btn-ghost btn-small" disabled={!manageable || user.status !== "active"} onClick={() => props.onEditUser(user)}>编辑</button><button className={user.status === "active" ? "btn-danger btn-small" : "btn-ghost btn-small"} disabled={!manageable || (user.account === props.currentAccount && user.status === "active")} onClick={() => props.onStatusChange(user.account, user.status === "active" ? "disabled" : "active")}>{user.status === "active" ? "停用" : "启用"}</button></td></tr>;
      })}</tbody></table></div>
      {props.editorOpen && <div className="api-profile-panel">
        <div className="asset-workspace-head"><div><h2>{props.editingAccount ? "编辑人员" : "新增人员"}</h2><p className="muted">新人员需要设置初始密码；编辑已有人员时密码可留空。</p></div><button className="btn-ghost btn-small" onClick={props.onCloseEditor}>取消</button></div>
        <div className="script-core-grid"><div><label>成员账号</label><input value={props.accountDraft} disabled={Boolean(props.editingAccount)} onChange={event => props.onAccountDraftChange(event.target.value)} placeholder="例如 zhangsan" /></div><div><label>显示名称</label><input value={props.nameDraft} onChange={event => props.onNameDraftChange(event.target.value)} placeholder="输入显示名称" /></div><div><label>初始/重置密码</label><input type="password" value={props.passwordDraft} onChange={event => props.onPasswordDraftChange(event.target.value)} placeholder="新成员必填；编辑成员可留空" /></div><div><label>成员角色</label><select value={props.roleDraft} onChange={event => props.onRoleDraftChange(event.target.value as MemberRole)}>{props.roleOptions.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></div></div>
        <div className="actions"><button className="btn-primary" onClick={props.onSave} disabled={!props.canManageMembers}>保存人员</button><button className="btn-ghost" onClick={props.onCloseEditor}>取消</button></div>
      </div>}
    </section>
  );
}
