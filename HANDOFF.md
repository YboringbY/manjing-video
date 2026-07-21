# 漫镜视频 Handoff

更新时间：2026-07-19

## 2026-07-16 正式域名启用

- 备案号：`浙ICP备2026053932号-1`；正式入口已启用为 `https://console.manjingstudio.com`，DNS 指向 `118.196.44.191`。
- Nginx 的域名 HTTP 入口已从 `444` 改为 `301` 跳转 HTTPS，HTTPS 已启用应用反向代理和 `/data/manjing/uploads` 静态素材服务；IP 入口继续保留为运维回退入口。
- `ASSET_PUBLIC_BASE_URL` 已更新为 `https://console.manjingstudio.com`，以后新生成和上传素材使用正式域名；本次未回填历史数据库 URL，未修改任何业务行。
- TLS 证书覆盖 `console.manjingstudio.com`，有效期至 2026-10-03；Certbot 自动续期 timer 为 enabled/active。
- 回滚备份：`/root/backups/manjing-video-nginx-before-domain-20260716-145427.conf` 和 `/root/backups/manjing-video-env-before-domain-20260716-145427.env`。
- 已验证 HTTP `301`、HTTPS 首页 `200`、匿名鉴权 `401`、正式域名素材 `200 image/png`、登录态浏览器项目/生图/素材/生成记录及筛选交互；PM2 online。
- 备案号组件已在登录页和登录后的工作台底部展示，链接到 `https://beian.miit.gov.cn/`；桌面与 390×844 移动端浏览器 smoke 均验证可见且不遮挡内容。
- 可审查配置与回滚执行逻辑已记录在 `ops/nginx/manjing-video.conf` 和 `ops/scripts/enable-console-domain.sh`。

## 2026-07-19 P1 素材库模块拆分（本地完成，待发布）

- 新增 `MaterialLibrarySection`，从 `app/page.tsx` 提取素材库展示、筛选、项目/共享范围切换、重命名编辑、预览和上传表单；服务端请求、项目状态和视频/生图参考状态仍由页面统一管理。
- 新增 `lib/material-library.ts`，集中处理项目/共享素材筛选、素材数量口径、公共 URL 判断、尺寸提示和类型文案；项目素材与团队共享素材数量现在在界面和浏览器 smoke 中分别验证。
- 新增 4 项素材库纯函数测试，单元测试总数增至 13 项；lint、TypeScript、生产构建和全新浏览器 smoke 均通过。
- 浏览器 smoke 新增项目素材/团队共享素材计数及范围切换断言；本地 `5051` 验收输出为项目素材 1、团队共享素材 0，未执行上传、删除或生成。
- 本批未修改 Prisma schema、migration、生产数据库或 Nginx；代码尚未部署生产，需单独确认后按生产发布流程执行。

## 2026-07-17 备案号页面生产发布

- 生产已从 `9234a4b` 更新到 `c469390 Display ICP filing across the application`；本次仅更新前端展示和验收脚本，不涉及 Prisma schema、migration 或 Nginx。
- 发布备份：`/data/backups/manjing-video-db-pre-deploy-20260717-001034.dump`，已恢复到隔离数据库验证，源库与备份计数均为项目 1、工作区 1、素材 5、素材关联 5、分镜 27、视频任务 23、视频资产 10、生图任务 2。
- `db:preflight` 报告待执行 migration 为 0；停机期间快照与发布后快照的业务数量和主键指纹完全一致，未修改、恢复、清理或回填任何业务行。
- PM2 `manjing-video` online；生产脚本 HTTP smoke 通过。正式域名全新浏览器上下文 smoke 通过：登录页备案号、登录后工作台备案号、项目“短剧团队 Demo”、生图工作台、任务列表及备案链接均可见。
- 浏览器 smoke 输出的团队共享素材为 0；项目级素材 API 与守恒快照仍为 5，属于不同统计口径，不代表素材丢失。

## 稳定版本前的开发流程决策

