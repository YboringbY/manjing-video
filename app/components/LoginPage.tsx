import { SiteFiling } from "./SiteFiling";

type LoginPageProps = {
  account: string;
  password: string;
  showPassword: boolean;
  message: string;
  isLoggingIn: boolean;
  onAccountChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onForgotPassword: () => void;
  onSubmit: () => void;
};

export function LoginPage(props: LoginPageProps) {
  return (
    <div className="login-shell">
      <section className="login-marketing">
        <div className="login-glow" />
        <div className="login-copy">
          <div className="login-brand"><img className="login-brand-logo" src="/brand/guoran-manjing-logo-display.svg" alt="果然漫镜" width="316" height="100" /></div>
          <h1>一镜成片。<br />高效开拍。</h1>
          <p>让剧本、分镜、素材与 AI 生成汇入同一条创作管线，快速完成短剧视频生产。</p>
          <div className="login-tags"><span>团队协作</span><span>实时生成</span><span>智能分镜</span><span>专业管线</span></div>
        </div>
      </section>
      <section className="login-panel-wrap">
        <div className="login-card">
          <img className="login-card-mark" src="/brand/guoran-manjing-mark.svg" alt="" width="54" height="60" />
          <h2>账号登录</h2>
          <div className="login-form">
            <label>账号</label>
            <div className="login-input"><input value={props.account} onChange={event => props.onAccountChange(event.target.value)} placeholder="输入您的账号" /></div>
            <div className="login-label-row"><label>密码</label><button onClick={props.onForgotPassword}>忘记密码?</button></div>
            <div className="login-input login-password-input">
              <input type={props.showPassword ? "text" : "password"} value={props.password} onChange={event => props.onPasswordChange(event.target.value)} placeholder="输入您的密码" onKeyDown={event => { if (event.key === "Enter") props.onSubmit(); }} />
              <button type="button" aria-label={props.showPassword ? "隐藏密码" : "显示密码"} onClick={props.onTogglePassword}>{props.showPassword ? "◉" : "◎"}</button>
            </div>
            {props.message && <p className="login-message">{props.message}</p>}
            <button type="button" className="login-submit" onClick={props.onSubmit} disabled={props.isLoggingIn}>{props.isLoggingIn ? "正在进入..." : "进入工作空间"} <span>→</span></button>
          </div>
        </div>
        <SiteFiling variant="login" />
      </section>
    </div>
  );
}
