# 漫镜视频 Handoff

更新时间：2026-07-12

## 2026-07-12 生图参考图生产发布

- 生产已更新到 `db77ddb`，migration 为 0，业务守恒通过。
- 备份：`/data/backups/manjing-video-db-pre-deploy-20260712-101201.dump`。
- 当前项目 1、素材 10、分镜 16、任务 21、视频资产 4；素材文件 10/10 存在，PM2 online、公网 200、鉴权 401。
- 登录后 smoke 按用户批准的单次例外跳过；需在生产实际生成一张参考图结果，确认渠道支持 `/v1/images/edits`。

## 生图参考图

- 生图工作台已支持从当前项目素材库选择一张可用图片，选择后自动返回并显示预览，可更换或移除。
- 生图 API 只接收素材 ID并验证租户/项目关联；参考图走 `/v1/images/edits`，纯文本走 `/v1/images/generations`。
- 本地文件优先、公网安全 URL 回退，支持 PNG/JPEG/WebP、最大 25MB；跨项目未关联素材会被拦截。

## 2026-07-12 生成记录简化生产发布

- 生产已更新到 `1158fe3`；生成记录不再展示参考素材数量和引用文件名。
- 发布同时包含素材防覆盖和增强发布门禁；待执行 migration 为 0，业务守恒通过。
- 发布备份：`/data/backups/manjing-video-db-pre-deploy-20260712-090721.dump`。
- 当前生产数据：项目 1、素材 10、分镜 16、任务 21、视频资产 4；10 个素材文件存在，PM2 online，公网 200，鉴权 401。
- 登录后 smoke 按用户批准的单次例外跳过，仍需用户刷新确认最终页面。

## 生成记录参考素材展示

- 暂停展示“参考素材 N 个”和“引用：文件名列表”，避免混淆已提交素材与提示词 @ 点名素材。
- 任务快照仍完整保留参考素材，用于直接/编辑后重新生成；生成请求行为不变。

## 发布防回归规则

- 服务端数据数量和 API 成功不能替代 UI 验收；缓存、hydration、数据加载 effect 变更必须用清空 storage 的新浏览器会话验证。
- 项目素材现在既等待工作区同步，又在同项目工作区回包时防止覆盖已加载素材。
- 生产 smoke 强制比较 workspace `materialCount` 与素材 API 数量，并输出逐项目分镜/素材/任务结果。
- 部署默认要求 `PRODUCTION_SMOKE_ACCOUNT / PRODUCTION_SMOKE_PASSWORD`；缺失时在生产变更前阻断。单次跳过必须获得用户明确批准并设置 `PRODUCTION_SMOKE_SKIP_APPROVED=yes`。
- 发布未完成已登录 smoke 和真实浏览器项目/素材/生成记录验收时，不得标记为完整成功。

## 生产素材库显示热修复

- 生产 10 条素材、10 条项目关联和 10 个文件均完整，素材库为空是前端加载竞态，不是再次丢数据。
- 项目素材加载现已等待工作区同步完成，登录/退出会重置同步标志，防止空工作区状态覆盖素材 API 结果。
- TypeScript、生产构建和核心 API 集成已通过；热修复 `b1ae0ec` 已部署，不涉及 migration 或生产数据修改。
- 新备份为 `/data/backups/manjing-video-db-pre-deploy-20260712-012832.dump`；发布后 10 条素材关联和 10 个文件均存在，PM2 online、公网 200、鉴权 401。
- 因未提供生产登录凭证，仍需用户刷新并确认素材库重新显示。

## 2026-07-12 P0/P1 生产发布

- 生产已从 `1b8534a` 更新到 `b628a95 Refactor P1 frontend and video workflows`。
- 待执行 migration 为 0；发布前后业务数量与主键指纹完全一致：项目 1、工作区 1、素材 10、素材关联 10、分镜 15、任务 20、视频资产 3。
- 已验证备份 `/data/backups/manjing-video-db-pre-deploy-20260712-011336.dump`，63KB、PostgreSQL custom archive、111 个目录项。
- PM2 online，公网首页 200，匿名鉴权 401，生产工作区干净。
- 登录后的自动化生产 smoke 因未提供临时凭证而跳过；需要在真实浏览器完成登录、项目内容、素材与视频预览验收。

## P0 稳定性自动化