- 继续使用本地 `lint / unit / TypeScript / core API / build / browser smoke` 质量门禁，生产部署继续要求用户明确批准并由安全部署脚本执行。
- 稳定版本确认前不引入 GitHub Actions，不启用 push-to-deploy；稳定后把现有命令迁入 GitHub CI，生产 CD 仍保留人工审批。
- P1 按单模块小批次拆分，每批完成全量本地回归后再评估发布，不把高风险生产维护混入代码优化。

## 2026-07-16 P1 前端模块拆分生产发布

- 生产业务代码已更新到 `9234a4b`；生产 PM2 online，20 条 migration 一致，本次待执行 migration 为 0。
- 生图任务的恢复、提交、轮询、退避重试、项目切换和登出清理已提取到 `app/hooks/useImageGenerationTask.ts`；失败任务不再清空既有成功图片列表。
- 生图表单和结果展示已提取到 `app/components/ImageWorkbench.tsx`；比例尺寸、任务文案和素材去重移到可测试的 `lib/image-workbench.ts`。
- 生成记录已提取到 `app/components/GenerationRecordsSection.tsx`；排序、筛选、计数、参数摘要和视频代理链接移到 `lib/generation-records.ts`。
- `app/page.tsx` 从 2890 行降到 2530 行，并删除 11 个没有任何调用入口的旧函数；API 合约、Prisma schema 和生产数据均未改动。
- `npm run lint` 已切换为 ESLint CLI 且达到 0 错误、0 警告；新增 `npm run test:unit` 和 `npm run test:quality`，开发依赖精确固定到兼容 Node 18.20.8 的版本。
- 浏览器 smoke 新增生图工作台只读检查，以及生成记录“已完成/全部”筛选与行数核对；不发起付费生成。
- 本地 lint、9 项单元测试、TypeScript、核心 API 集成、生产构建、生产依赖审计和全新浏览器 smoke 均通过。
- 发布备份 `/data/backups/manjing-video-db-pre-deploy-20260716-125445.dump` 已隔离恢复验证，83,336 字节、权限 `600`；迁移前后业务守恒为项目 1、工作区 1、素材 25、素材关联 25、分镜 27、视频任务 32、视频资产 10、生图任务 0。
- 公网首页 `200`、匿名鉴权 `401`、登录态 HTTP smoke 和全新浏览器 smoke 均通过；真实项目“短剧团队 Demo”、生图工作台、素材库、生成记录及筛选交互正常。
- 生产 3 条已有生图素材的文件均存在，大小约 1.24–1.67MB，Nginx 均返回 `200 image/png`；截图中的浅色缩略图是截图早于图片下载完成，不是素材丢失。
- 本轮未修改 Prisma schema、未执行生产数据修复、未调整 Nginx，也未恢复历史 5 张孤立生图。

## 2026-07-16 P0 稳定性优化生产发布

- 生图工作台已改为持久化异步任务：新增 `ImageTask`，提交返回 `202`，页面轮询并支持刷新后恢复；同一用户在同一项目仅允许一个进行中任务，服务重启后的 `running` 任务不会自动重复调用付费接口。
- 新增 migration `20260716093000_add_image_tasks` 和 `20260716100000_add_image_task_active_guard`，均为纯新增表/索引；生产已应用，迁移后 `ImageTask` 为 0 行。
- 图片上传上限统一为 25MB，视频/音频统一为 50MB；前端会在上传前拦截，Nginx 返回 HTML `413` 时会显示明确中文错误。本轮不调整生产 Nginx。
- 发布脚本在停服务前强制把备份恢复到隔离数据库并核对业务计数；业务快照已纳入 `ImageTask`，且兼容迁移前该表不存在的状态。
- 新增 `npm run smoke:production:browser`，使用全新浏览器上下文只读验收登录、服务器工作区同步、项目列表、素材库和生成记录；HTTP smoke 也会检查 `/api/image-tasks` 鉴权与可读性。
- 生产已更新到 `a5b04db`；备份 `/data/backups/manjing-video-db-pre-deploy-20260716-112449.dump` 已隔离恢复验证，79,527 字节、权限 `600`。
- 迁移前后业务守恒：项目 1、工作区 1、素材 25、素材关联 25、分镜 27、视频任务 32、视频资产 10；生产 worktree 干净、20 条 migration 一致、PM2 online、公网首页 `200`、匿名鉴权 `401`。
- 登录态 HTTP smoke 和全新浏览器 smoke 均通过；浏览器显示真实项目“短剧团队 Demo”、素材库和生成记录，未发现页面错误、空白或数据被兜底状态覆盖。

