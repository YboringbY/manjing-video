type SiteFilingProps = {
  variant?: "login" | "workspace";
};

export const FILING_NUMBER = "浙ICP备2026053932号-1";

export function SiteFiling({ variant = "workspace" }: SiteFilingProps) {
  return (
    <footer className={`site-filing site-filing--${variant}`}>
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{FILING_NUMBER}</a>
    </footer>
  );
}