- `npm run test:core-api`：只允许本机，覆盖项目/分镜 409、共享素材、任务评价和视频资产生命周期，自动清理。
- `npm run smoke:production`：生产只读业务 smoke；凭证通过 `PRODUCTION_SMOKE_ACCOUNT / PRODUCTION_SMOKE_PASSWORD` 临时提供。
- `npm run db:snapshot -- capture|verify <file>`：migration 前后比较业务数量和主键指纹，差异默认阻断。
- `npm run db:verify-backup`：恢复到隔离临时库验证备份计数，默认自动清理。
- 部署脚本已串联备份、预检、停机、守恒检查、migration、重启和健康检查。
- 每次发布必须完成 `docs/P0_RELEASE_CHECKLIST.md`，最终验收必须查看真实浏览器页面。

## P1 代码优化

- 已拆出登录、人员管理和审计日志组件，`app/page.tsx` 从 2731 行降到 2647 行。
- 已统一项目、分镜、素材和视频任务 API 输入校验；超出 PostgreSQL Int 范围的 ID 必须拒绝，不能映射为其他 ID。
- 已把视频创建 payload 与状态解析抽到 `lib/video-generation.ts`、`lib/video-status.ts`，视频创建/状态路由分别缩减到 340/205 行。
- localStorage 不再缓存分镜、任务、视频资产和素材业务副本，服务端规范化表保持唯一权威。
- 本地 `git diff --check`、TypeScript、生产构建和核心 API 集成均通过；临时测试数据已清理。
- P0/P1 已于 2026-07-12 部署到生产 `b628a95`。

## 生产数据事故与强制规则

- `20260710194000_remove_legacy_workspace_payload` 误把生产项目 `id=1 / 短剧团队 Demo` 当演示数据删除，导致 1 个项目、15 个分镜、20 个任务、3 个视频资产、10 个素材短暂不可用。
- 已从发布前备份选择性恢复全部业务数据，账号、渠道、审计和 17 条 migration 状态均保留；10/10 素材文件存在。
- 数据库恢复后曾因前端继续过滤 `id=1 / 短剧团队 Demo` 而页面不可见；相关服务器工作区和 localStorage 过滤已全部删除。恢复验收必须验证最终用户页面。
- 事故详情见 `docs/INCIDENT_2026-07-11_PROJECT_DELETION.md`，生产变更规则见 `docs/PRODUCTION_CHANGE_POLICY.md`。
- 以后任何生产迁移、修复、删除、清理、回填都必须提前向用户说明环境、SQL/迁移、影响表和行数、备份位置、停机与回滚方案，并获得明确批准。
- 正常 Prisma migration 禁止删除业务数据；历史数据清理必须作为独立维护任务。
- 部署前强制执行 `npm run db:preflight`，日常部署使用 `scripts/deploy.sh`，禁止再用 `git reset --hard`。

## 2026-07-11 生产发布

- 业务提交 `c7ffc16` 已推送并部署，主线是结束 `ProjectWorkspace.state` 业务数组双写，改用项目/分镜/任务/视频资产/素材关联的规范化表和细粒度 API。
- 新增 5 条 migration：移除旧工作区业务数组、项目素材关联、项目/分镜版本、任务评价、视频资产自增 ID。
- 已修复恢复审查发现的项目 version 丢失、无 Workspace 的规范化项目不返回、IPv6 内网 URL 漏拦截、客户端伪造 `storagePath` 可触发文件删除、供应商 `/v1/v1` 路径重复等问题。
- 本地 17 条 migration 已全部应用；Prisma validate/generate、TypeScript、生产 build 均通过。
- 已用临时数据实测项目/分镜 409 乐观锁、团队素材跨项目生命周期、文件路径安全和 IPv4/IPv6 内网 URL 拦截，临时业务数据均已清理。
- 生产 17 条 migration 已全部应用，构建通过，PM2 在线，公网首页 200，未登录鉴权 401。
- 生产临时项目已验证项目/分镜乐观锁、规范化读取和删除闭环，测试数据已清理。
- 发布备份位于 `/data/backups/manjing-video-db-pre-c7ffc16-20260711-104650.dump` 和 `/data/backups/manjing-video-code-pre-c7ffc16-20260711-104650.tar.gz`。
- 事故恢复后，当前生产为 1 个项目、1 个工作区、10 个素材、15 个分镜、20 个任务和 3 个视频资产；账号、模型渠道和审计数据正常保留。