## 2026-07-15 视频工作台拖拽素材生产发布

- 视频提示词、首帧和尾帧槽位已支持从桌面/文件夹单文件拖入；提示词拖入会插入 `@素材名` 并加入本次参考，首尾帧只接受图片并直接设置槽位。
- 本地未配置 `ASSET_PUBLIC_BASE_URL` 时，拖入素材仍会在参考区和首尾帧中显示为已绑定，但明确标注“仅本地预览”；开始生成会继续阻断，不能把上游无法访问的本机地址伪装成可生成素材。
- 新增 `/api/materials/upload`，服务端一次完成文件校验、落盘、`Material + ProjectMaterial` 持久化；素材库原本的两步上传也已切换到该接口。
- 新增 SHA-256 精确去重；当前项目已关联素材直接复用，迁移前本地素材在相同文件大小时按需补算哈希，不做相似图识别或跨私有项目复用。
- 生产已更新到 `e6c1670`；纯增量 migration `20260714103000_add_material_content_hash` 已应用，只给 `Material` 增加 `contentHash / byteSize / mimeType` 和唯一索引，没有删除、清理或批量回填业务行。
- 发布备份 `/data/backups/manjing-video-db-pre-deploy-20260715-140550.dump`，77KB、122 个归档项；迁移前后业务守恒：项目 1、工作区 1、素材 25、素材关联 25、分镜 27、任务 32、视频资产 10。
- PM2 online，公网首页 `200`，匿名鉴权和匿名上传均为 `401`；登录态自动 smoke 按用户批准单次跳过，仍需用户在真实浏览器验证拖入、参考区显示和生成提交。
- 本次未修改 Nginx，生产 `client_max_body_size` 仍为 `50m`；应用和前端已统一为图片 25MB、视频/音频 50MB，并对 Nginx `413` 返回明确错误。扩大上限需先改为对象存储直传并作为独立稳定性变更审批。

## 2026-07-13 生图持久化生产发布

- 生产已更新到 `e49cc3c`，生图文件完成后由服务端事务创建素材和项目关联。
- migration 为 0，业务守恒通过；备份 `/data/backups/manjing-video-db-pre-deploy-20260713-223037.dump`。
- 当前生产项目 1、素材 22、分镜 27、任务 32、视频资产 10，PM2 online、公网 200、鉴权 401。
- 本次未调整 Nginx、未恢复 5 张历史孤立生图；这两项仍需单独批准。

## 生图成功结果不可见

- 根因是 Nginx 默认代理超时先返回 504，而应用稍后成功落盘；旧前端只有收到成功响应后才创建 Material，导致文件存在但素材库无记录。
- 生产确认 5 次成功审计、5 个 generated-images 文件、0 条 generated Material；恢复这些结果属于生产数据修复，尚未执行。
- 本地已改为生图 API 服务端事务创建 `Material + ProjectMaterial`，前端直接使用已持久化结果；504 时提示稍后刷新。
- 仍需单独批准并执行：恢复 5 条孤立生图素材；备份并提高生产 Nginx 代理超时。

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
- 生产入口：`https://console.manjingstudio.com`
- 运维回退入口：`http://118.196.44.191`
- 最新生产业务提交：`c469390 Display ICP filing across the application`
- 最新发布记录：本文件顶部“备案号页面生产发布”章节
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
- 日常生产验收优先使用正式 HTTPS 域名；IP 仅作为运维回退入口。

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