## 当前状态

- 项目路径：`/Users/keyang/Desktop/manjing_SaaS/manjing-video`
- 本地开发：`http://localhost:5050`
- 生产入口：`http://118.196.44.191`
- 生产域名 `console.manjingstudio.com` 备案前不要恢复访问。
- 最新生产提交：`1b8534a Show restored production projects`
- 生产 PM2：`manjing-video` online。

本地启动：

```bash
npm run dev -- -p 5050
```

Next chunk/runtime 异常时：

```bash
rm -rf .next
npm run dev -- -p 5050
```

## 产品主线

漫镜视频是短剧团队 AI 视频生产工作台，核心链路是：

```text
登录 -> 项目 -> 剧本 -> 分镜 -> 素材 -> 视频生成 -> 生成记录/预览/下载
```

当前不开放自助注册，账号由管理员创建。

角色：

- `super_admin`：系统管理员，可管理模型渠道、成员、审计等。
- `tenant_admin`：租户管理员，可管理本租户普通用户。
- `user`：生产使用者。

## 数据库状态

已落表：

- `Tenant / User / Membership`
- `ApiProfile`：模型渠道，API Key 加密落库。
- `Material`：素材记录。
- `Project`
- `Shot`
- `VideoTask`
- `VideoAsset`
- `AuditLog`
- `ProjectWorkspace`：兼容工作区快照。

重要现状：

- `ProjectWorkspace.state` 只保留兼容项目状态，不再保存 `shots / tasks / assets / materials` 业务副本。
- `/api/workspaces` GET 从规范化表组装 `project / shots / tasks / assets`。
- 项目、分镜、任务、视频资产和素材关系已使用细粒度 API。

架构 review 共识：

- 方向正确，但需要明确退役 JSON 快照的终点。
- 继续缩减并最终退役 `ProjectWorkspace` 兼容状态。
- 优先完成真实模型生成、素材共享和视频预览下载的生产人工回归。
- `Project.id` 仍由客户端生成随机 Int，短期可接受，长期应改为数据库生成或 cuid。

## 部署流程

GitHub：

```text
https://github.com/YboringbY/manjing-video
```

生产目录：

```text
/opt/manjing-video
```

部署常用流程：

```bash
git push origin main
ssh -i /Users/keyang/Desktop/manjing_SaaS/manjing.pem root@118.196.44.191
cd /opt/manjing-video
git pull --ff-only
npm ci
set -a && . ./.env && set +a
npx prisma migrate deploy
npm run build
pm2 restart manjing-video --update-env
```

注意：

- 不要打印 `.env`、API Key、数据库密码、私钥。
- Prisma CLI 在生产上需要显式加载 `.env`。
- 备案前生产测试只用 IP。

## 近期完成

- `@ 插入到提示词` 已支持图片、视频、音频素材，并按光标位置插入。
- 开始生成后不再清空视频提示词。
- 首尾帧改为从已有参考图片中指定，不再显示单独上传首帧/尾帧入口。
- 素材库支持图片放大、视频预览、音频播放。
- 视频生成记录和结果按最新在前展示。
- 项目、分镜、任务、视频结果已从 JSON 快照拆出规范化表。
- 工作区读取已开始用规范化表回填状态。

## 下一步建议

1. 继续拆分 `app/page.tsx`：优先拆素材库、生图工作台、视频工作台和生成记录，并逐步提取业务 hooks。
2. 明确并完成 `ProjectWorkspace.state` 兼容元数据的最终退役，不再扩大其职责。
3. 为 `lib/api-input.ts`、`lib/video-generation.ts`、`lib/video-status.ts` 建立独立单元测试运行方式。
4. 继续处理客户反馈：生成记录展示引用素材名称、拖拽上传、同 seed/随机 seed 控制。
5. 配置非交互式 ESLint CLI，纳入日常构建验证。

## 常用验证

```bash
npm run build
npx tsc --noEmit
```

生产 smoke：

```bash
curl -I http://118.196.44.191/
curl -i http://118.196.44.191/api/auth/me
ssh -i /Users/keyang/Desktop/manjing_SaaS/manjing.pem root@118.196.44.191 "cd /opt/manjing-video && git rev-parse --short HEAD && pm2 status manjing-video --no-color"
```
