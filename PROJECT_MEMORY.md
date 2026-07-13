# 漫镜视频项目记忆

更新时间：2026-07-13

# 2026-07-13 生图成功但结果不可见

- 用户反馈上游显示生图成功，但工作台无结果、素材库也没有记录。
- 生产只读排查确认：Nginx `location /` 没有显式代理超时，使用默认约 60 秒；最近请求先向浏览器返回 504，但应用继续等待上游，并在稍后成功保存 PNG、写入 `image.generate success` 审计。
- 旧架构在 API 保存图片文件后把结果返回浏览器，再由浏览器调用 `/api/materials` 创建素材；浏览器已收到 504 并断开，因此第二次写库永远没有发生。
- 生产共有 5 次成功生图审计与 5 个 `generated-images` 文件一一对应，但 `Material.source=generated` 为 0；这些是待恢复的业务结果，恢复必须作为独立生产数据修复并获得明确批准。
- 根本修复：`/api/images/generate` 保存文件后由服务端事务直接创建 `Material + ProjectMaterial`，返回已经持久化的素材；前端不再执行第二次素材写入。即使浏览器或代理超时，服务端完成后刷新素材库仍可见。
- 若素材事务失败，服务端清理本次生成文件并记录 `persist_material` 失败审计，避免继续产生孤立文件。
- 前端遇到 504 时明确提示“上游可能仍在处理，完成后会自动入素材库，请稍后刷新”，不再笼统声称生成失败。
- 后续生产修复还需将 Nginx `proxy_read_timeout / proxy_send_timeout` 调整到覆盖生图最长等待时间；这是独立生产配置变更，需要备份配置、`nginx -t` 和回滚方案。

# 2026-07-12 生图参考图生产发布

- 用户批准将生产从 `1158fe3` 更新到 `db77ddb Add image workbench reference selection`，并批准本次单次跳过登录后 smoke。
- 待执行 migration 为 0；部署前后业务数量与主键指纹一致：项目 1、工作区 1、素材 10、素材关联 10、分镜 16、任务 21、视频资产 4。
- 发布备份：`/data/backups/manjing-video-db-pre-deploy-20260712-101201.dump`，65KB、PostgreSQL custom archive、111 个目录项。
- 独立核验：生产 commit `db77ddb`、工作区干净、PM2 online、公网首页 200、匿名鉴权 401，10 个素材文件全部存在。
- 部署本身未调用付费生图；仍需用户在生产选择一张参考图实际生成，确认当前图片渠道兼容 `/v1/images/edits`。

# 2026-07-12 生图工作台参考图闭环

- 修复“参考图 -> 去素材库选择”按钮无效：原逻辑只对隐藏 section 调用 `scrollIntoView`，没有切换到素材库，也没有任何生图参考状态。
- 生图工作台新增单张参考图状态、缩略图/名称展示、更换和移除操作；进入素材库后显示明确选择模式，点击图片卡片或“选为生图参考”会自动返回工作台。
- 切换项目或参考素材被删除时自动清空选择，禁止跨项目残留。
- 生图请求只提交 `referenceMaterialId`，不接受客户端参考 URL；后端验证素材属于当前租户和项目且类型为图片，跨项目未关联素材返回 404。
- 后端优先从受控素材目录读取 PNG/JPEG/WebP，失败时才读取经过公网校验的素材 URL，单图限制 25MB；有参考图调用兼容 `/v1/images/edits`，无参考图继续调用 `/v1/images/generations`。
- 核心 API 集成新增跨项目参考图授权回归，临时数据自动清理。
- 本项已随 `db77ddb` 部署生产，发布详情见上一节。

# 2026-07-12 生成记录简化与发布门禁生产发布

- 用户批准将生产从 `b1ae0ec` 更新到 `1158fe3 Simplify video task reference summary`，并明确批准本次单次跳过登录后 smoke。
- 发布包含生成记录引用统计隐藏、同项目素材防覆盖、逐项目素材数量 smoke 和缺少登录 smoke 凭证时默认阻断部署的门禁。
- 待执行 migration 为 0；部署前后业务数量与主键指纹一致。发布时生产基线为项目 1、工作区 1、素材 10、素材关联 10、分镜 16、任务 21、视频资产 4。
- 新备份：`/data/backups/manjing-video-db-pre-deploy-20260712-090721.dump`，65KB、PostgreSQL custom archive、111 个目录项。
- 独立核验：生产 commit `1158fe3`、工作区干净、PM2 online、公网首页 200、匿名鉴权 401，10 个素材文件全部存在。
- 本次登录后 smoke 按用户批准的例外跳过；仍需用户强制刷新后确认生成记录只显示时长/比例/清晰度，并确认项目和素材库正常。

# 2026-07-12 生成记录参考素材文案收敛

- 用户指出生成记录中的“参考素材 6 个 / 引用：文件名列表”混淆了“随任务提交的全部素材”和“提示词中明确 @ 点名的素材”。
- 当前阶段先不展示引用数量和文件名统计；生成记录参数摘要只显示时长、比例和清晰度。
- `VideoTask.snapshot` 中的 `materialIds / references / firstFrameMaterialId / lastFrameMaterialId` 继续保留，直接重新生成、编辑后重新生成和审计能力不受影响；实际提交给模型的参考素材逻辑也不变。
- 后续只有在产品明确区分“已提交参考”和“提示词点名”后，再考虑恢复结构化展示。
- 本项已随 `1158fe3` 部署生产，发布详情见上一节。

# 2026-07-12 发布防回归机制优化

- 素材可见性回归说明：数据库数量、主键指纹、文件存在和 API 200 都不能证明最终用户页面正确；发布验收必须覆盖浏览器状态与请求时序。
- 前端增加双重保护：项目素材等待工作区同步完成后加载；工作区回包更新同一项目时保留已经加载的素材，避免未来请求时序变化再次清空 UI。
- `scripts/production-smoke.mjs` 现在强制对比每个工作区的 `project.materialCount` 与 `/api/materials?projectId=...` 返回数量，并输出各项目的分镜、素材、任务检查结果。
- `scripts/deploy.sh` 不再静默跳过登录后 smoke：缺少 `PRODUCTION_SMOKE_ACCOUNT / PRODUCTION_SMOKE_PASSWORD` 时默认在修改生产前阻断；只有用户明确批准单次例外并设置 `PRODUCTION_SMOKE_SKIP_APPROVED=yes` 才能继续。
- 发布清单新增：涉及 localStorage、workspace hydration、规范化 API 加载或 React effect 的变更，必须使用清空 storage/全新浏览器会话验证项目、素材、任务和资产；API 数量与 UI 可见性必须分别验收。
- 原则：不得再以“数据库记录还在”或“API 返回成功”代替最终页面验收；缺少已登录生产 smoke 和真实浏览器验收时，不得宣称发布完整成功。

# 2026-07-12 生产素材库可见性回归

- P0/P1 发布后用户反馈 `短剧团队 Demo` 的生成记录可见，但素材库为空。
- 生产只读核对确认数据没有丢失：项目 `id=1` 仍关联 10 条素材（7 图片、2 音频、1 视频），10 个 `storagePath` 和对应文件全部存在，20 条生成记录正常。
- 根因是 P1 清空 localStorage 业务副本后暴露了已有并行加载竞态：`/api/materials?projectId=1` 若先返回，随后 `/api/workspaces` 的空 `materials` 会覆盖素材结果；当前项目 ID 未变化时素材 effect 不会再次执行。
- 修复为项目素材必须等待工作区同步完成后加载，并在登录成功和退出登录时重置工作区同步标志，保证每次会话都按“工作区 -> 项目素材”顺序执行。
- 本地验证通过：`git diff --check`、`npx tsc --noEmit`、清理 `.next` 后 `npm run build`、`npm run test:core-api`。
- 用户明确批准后，热修复 `b1ae0ec Fix project material loading race` 已部署生产；待执行 migration 为 0，业务数量与主键指纹不变，PM2 online，公网首页 200，匿名鉴权 401。
- 热修复备份：`/data/backups/manjing-video-db-pre-deploy-20260712-012832.dump`，63KB、PostgreSQL custom archive、111 个目录项；部署后复核 10 条素材关联和 10 个文件均存在。
- 因未提供生产登录凭证，登录后的素材库页面需要用户刷新并进行最终可见性确认。

# 2026-07-12 P0/P1 生产发布

- 用户在查看生产变更单后明确批准，将生产从 `1b8534a` 更新到 `b628a95 Refactor P1 frontend and video workflows`。
- 使用新版 `scripts/deploy.sh` 执行：生产工作区干净，fast-forward 成功，`npm ci` 无漏洞，Prisma Client 生成和 `npm run build` 通过。
- `npm run db:preflight` 显示 17 条 migration 均已应用、待执行 migration 为 0；没有 schema 或业务数据修改。
- 发布前数据库备份：`/data/backups/manjing-video-db-pre-deploy-20260712-011336.dump`，63KB，PostgreSQL custom archive，`pg_restore -l` 可读取 111 个目录项。
- 停机前捕获业务数量和主键指纹，`prisma migrate deploy` 确认无待执行迁移，发布后守恒检查通过：1 个项目、1 个工作区、10 个素材、10 个素材关联、15 个分镜、20 个任务、3 个视频资产，所有指纹不变。
- 生产 PM2 `manjing-video` online，公网首页返回 200，匿名 `/api/auth/me` 返回 401，生产 Git 工作区干净。
- 部署时未提供临时生产 smoke 凭证，因此自动化的登录后只读 smoke 被跳过；仍需用户在真实浏览器确认登录、项目内容、素材和视频预览。历史 PM2 Server Action 探测错误最后更新时间早于本次发布，不是新版本持续错误。

# 2026-07-11 P1 代码结构与状态权威优化

- 前端继续拆分 `app/page.tsx`：登录页、人员管理、审计日志分别迁到 `LoginPage`、`MembersSection`、`AuditLogsSection`，主页面从 2731 行降到 2647 行。
- 新增 `lib/api-input.ts`，统一项目、分镜、素材和视频任务接口的文本、数据库 Int、BigInt、版本号与范围整数校验；数据库 Int 超出 PostgreSQL Int 范围时严格返回 400，禁止取模映射到其他业务 ID。
- 新增 `lib/video-generation.ts` 和 `lib/video-status.ts`，集中处理视频渠道配置、时长与比例、参考素材 payload、上游任务 ID/错误/视频 URL 解析，视频创建路由从 509 行降到 340 行，状态路由从 318 行降到 205 行。
- 浏览器 `localStorage` 只保存项目兼容元数据；读取和写入缓存时都清空 `shots / tasks / assets / materials`，规范化数据库 API 是这些业务数据的唯一权威来源。
- `scripts/core-api-integration.mjs` 增加超范围数据库 ID 必须返回 400 的回归检查。
- 验证通过：`git diff --check`、`npx tsc --noEmit`、清理 `.next` 后 `npm run build`、`npm run test:core-api`。集成测试覆盖严格 ID、项目/分镜 409、共享素材、任务评价和视频资产生命周期，临时数据已自动清理。
- P1 已作为 `b628a95` 推送并于 2026-07-12 按生产安全流程部署；发布详情见上一节。后续任何发布仍必须先向用户提交环境、影响、备份、停机和回滚方案并获得明确批准。

## 2026-07-11 P0 稳定性自动化

- 新增 `scripts/core-api-integration.mjs`：仅允许 loopback，自动验证项目/分镜乐观锁、团队素材跨项目生命周期、任务评价和视频资产删除，并在 `finally` 清理测试数据。
- 新增 `scripts/production-smoke.mjs`：只读验证首页、匿名鉴权、管理员登录、项目/工作区/素材/分镜/任务一致性和废弃路由状态；账号密码只通过临时环境变量提供。
- 新增 `scripts/business-data-snapshot.sh`：记录项目、工作区、素材、关联、分镜、任务和视频资产的数量与主键指纹，migration 前后任何差异默认阻断部署。
- 新增 `scripts/verify-backup-restore.sh`：将备份恢复到限定命名的隔离临时库，对比 6 张业务表计数后自动删除临时库。
- `scripts/deploy.sh` 已接入备份、迁移预检、PM2 停机、业务快照、migration、数据守恒、重启和基础健康检查；迁移前失败会恢复旧服务，迁移后异常会保持停机等待人工处理。
- 新增 `docs/P0_RELEASE_CHECKLIST.md`，明确发布未完成，直到真实浏览器页面验证项目、剧本、分镜、素材、任务和视频资产。
- 本地验证结果：核心 API 集成测试通过；生产 smoke 脚本在本地通过；数据守恒正常和篡改阻断路径通过；本地备份隔离恢复计数一致并自动清理。

## 2026-07-11 生产项目误删与恢复

- 发布迁移 `20260710194000_remove_legacy_workspace_payload` 通过 `id=1 + 名称=短剧团队 Demo` 判断演示数据，但该行在生产已承载真实业务数据。
- migration 删除了项目、工作区和素材，并通过项目外键级联删除分镜、任务和视频资产。
- 影响：1 个项目、15 个分镜、20 个任务、3 个视频资产、10 个素材短暂不可用。
- 已从 `/data/backups/manjing-video-db-pre-c7ffc16-20260711-104650.dump` 选择性恢复，不覆盖账号、成员关系、模型渠道、审计日志和 migration 历史。
- 恢复后 API 验证：项目 1、工作区 1、素材 10、项目素材关联 10、分镜 15、任务 20、视频资产 3；10 个素材物理文件全部存在。
- 数据恢复后前端仍按 `id=1 / 短剧团队 Demo` 过滤服务器工作区和 localStorage，导致页面继续不可见；已删除所有基于 ID/名称的演示项目过滤。以后恢复验证必须覆盖最终用户页面，不能只看数据库/API。
- 根因和恢复详情：`docs/INCIDENT_2026-07-11_PROJECT_DELETION.md`。
- 强制生产变更规则：`docs/PRODUCTION_CHANGE_POLICY.md`。
- 以后涉及生产迁移、删除、清理、修复、回填时，必须先向用户展示影响范围、行数、备份、停机和回滚方案并获得明确批准。
- 日常 schema migration 禁止包含业务数据删除；部署前必须运行 `npm run db:preflight`。

## 2026-07-11 生产发布记录

中断恢复后的架构与产品优化已提交并发布到生产。

- 业务提交：`c7ffc16 Normalize project workflows and material lifecycle`。
- GitHub `main`、本地和生产运行代码已同步到 `c7ffc16`。
- 生产 PostgreSQL 已从 12 条 migration 更新到 17 条，新增 5 条 migration 全部应用成功。
- 生产构建通过，PM2 `manjing-video` 已重启并在线。
- 公网 `http://118.196.44.191/` 返回 200，未登录 `/api/auth/me` 返回 401。
- 管理员登录、项目/工作区/团队素材只读接口正常；旧 `/api/assets` 返回 404，任务评价接口未登录返回 401。
- 生产临时项目实测：创建项目和工作区、保存剧本、创建/更新分镜、旧版本 409 冲突、规范化工作区读取和完整删除均正常；测试数据已清理。
- 发布前数据库备份：`/data/backups/manjing-video-db-pre-c7ffc16-20260711-104650.dump`。
- 发布前代码备份：`/data/backups/manjing-video-code-pre-c7ffc16-20260711-104650.tar.gz`。
- 事故恢复后，生产已有 1 个项目、1 个工作区、10 个素材、15 个分镜、20 个任务和 3 个视频资产；1 个租户、1 个用户、1 个成员关系、2 个模型渠道和审计日志均保留。

本批改动主线：

- `ProjectWorkspace.state` 不再保存 `shots / tasks / assets / materials` 实时副本，只保留项目兼容状态；读取时由规范化表组装。
- `/api/projects` 和 `/api/shots` 已改为真实细粒度 CRUD，并通过 `version` 做乐观锁；前端已保留服务端返回的项目版本，避免刷新后固定拿版本 1 写入。
- 新增 `ProjectMaterial` 关联表和 `/api/materials/links`，团队共享素材可以关联多个项目；删除源项目不会删除仍被其他项目引用的团队素材。
- 素材删除会清理无人引用的本地物理文件。内部 `storagePath` 不再接受客户端输入，也不再通过上传、素材、生图接口返回；路径只从当前项目受控 `/uploads/projects/{projectId}/...` URL 推导。
- 视频任务完成后由服务端写入 `VideoAsset`；`VideoAsset.id` 改为数据库自增。新增视频结果删除 API 和任务满意/需改进评价 API。
- 生成记录展示本次引用素材名称；生图结果支持恢复提示词和尺寸后重新生成。
- 删除废弃 `/api/assets`、`/api/assets/groups`、`/api/user/balance` 路由，当前访问返回 404。
- 抽取 `lib/providers/video.ts`，统一视频供应商创建、查询、恢复端点；修复 Base URL 已含 `/v1` 时重复拼接的问题。
- 新增公网媒体 URL 校验，IPv4 私网、IPv6 loopback/ULA/link-local/IPv4-mapped 私网地址都会在调用上游前拦截。

本批新增 migration：

- `20260710194000_remove_legacy_workspace_payload`
- `20260710195000_add_project_material_links`
- `20260710201000_add_project_shot_versions`
- `20260710203000_add_video_task_feedback`
- `20260710204000_add_video_asset_sequence`

发布前验证结果：

- 本地 PostgreSQL 16 已恢复运行，17 条 migration 全部已应用，无待执行 migration。
- `npx prisma validate`、`npx prisma generate`、`npx tsc --noEmit` 通过。
- `npm run build` 通过，共 23 个 App Router 路由。
- 临时项目实测项目/分镜乐观锁：正常更新升到 version 2，旧 version 写入返回 409，测试数据已删除。
- 团队素材实测：跨项目关联成功；删除源项目后目标项目和团队库仍保留；解除关联和最终删除正常，测试数据已删除。
- 文件安全实测：伪造 `storagePath` 不会删除已有文件；正常上传文件删除素材后物理文件被清理；API 不再泄露绝对路径。
- 视频素材 URL 实测：`192.168.x.x`、`::1`、`fc00::/7`、IPv4-mapped loopback 均返回 400。
- 本地 5050 开发服务已在发布前停止，避免与生产构建共用 `.next`。

发布后注意：

- `ProjectWorkspace.state` 的业务数组已清空，规范化表成为项目、分镜、任务、视频资产和素材关系的数据源。
- 仍建议在真实生产使用中复测素材上传/共享、真实模型生成、状态同步、视频预览下载和任务评价。
- PM2 错误日志仍能看到外部伪造 Server Action `x` 请求；当前页面和 API 正常，本项目没有使用该 Server Action。

## 项目定位

漫镜视频是面向短剧团队的 AI 视频生产工作台。当前处于本地快速迭代 MVP，目标是先跑通内部团队使用流程，再逐步演进为 SaaS 多租户产品。

当前核心流程：

- 登录进入工作空间。
- 创建/切换项目。
- 管理剧本、分镜、素材。
- 选择模型渠道和模型 ID。
- 调用 Seedance 2.0 生成视频。
- 同步生成任务状态，预览或下载生成视频。

## 2026-07-11 当前精简状态

当前生产入口：

```text
http://118.196.44.191
```

备案完成前不要恢复 `console.manjingstudio.com` 的生产访问。

最新已部署状态：

- 最新生产提交：`c7ffc16 Normalize project workflows and material lifecycle`。
- 生产 PM2 应用 `manjing-video` 在线。
- 生产首页返回 `200 OK`。
- `/api/auth/me` 未登录返回 JSON `401`，符合预期。
- 生产 Prisma migration 已应用到 17 条。

数据库演进状态：

- 已完成 `Project / Material / Shot / VideoTask / VideoAsset / ApiProfile / AuditLog` 等核心表。
- `ProjectWorkspace.state` 仅保留项目兼容状态，`shots / tasks / assets / materials` 不再实时双写。
- `/api/workspaces` GET 从规范化表组装 `project / shots / tasks / assets` 后返回前端。
- 项目、分镜、任务、视频资产和素材关系已使用细粒度 API 与规范化表。

架构 review 后的下一步优先级：

1. 真实生产复测素材上传/共享、真实模型生成、状态同步、视频预览下载和任务评价。
2. 继续缩减 `ProjectWorkspace` 兼容状态，最终只保留必要归档信息或完全退役。
3. `Project.id` 仍由客户端生成随机 Int，40 人团队阶段可接受，但记录为后续技术债；更干净方向是数据库生成 ID 或 cuid。
4. `VideoTask.shotId` 暂无复合外键约束，这是当前复合主键设计的取舍，先不主动修。

近期客户反馈已处理：

- `@ 插入到提示词` 已支持图片、视频、音频素材。
- 点击开始生成后，视频提示词不再自动清空。
- 视频工作台首尾帧从已有参考图片选择，不再给用户展示单独上传首帧/尾帧的中间思考。
- 素材库支持图片放大、视频预览、音频播放。
- 生成记录和视频结果保持最新在前。

近期仍建议关注：

- 多场景总时长控制：提示词包含“场景1/2、场景2/2”时，仍按用户选择的总时长生成一个完整视频。
- 参考素材引用可视化：生成记录/分镜列表展示本次用到的素材名称。
- 拖拽上传：后续增强项，先不作为近期主线。

## 本地项目状态

项目路径：

```text
/Users/keyang/Desktop/manjing_SaaS/manjing-video
```

本地开发地址：

```text
http://localhost:5050
```

启动方式：

```bash
npm run dev -- -p 5050
```

如果 Next.js 出现 chunk 缓存错误，例如 `Cannot find module './276.js'`，处理方式：

```bash
rm -rf .next
npm run dev -- -p 5050
```

重要约定：

- 当前只在本地迭代，不主动改服务器，除非用户明确要求部署。
- 每次重要改动后先本地验证，再考虑推 GitHub 和服务器拉取。
- 不在回复中输出任何 API Key、私钥、数据库密码或 `.data/api-profiles.json` 中的密钥内容。

## 技术栈

- Next.js 14 App Router
- React 18
- TypeScript
- PostgreSQL 16
- Prisma
- localStorage 暂存项目工作区数据
- Prisma `ApiProfile` 表存储模型渠道配置，API Key 使用 AES-256-GCM 加密；旧 `.data/api-profiles.json` 仅作为兼容导入来源
- 第三方视频生成：当前重点适配 `zjljzn.ltd` Seedance 中转

关键文件：

- `app/page.tsx`：主工作台 UI 和大部分前端状态。
- `app/globals.css`：全局样式。
- `app/api/video-tasks/route.ts`：创建/列表视频任务。
- `app/api/video-tasks/status/route.ts`：查询视频任务状态。
- `app/api/video-files/route.ts`：视频预览/下载代理。
- `app/api/api-profiles/*`：模型渠道配置读写。
- `app/api/auth/*`：登录、退出、当前用户。
- `app/api/users/*`：人员管理。
- `lib/auth.ts`：Cookie 登录态、角色权限。
- `prisma/schema.prisma`：Tenant/User/Membership。

## Git 与部署设计

GitHub 仓库：

```text
https://github.com/YboringbY/manjing-video
```

当前推荐工作流：

```text
本机开发 -> GitHub 版本管理 -> 服务器拉取 GitHub 代码 -> 服务器构建/运行
```

这是正确方向。服务器不应该继续靠本地文件手动复制维护，后续应通过 GitHub 形成可追踪版本。

服务器：

- IP：`118.196.44.191`
- 账号：`root`
- SSH key：项目上层文件夹曾提供 `manjing.pem`
- 当前不要贸然替换线上运行代码；涉及部署、拉取、重启前需要确认数据库环境已经准备好。

2026-07-04 复盘状态：

- 本地 `main` 与 GitHub `origin/main` 已同步到 `22c56e2 Add role-based channel management`。
- GitHub 最新代码已经包含 PostgreSQL/Prisma 账号体系、三层角色、人员管理和模型渠道权限控制。
- 生成服务器 `/opt/manjing-video` 仍停留在旧版提交 `6be5ef0 Add production deploy script`。
- 服务器当前 PM2 应用 `manjing-video` 在线运行，但代码目录没有 `prisma/`，也没有 `.env` / `.env.local`。
- 服务器 PostgreSQL 未运行，且未发现 `psql/postgres/pg_ctl` 可执行文件。
- 服务器可以通过 GitHub remote 读取最新 `main`，说明网络和仓库访问不是主要问题。
- 关键断点：代码架构已经升级为数据库版，但生成服务器运行环境仍是旧的无数据库环境。不能直接拉取新代码并重启，否则登录/人员管理等依赖 Prisma 的接口大概率会因为缺少 `DATABASE_URL`、数据库、迁移和 seed 数据而失败。

2026-07-04 已完成的服务器准备动作：

- 服务器已安装 Debian 12 默认源 PostgreSQL 15.18。
- PostgreSQL 服务已启用并启动。
- 已创建生产库 `manjing_video_prod`。
- 已创建数据库用户 `manjing`，并验证可连接 `manjing_video_prod`。
- 已在服务器 `/root/manjing-video-secrets.env` 保存生产 `DATABASE_URL` 和 `AUTH_SECRET`，文件权限为 `600`。不要在聊天或日志中打印该文件内容。
- 服务器已从 GitHub 快进到 `22c56e2 Add role-based channel management`。
- 已将生产环境变量写入 `/opt/manjing-video/.env`，权限为 `600`。
- 已执行 `npm ci`、`npx prisma generate`、`npm run db:deploy`、`npm run db:seed`。
- Prisma 3 个 migration 已全部应用，seed 已创建默认 `admin` 账号。
- 已执行 `npm run build` 并通过。
- 已重启 PM2 应用 `manjing-video`，当前通过 `next start -p 3000 -H 127.0.0.1` 运行。
- Nginx 入口和公网 `http://118.196.44.191/` 均返回 200。
- 已验证 `admin / admin123456` 可登录，`/api/auth/me` 和 `/api/users` 能从 PostgreSQL 返回 `super_admin` 用户。
- 当前数据库计数：1 个 Tenant、1 个 User、1 个 Membership。
- 部署前备份位于服务器 `/root/backups/manjing-video-before-db-20260704-132502.tar.gz`。

生成服务器升级数据库版的建议顺序：

1. 登录公网应用，手动检查左侧“人员管理”和“模型渠道管理”。
2. 确认服务器 `.data/api-profiles.json` 中的模型渠道是否仍是可用配置。
3. 用真实渠道生成一条 Seedance 任务，验证创建、同步、预览、下载闭环。

## 数据库与账号体系

本地数据库：

```text
PostgreSQL 16
数据库：manjing_video_dev
用户：manjing
连接：DATABASE_URL 写在 .env / .env.local
```

`.env` 和 `.env.local` 不提交。

账号模型：

- `Tenant`：租户。
- `User`：全局用户。
- `Membership`：用户在租户下的角色与状态。

当前角色：

- `super_admin`：系统管理员。产品提供商最高权限，管理平台级能力，如模型渠道/API 配置。当前只有该角色可见“模型渠道管理”。
- `tenant_admin`：管理员。租户管理员，管理本租户成员和团队生产流程。
- `user`：用户。使用生产功能，不管理账号和平台配置。

默认 seed 账号：

```text
账号：admin
密码：admin123456
角色：super_admin
```

人员管理规则：

- `super_admin` 可以创建/编辑/停用/启用管理员和用户。
- `tenant_admin` 只能创建/编辑/停用/启用用户。
- `user` 不能进入人员管理。
- 不能停用当前登录账号。
- 已支持停用后重新启用。

UI 注意：

- 左侧导航已增加“设置与管理”分组。
- 子项包括“人员管理”和“模型渠道管理”。
- “模型渠道管理”只对 `super_admin` 显示。
- 右上角不应再放重复的“设置与管理”按钮，管理入口以左侧导航为准。

## 模型渠道管理

原“第三方 API Profile / 模型服务配置”已改为“模型渠道管理”方向。

当前设计：

- 一个渠道代表一个第三方中转或官方 API 入口。
- 一个渠道可以配置多个视频模型 ID 和多个图片模型 ID。
- 视频工作台按当前渠道的视频模型列表下拉选择模型。
- 生图工作台按当前渠道的图片模型列表下拉选择模型。
- 当前使用渠道在列表中设置，不再在编辑表单里混着选择。
- 渠道支持并发数配置，前端提交任务前按当前渠道的并发限制做拦截。
- 删除了“使用 .env.local 默认接口”“当前 Base URL”等容易误导的旧文案。
- 默认渠道数据已清空，要求显式新增渠道。

当前已适配的供应商：

```text
zjljzn.ltd
```

适配逻辑：

- Base URL 可填 `https://zjljzn.ltd`。
- 创建视频时自动请求 `/v1/videos/generations`。
- 查询状态时请求 `/v1/videos/generations/{task_id}`。
- ZJLJZN 的 payload 使用扁平媒体数组：
  - `images: ["url"]`
  - `videos: ["url"]`
  - `audios: ["url"]`
  - `metadata: { draft, generate_audio, watermark }`
- 支持从上游响应中提取 `video_url`、`data[0].url` 等视频地址。

当前本地 `.data/api-profiles.json` 里可能有真实 API Key，不能打印。

## 视频生成与存储现状

当前生成完成后，视频文件不在我们的服务器或本地存储中。

现状：

- 上游生成视频并返回 URL。
- 当前 URL 多数是字节/火山 TOS 地址。
- 系统保存/展示这个 URL。
- `/api/video-files` 负责做预览或下载代理。
- 用户点击下载后，文件才保存到用户电脑本地。
- 如果不下载、不转存，视频实际仍在上游/火山存储。

风险：

- 上游 URL 可能过期。
- 上游可能清理文件。
- 我们没有自己的长期视频归档。

后续更稳的设计：

```text
生成完成 -> 后台拉取上游视频 -> 上传到我们自己的对象存储 -> 数据库保存自有 URL
```

线上对象存储尚未接入。用户目前有 500G 服务器存储，已挂载为 `/data`，可先作为短期自有文件存储；最终仍建议使用对象存储承载图片/视频。

2026-07-08 生成记录 UX 第一阶段优化：

- 视频工作台定位为“提交生成”的工作台，只保留最近提交状态和跳转到生成记录的入口。
- 完整历史、状态同步、重试、编辑后重试、预览和下载统一集中在“生成记录”页。
- “生成记录”页增加状态筛选：全部 / 生成中 / 已完成 / 失败。
- 成功视频不再用独立“已完成视频”板块做第二套数据源，而是在对应任务行里直接预览/打开/下载。
- 所有视频生成记录展示以最新在前为准；当前前端通过任务数组前插和资产 ID 倒序保证。
- UI 和统计只把真实 `http/https` 视频 URL 视为可预览视频，`task failed` 等上游错误文本不能再进入完成视频展示。

第二阶段待办：

- 给视频任务增加明确的 `createdAt / updatedAt / completedAt` 字段，排序不再依赖数组顺序或本地 ID。
- 将 `Project / Shot / VideoTask / VideoAsset` 从 `ProjectWorkspace.state` JSON 拆成 Prisma 规范化表。
- `VideoTask` 成为生成记录主数据源，`videoUrl` 是成功任务的结果字段；`VideoAsset` 只表示可复用/可沉淀资产。
- 生成成功后再决定是否沉淀到资产库或自有存储，失败任务不得创建视频资产。
- 继续保留 `ProjectWorkspace.state` 作为迁移兼容层，直到生产数据完全迁移。

2026-07-05 服务器存储规划已执行：

- 20G 系统盘 `/dev/vda2` 挂载 `/`，用于系统、Nginx、Node/PM2、项目代码和少量日志。
- 500G 数据盘 `/dev/vdb` 已格式化为 ext4，挂载到 `/data`，并写入 `/etc/fstab` 自动挂载。
- PostgreSQL 15 数据目录已从 `/var/lib/postgresql/15/main` 迁移到 `/data/postgresql/15/main`。
- 已创建文件资产目录：
  - `/data/manjing/uploads`：后续用户上传素材。
  - `/data/manjing/generated`：后续生成视频转存。
  - `/data/backups`：数据库备份和发布备份。
- 验证结果：PostgreSQL 在线，`manjing_video_prod` 仍有 1 个 Tenant、1 个 User、1 个 Membership；公网首页返回 200，未登录接口返回 401 属正常。

2026-07-05 域名与上传素材公网 URL 已执行：

- 已将 `console.manjingstudio.com` 解析到 `118.196.44.191`，HTTP 访问正常。
- 已在服务器安装 `certbot` 和 Nginx 插件，签发 `console.manjingstudio.com` HTTPS 证书。
- 当前证书到期时间：2026-10-03；`certbot.timer` 已启用并处于 active 状态。
- Nginx 已配置 HTTP 自动跳转 HTTPS。
- Nginx 已将 `/uploads/` 映射到 `/data/manjing/uploads/`，用于公网访问用户上传素材。
- 生产 `.env` 已加入：
  - `ASSET_STORAGE_DIR=/data/manjing/uploads`
  - `ASSET_PUBLIC_BASE_URL=https://console.manjingstudio.com`
- 已部署提交 `9139ef6 Add real asset upload flow` 到生产服务器。
- 已通过线上接口 `POST /api/assets/upload` 上传测试图片，返回 `https://console.manjingstudio.com/uploads/...`。
- 已验证上传后的图片公网 URL 返回 `200 OK`，由 Nginx 从 `/data/manjing/uploads` 直接提供。
- 注意：素材记录目前仍主要在前端/localStorage，上传文件已是真实服务器文件；下一步需要把素材元数据写入 PostgreSQL。

2026-07-05 备案期间临时 IP 测试模式：

- `console.manjingstudio.com` 访问被云厂商引导到 `webblock.volcengine.com`，HTTPS 公网握手也出现 reset；判断为大陆服务器未备案域名访问受限。
- 备案完成前，生产临时使用 `http://118.196.44.191` 测试上传和生成链路。
- 已新增 `AUTH_COOKIE_SECURE` 配置开关；默认生产仍使用 Secure cookie，服务器临时设置 `AUTH_COOKIE_SECURE=false` 以支持 HTTP IP 登录。
- 服务器 `.env` 临时设置 `ASSET_PUBLIC_BASE_URL=http://118.196.44.191`，因此上传素材返回 IP 形式 URL。
- Nginx 已恢复 IP 的 80 端口入口，`/uploads/` 仍映射到 `/data/manjing/uploads/`。
- 已验证：
  - `http://118.196.44.191/` 返回 `200 OK`。
  - `POST /api/auth/login` 返回 `200`，Set-Cookie 不带 `Secure`。
  - `POST /api/assets/upload` 返回 `http://118.196.44.191/uploads/...`。
  - 上传图片 URL 返回 `200 OK`。
- 备案完成后需要切回：
  - `ASSET_PUBLIC_BASE_URL=https://console.manjingstudio.com`
  - `AUTH_COOKIE_SECURE=true` 或删除该环境变量
  - 让正式入口使用 `https://console.manjingstudio.com`

2026-07-07 生产更新与当前验证状态：

- 已将生产服务器 `/opt/manjing-video` 更新到提交 `faafd8a Align video toolbar controls`。
- 本次生产更新包含：
  - 上传素材元数据写入 PostgreSQL 的 `Material` 表。
  - `/api/materials` 素材记录接口。
  - 视频工作台 UI 布局优化。
  - “开始生成”按钮简化、浅色背景、去除箭头和字数统计。
  - 视频工具栏控件高度统一为 52px，`全能参考 / 模型 / 比例 / 清晰度 / 时长 / @ 素材 / 开始生成` 水平对齐。
- 生产部署时已执行：
  - `npm ci`
  - `npx prisma generate`
  - 显式加载 `.env` 后执行 `npx prisma migrate deploy`
  - `npm run build`
  - `pm2 restart manjing-video --update-env`
- 生产数据库已应用 migration `20260706001000_add_materials`。
- 已验证：
  - `http://118.196.44.191/` 返回 `200 OK`。
  - `POST /api/auth/login` 返回 `200`，备案期间 IP 模式下 cookie 不带 `Secure`。
  - `GET /api/materials?projectId=1` 返回正常。
  - `POST /api/assets/upload` 返回 `http://118.196.44.191/uploads/...`。
  - 上传图片 URL 返回 `200 OK`。
  - 部署测试上传目录 `/data/manjing/uploads/projects/deploy-test` 已清理。
- 当前生产仍为备案期间 IP 测试入口：`http://118.196.44.191`。
- 重要细节：服务器上的 Prisma CLI 因为 `prisma.config.ts` 不自动加载 `.env`，执行迁移时必须显式加载环境变量，例如：

```bash
cd /opt/manjing-video
set -a && source .env && set +a
npx prisma migrate deploy
```

2026-07-07 未备案域名访问已禁用：

- 用户明确要求：备案完成前，生产环境不能通过 `console.manjingstudio.com` 访问。
- 已修改服务器 Nginx：
  - `server_name 118.196.44.191` 继续代理生产应用，作为备案期间唯一测试入口。
  - `server_name console.manjingstudio.com` 的 HTTP 和 HTTPS 均 `return 444`，不再代理到 Next 应用。
- 已验证：
  - `http://118.196.44.191/` 返回 `200 OK`。
  - 公网访问 `http://console.manjingstudio.com/` 被云厂商导向 `webblock.volcengine.com`，没有进入应用。
  - 公网访问 `https://console.manjingstudio.com/` TLS reset。
  - 直连 IP 并指定 `Host: console.manjingstudio.com` 返回 empty reply，符合 Nginx `444` 预期。
- 备案完成前不要恢复域名 server block 代理；生产测试只使用 `http://118.196.44.191`。

2026-07-07 素材库数据库链路与生产更新：

- 已提交并部署 `f00de1a Persist generated materials in library` 到生产服务器 `/opt/manjing-video`。
- 本次更新包含：
  - 上传素材、生图结果、提示词素材统一通过 `/api/materials` 保存 PostgreSQL 记录。
  - 生图结果只在真实 URL 返回后进入素材库，不再创建空占位。
  - 团队共享素材从 `/api/materials?scope=team` 读取，支持同租户跨项目复用。
  - 素材库移除旧外部共享素材刷新入口，当前保留“当前项目 / 团队共享”的主流程。
  - 项目素材搜索改为真实过滤。
  - 项目工作区快照同步已部署到生产，并应用 migration `20260707043000_add_project_workspaces`。
- 生产部署验证：
  - `npm run build` 通过。
  - `npx prisma migrate deploy` 已成功应用 `ProjectWorkspace` migration。
  - PM2 `manjing-video` 已重启并在线。
  - `http://118.196.44.191/` 返回 `200 OK`。
  - 直连服务器并指定 `Host: console.manjingstudio.com` 返回 empty reply，域名入口仍保持备案前禁用。

2026-07-07 模型调用策略与剧本工作台重构：

- 模型调用策略已重新设计：
  - 工作台只选择“模型”，不选择渠道。
  - 管理员在模型渠道管理中配置渠道、Base URL、访问凭证、启用状态、手动优先级、并发数。
  - 同一能力类别下，同一个模型 ID 可以由多个渠道提供。
  - 后端按 `能力类型 + 模型 ID` 查找所有启用渠道，并按手动优先级选择实际调用渠道。
  - 当前能力类别为 `text / image / video`，其中 `text` 是文字处理模型，可用于剧本生成、提示词生成、文本优化等。
  - 视频任务创建后会记录实际使用的渠道 ID，后续同步状态继续使用同一渠道查询，避免同模型不同渠道查不到任务。
  - 当前使用 Prisma `ApiProfile` 表存储配置，兼容旧 `.data/api-profiles.json` 自动导入和旧 `scriptModels` 字段；新配置使用 `textModels`。
- 剧本工作台已重构为两段式：
  - `生成输入`：故事想法、主要人物、目标集数、文字处理模型，只用于生成初稿，不自动保存项目剧本。
  - `当前剧本正文`：AI 生成结果、文件导入、手动粘贴/编辑都会进入这里；点击“保存到项目”才写入当前项目。
  - 移除了“风格”字段。
  - 目标集数改为可选文本输入，允许完全清空，不再强制回到 1。
  - 文件导入统一放在当前剧本正文区域，明确会覆盖正文。
  - 优化和大纲/单集拆分只针对当前剧本正文执行。

2026-07-08 安全加固与健壮性优化：

- 已完成一轮代码 review 后的高优先级安全修复，准备提交和部署。
- API 鉴权：
  - `/api/api-profiles` 未登录不可读取；普通用户只能拿到工作台所需的模型能力，管理员才能新增/修改/删除渠道。
  - `/api/scripts`、`/api/images/generate`、`/api/video-tasks`、`/api/video-tasks/status`、`/api/video-files`、`/api/assets/upload` 均已要求登录。
  - 旧外接资产接口 `/api/assets`、`/api/assets/groups` 和余额接口 `/api/user/balance` 已加鉴权，其中余额接口要求管理员。
  - 假项目/分镜接口 `/api/projects`、`/api/shots` 不再返回假成功数据；未登录 401，登录后返回 410，提示使用 `/api/workspaces`。
- SSRF 收紧：
  - 视频创建、状态查询、视频代理不再接受客户端传入的 `api_profile.baseUrl/apiKey`。
  - 后端只按服务端保存的模型渠道和 `profile_id` 选择上游。
- Session 加固：
  - `AUTH_SECRET` 生产环境必须配置，不能回落到默认开发密钥。
  - session payload 增加 `exp`，服务端会校验过期时间。
- 限流：
  - 新增 `lib/rate-limit.ts`，当前为进程内内存限流，适合 PM2 单实例；后续多实例应迁移到 Redis 或数据库。
  - 登录：10 次/分钟。
  - 剧本生成：20 次/10 分钟/用户。
  - 生图：120 次/10 分钟/用户。
  - 视频创建：90 次/10 分钟/用户。
  - 视频状态查询：240 次/分钟/用户。
  - 视频文件代理：120 次/分钟/用户。
  - 素材上传：40 次/10 分钟/用户。
- 安全响应头：
  - `next.config.js` 已增加 `X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 和 CSP。
- 输入边界：
  - 剧本故事想法最多 4000 字，主要人物最多 4000 字，剧本正文最多 30000 字，目标集数 0-300。
  - 生图提示词最多 6000 字。
  - 视频提示词最多 8000 字。
  - 视频参考素材 URL 必须为 `http/https`，单个 URL 最多 2048 字符。
- 上游调用健壮性：
  - 新增 `lib/http.ts`，提供 `fetchWithTimeout` 和 `readLimitedResponseBuffer`。
  - 剧本模型超时 120 秒，生图创建 180 秒，视频创建 60 秒，视频状态查询 30 秒，视频文件代理 60 秒，旧外接资产/余额接口 30 秒。
  - 生图远程图片下载限制为 25MB，且必须返回 `image/*`。
- 工作区并发保护：
  - `/api/workspaces` 保存时带 `lastUpdatedAt`，服务端使用 `updatedAt` 做乐观锁。
  - 如果云端工作区已被其他窗口或成员更新，返回 409，避免静默覆盖。
  - 已有工作区但本地缺少版本信息时也会拒绝覆盖，提示刷新。
- 素材删除权限：
  - 管理员可删，素材创建者可删。
  - 普通成员不能随意删除其他人的团队共享素材。
  - 前端改为服务端删除成功后再从界面移除，避免权限失败但本地已消失。
- 验证记录：
  - `npx tsc --noEmit` 通过。
  - `npm run build` 通过。
  - 本地 5050 首页返回 200。
  - 未登录生成接口返回 401。
  - 登录限流验证：第 11 次错误登录返回 429。
  - 安全响应头已通过 `curl -I` 验证实际返回。

## 已完成的重要修复

- 登录与本地 PostgreSQL/Prisma 账号体系已接入。
- 注册暂时不做，账号由管理员创建。
- 三层角色已建立：`super_admin / tenant_admin / user`。
- 人员管理已支持启用/停用。
- 项目数据目前仍主要保存在 localStorage。
- 左侧导航已按模块切换，不再一页堆所有模块。
- 开发参考图已整理到 `docs/reference/`。
- 删除了用户侧不合理的“高并发视频生成已开启”等提示。
- 删除了“按 task_id 恢复”调试入口。
- 修复了 ZJLJZN/火山 TOS 视频 URL 无法预览/下载的问题。
- `/api/video-files` 允许可信任务查询返回的 HTTPS 视频 URL，并允许 `*.tos-cn-beijing.volces.com`。
- 生成视频时可按当前渠道选择模型 ID。
- 模型渠道管理改为列表优先，新增/编辑表单按按钮展开。
- 右上角用户区域已从重复显示改为更清晰的身份展示方向。
- 项目首页已补充项目删除入口；删除项目需要输入完整项目名称确认，且至少保留一个项目。
- 新建项目类型已收敛为 `AI 漫剧` 和 `AI 真人剧`。
- 项目概览已从泛化占位看板改为当前项目状态、交付进度、风险提示、下一步动作和交付缺口。
- 项目概览已调整为登录后的默认首屏；侧边栏项目分组顺序为“项目列表”在前、“项目概览”在后。
- 项目概览逻辑已重构为 `剧本 -> 分镜 -> 素材 -> 生成任务 -> 交付视频` 的生产链路。
- 视频工作台里的批量入口已改为“提示词拆分分镜”：用户粘贴一整段视频提示词，系统拆成 2-7 个镜头并保存为分镜列表。
- 用户侧已移除“真实 API 说明”、渠道名称、接口地址、模型 ID、Key 隐藏等工程化提示；生成相关反馈改为“配置已保存/任务已提交/正在生成视频”等产品化文案。
- 个人中心已移除 API 密钥页；模型渠道的访问凭证只在系统管理员配置表单中出现，不在普通工作台和任务结果中展示。
- 左侧导航已按 `项目 / 工作台 / 资产 / 设置与管理` 重新分组。
- `项目管理` 已改为 `项目列表`，只负责项目切换、新建、删除。
- `生成任务` 与 `已生成视频` 已合并为 `生成记录`，同页展示任务进度和已完成视频。
- `项目素材` 与 `外接资产` 已统一放到 `资产` 分组，工作台只保留剧本、生图、视频生成、生成记录。
- 已开始拆分过大的 `app/page.tsx`：新增 `app/components/Sidebar.tsx`、`ProjectListSection.tsx`、`ProjectOverviewSection.tsx` 和 `types.ts`。当前先拆展示组件，不迁移业务状态。
- 素材元数据已开始接入 PostgreSQL：
  - 新增 `Material` 表和 `/api/materials`。
  - 已覆盖“本地上传素材”的记录持久化。
  - 上传成功后会保存素材名称、类型、角色、URL、预览地址、存储路径、项目 ID、共享范围和创建人。
  - 登录后进入项目会从数据库读取当前项目素材并合并到本地状态。
  - 删除素材会删除数据库记录，但暂不删除物理文件，避免误删共享或后续需要追溯的文件。
  - 生图工作台生成结果会在真实 URL 返回后写入素材库和 PostgreSQL，不再创建空占位素材。
  - 生成提示词会保存为提示词素材，并写入 PostgreSQL。
  - 团队共享素材已改为从 `/api/materials?scope=team` 读取，同租户/同团队可跨项目复用。
  - 素材库已移除旧的外部共享素材刷新入口，当前只保留“当前项目 / 团队共享”的主流程。
  - 项目素材搜索已从提示文案改为真实过滤。
- 项目工作区已开始接入 PostgreSQL 快照同步：
  - 新增 `ProjectWorkspace` 表和 `/api/workspaces`。
  - 当前以“项目完整工作区快照”的方式保存 `project / shots / tasks / assets / materials`。
  - 登录后会从数据库读取工作区快照并合并到本地项目列表。
  - 当前项目状态变化后会防抖写入数据库。
  - 这样同一团队/同一账号在不同浏览器登录时，可以先共享项目、分镜、生成任务和已生成视频记录。
  - 新建项目会立即写入工作区快照。
  - 删除项目会同步删除数据库中的工作区快照，避免其他浏览器重新拉回已删项目。
  - 这是迁移 localStorage 的第一步；后续仍建议逐步拆成规范化的 `Project / Shot / VideoTask / VideoAsset` 表，减少冲突覆盖。
- 视频工作台 UI 已完成一轮整理：
  - 参考素材独立成区域，不再和参数挤在一行。
  - 提示词输入框独立显示。
  - 设置项拆成网格：全能参考、模型、比例、清晰度、时长。
  - 提交区只保留 `@ 素材` 和 `开始生成`。
  - 去掉 `0 字` 字数显示和向上箭头。
  - 工具栏控件高度和水平线已统一。

## 仍需注意的问题

- `app/page.tsx` 仍然偏大，已先拆出左侧导航、项目列表、项目概览；后续继续拆剧本、生图、视频、资产和生成记录，并逐步拆业务 hooks。
- 项目、分镜、生成记录已开始通过 `ProjectWorkspace` 快照同步到数据库，但前端仍保留 localStorage 作为本地缓存；后续需要继续拆成规范化表。
- 素材迁移已覆盖上传、生图结果、提示词和团队共享读取；项目、分镜、生成记录目前仍主要依赖 `ProjectWorkspace` 快照同步，后续需继续拆成规范化表。
- 模型渠道配置已迁移到 Prisma `ApiProfile` 表；多租户开放前仍需进一步明确平台级/租户级渠道边界。
- 上游生成视频保持上游 URL，不做服务器端视频转存；当前要求是能预览和下载即可。
- 生图工作台已接入生成结果入素材库，但仍需继续打磨参数、历史记录和失败重试体验。
- 服务器部署现在已验证可用；涉及 Prisma migration 的部署必须显式加载服务器 `.env`。
- 2026-07-08 安全加固继续推进：
  - 新增 `AuditLog` Prisma 模型、迁移和 `lib/audit.ts` 审计 helper。
  - 审计写入失败不会阻断主业务；metadata 会截断并按 `key/secret/token/password/authorization` 等敏感字段名脱敏。
  - 已接入登录成功/失败/拦截、模型渠道新增/编辑/启停/删除、视频任务创建、素材删除等审计。
  - 已新增管理员可访问的 `/api/audit-logs` 查询接口和左侧“审计日志”入口，普通用户不可见。
  - 已扩展审计覆盖：成员创建/更新/停用、项目删除、素材上传、图片生成、剧本生成。
  - 已验证：`npx prisma generate`、`npx tsc --noEmit`、`npm run build` 通过；未登录访问 `/api/audit-logs` 返回 JSON 401；失败登录会写入审计；管理员登录后可读取最近审计记录。
  - `npm run lint` 当前不能作为自动校验使用，因为项目尚未配置 ESLint，Next 会进入交互式初始化流程。
- JSON 错误兜底已增强：
  - `fetchWithTimeout` 会把上游超时转换为明确中文错误。
  - 生图、视频创建、视频状态查询、视频文件代理等接口对上游失败/空响应/非 JSON 响应做 JSON 化返回，减少前端 `Unexpected end of JSON input`。
- 2026-07-08 安全 review 后续修复：
  - `.data/api-profiles.json` 写入时显式设置 `.data` 目录权限 `700`、配置文件权限 `600`，降低服务器本地进程直接读取渠道 API Key 的风险。
  - 审计日志顶层 `actorAccount` 和 `targetId` 增加 200 字符截断，避免未登录失败登录路径写入超长账号造成日志膨胀。
  - `/api/audit-logs` 增加管理员查询限流，保持和其他查库接口一致。
  - 模型渠道配置已新增 Prisma `ApiProfile` 表，后续从 `.data/api-profiles.json` 自动导入到数据库；`.data` 文件只作为兼容导入来源。
  - `ApiProfile.encryptedApiKey` 使用 AES-256-GCM 加密落库，加密密钥优先使用 `API_PROFILE_ENCRYPTION_KEY`，未配置时使用 `AUTH_SECRET` 派生；生产应显式配置独立密钥。
  - 渠道 Base URL 保存和路由选择时加入允许域名校验，降低 SSRF/误配置风险。
  - 更长期可继续评估云 KMS/Secrets Manager，替代应用本地持有长期加密主密钥。
  - 审计日志留存/归档策略仍待设计，后续需要避免 `AuditLog` 表长期无限增长。
- 2026-07-09 P1 安全与稳定继续优化：
  - 旧外接素材接口 `/api/assets` 不再调用历史 `aiopenapi.kuaizi.cn` 上游；未登录返回 401，登录后返回 410，并提示改用 `/api/assets/upload` 和 `/api/materials`。
  - 旧素材组接口 `/api/assets/groups` 不再创建历史外接素材组；未登录返回 401，登录后返回 410。
  - 旧余额接口 `/api/user/balance` 不再读取 `SEEDANCE_API_KEY` 或请求历史余额上游；未登录返回 401，管理员登录后返回 410。
  - 前端 URL 素材保存不再尝试注册 `asset://` 外接引用，只把真实 URL 素材写入当前项目素材库数据库记录。
  - 视频任务前端轮询已增加 timer registry：同一任务只保留一个轮询 timer，完成、失败和页面卸载都会清理；失败重试延迟从 5 秒逐步退避到最高 30 秒。
  - 验证：`npm run build` 通过；`npx tsc --noEmit` 在构建后通过；本地 dev 首页返回 200；旧接口未登录返回 401，登录后返回 410。
- 2026-07-09 生产视频失败率排查与修复：
  - 排查确认当天 4 个新视频任务均为“创建成功、上游生成失败”，失败模型为 `doubao-seedance-2-0-260128`。
  - 上游原始失败原因是参考图资源同步失败：`InvalidParameter.WidthTooSmall` 或 `InvalidParameter.HeightTooSmall`，火山要求参考图宽高均在 `300px - 6000px`。
  - 当天失败素材尺寸包括 `360x202`、`202x360`、`360x270`、`360x200`，均有一边低于 300px。
  - 新增轻量图片尺寸解析工具，支持 JPEG/PNG/WebP header 读取，不引入 `sharp` 等重依赖。
  - 上传图片时返回并保存 `width/height`；小于 300px 的图片允许保存，但会提示“不建议直接用于视频生成”。
  - `Material` 表新增 `width`、`height` 字段；素材库卡片会显示尺寸和“尺寸偏小”提示。
  - 视频生成前端会拦截已知尺寸偏小的参考图；后端 `/api/video-tasks` 也会对本服务器 `/uploads/...` 图片读取本地文件尺寸并兜底拦截，避免继续提交给上游。
  - `/api/video-tasks/status` 改为优先返回上游详细 `message`，不再只把 `task failed` 展示给用户。
  - 审计日志补充视频创建字段：`duration / ratio / resolution / inputType / imageCount / videoCount / audioCount / promptLength`；小图拦截记为 `blocked`，上游状态失败记为 `video_task.status`。
  - 生产发现 `c1a93687667...` 和 `663639d868...` 两张素材在 `Material` 表已删除，但仍残留在 `ProjectWorkspace.state.materials` 快照中；原因是素材仍处于数据库表和工作区 JSON 双存储阶段，删除时只删了表记录。
  - `/api/materials` DELETE 已改为幂等：数据库记录已不存在时也返回成功，并清理同租户 `ProjectWorkspace.state.materials` 中 `dbId/id` 匹配的残留项；正常删除时也同步清理快照残留。
  - 验证：`npm run build` 通过；`npx tsc --noEmit` 通过；本地已应用新增 `20260709043000_add_material_dimensions` migration。
- 2026-07-09 去除硬编码演示项目：
  - 前端不再硬编码 `短剧团队 Demo` 和 `demo2` 两个演示项目。
  - 本地缓存为空时只创建一个空白兜底项目 `未命名项目`，不包含演示剧本、分镜或素材。
  - 读取 localStorage 时不再把默认项目 merge 回已保存项目；同时会过滤旧版本已经写入浏览器缓存的 `短剧团队 Demo/demo2` 种子项目。
  - 登录后如果服务器已有工作区，项目列表以服务器工作区为准，不再混入本地兜底项目。
  - “重置演示数据”逻辑改为清空本地项目缓存并重置为空白项目。
  - 验证：`npm run build` 通过；`npx tsc --noEmit` 通过。

## 当前部署状态

- 最新 GitHub/生产 commit：`3223df2 Validate reference image dimensions`。本地另有未部署的去除硬编码演示项目改动。
- 生产服务器 `/opt/manjing-video` 已拉取该 commit。
- 生产 PostgreSQL 当前无待应用 migration。
- 生产 `npm ci`、`npx prisma migrate deploy`、`npm run build`、`pm2 restart manjing-video --update-env` 已执行成功。
- 生产 PM2 应用 `manjing-video` 在线。
- 生产 IP `http://118.196.44.191/` 返回 200。
- 生产 `/api/video-tasks`、`/api/api-profiles` 等未登录接口返回 JSON 401，符合鉴权预期。
- `console.manjingstudio.com` 在备案前仍不开放访问；通过 Host 访问生产 IP 返回空响应，符合当前要求。
- 本地 5050 已重新清理 `.next` 并启动，`http://127.0.0.1:5050/` 返回 200；本地 `ApiProfile` migration 已应用，`/api/api-profiles` 不再因缺表 500。
- 生产已确认新增模型渠道可信域名 `https://gw.aifastnet.com`，同时保留 Base URL 白名单安全边界。
- 生产已完成生成记录 UX 第一阶段：视频工作台只保留最近提交，完整任务历史、筛选、预览、下载、重试统一在“生成记录”。
- 生产已修复 `task failed` 被误当成视频 URL 的问题；生产库已备份并清理 2 条无效视频资产，复扫结果为 `totalBadVideoAssets: 0`。
- 用户已在生产环境做过一轮大致功能查看，当前反馈为核心功能整体正常。

## 建议下一步

优先级从高到低：

1. 跨浏览器共享复测：浏览器 A 新建/编辑项目并生成任务后，浏览器 B 用同一账号登录能看到项目、分镜、生成记录和已生成视频。
2. 素材库数据库链路复测：上传图片 -> 刷新页面仍显示；生图结果 -> 当前项目素材库显示；提示词 -> 提示词分类显示；团队共享 -> 另一个项目可复用。
3. 审计日志前端复测：管理员登录后进入“审计日志”，确认能看到登录失败、登录成功、上传素材、项目删除、生成调用等记录；普通用户不可见。
4. 安全审计继续覆盖：继续检查是否还有遗留/占位路由、未限流查库接口、可触发费用接口或跨租户边界问题。
5. 渠道配置安全继续增强：继续使用 Base URL 白名单；多租户开放前明确平台级/租户级渠道边界；长期评估云 KMS/Secrets Manager。
6. 将 `ProjectWorkspace` 快照逐步拆成规范化的 `Project / Shot / VideoTask / VideoAsset` 表，降低多人同时编辑时的覆盖风险。
7. 供应商适配抽象：把 ZJLJZN/Seedance/AIFastNet 的 URL 拼接、状态解析、结果提取等逻辑抽成 `lib/providers/*`，减少多路由重复。
8. 继续拆分 `app/page.tsx`：优先拆素材库、生图工作台、视频工作台、生成记录，并逐步拆业务 hooks。
9. 生图工作台继续打磨：参数、历史记录、失败重试、生成结果和素材库关系再整理。
10. 备案完成后切回正式域名 HTTPS：`ASSET_PUBLIC_BASE_URL=https://console.manjingstudio.com`，恢复 Secure cookie。
11. 配置 ESLint：当前 `npm run lint` 会进入 Next 交互式初始化，需迁移到非交互式 ESLint CLI 后纳入常规验证。
12. 审计日志留存策略：增加归档或定期清理机制，避免高频生成操作导致 `AuditLog` 表持续膨胀。

## 客户初步使用反馈待优化

这组反馈来自真实初步使用体验，后续排期应优先关注。它们直接影响创作者是否能顺利完成“素材引用 -> 提示词控制 -> 视频生成 -> 不满意重试”的核心闭环。

### AI 生成与核心控制逻辑

1. 严格时长控制：
   - 用户设置生成时长后，例如 6 秒，系统需要尽可能强约束上游模型输出完整 6 秒视频。
   - 当前问题是模型可能根据提示词擅自截断、拆分或理解成多个片段，例如拆成两个 3 秒。
   - 后续需要从提示词模板、参数传递、UI 文案和任务结果校验几层一起处理。
2. 首尾帧控制：
   - 视频生成需要明确支持首帧/尾帧参考图。
   - 目标是提升画面一致性、转场连贯性和角色/场景控制能力。
   - UI 上应避免用户猜测“参考图到底用在哪里”，需要在视频工作台中形成清楚入口。

### 素材管理与引用机制

3. 多媒体参考源入口可见性：
   - 用户目前找不到音频参考、视频参考的上传和引用位置。
   - 需要在素材库和视频工作台里明确图片、视频、音频分别如何上传、如何选为参考。
4. `@` 引用位置灵活化：
   - 当前 `@` 引用素材会默认堆到提示词结尾。
   - 需要支持在光标当前位置插入素材标签，让用户能把素材引用放在 prompt 中间或指定语义位置。
5. 素材命名生命周期管理：
   - 上传素材时默认读取并保留本地文件名。
   - 素材库/素材列表需要支持重命名编辑。
   - 命名应贯穿上传、引用、生成记录和后续检索，减少“角色参考图 1/未命名素材”这类不可识别资产。

### 交互体验与工作流优化

6. 重绘/重新生成闭环：
   - 用户对视频不满意时，点击“重新生成”应自动把上一轮提示词回填到描述窗口。
   - 操作分支要清楚分成：
     - 直接重新生成：基于原提示词重新调用。
     - 编辑后重新生成：允许用户先微调提示词再提交。
   - 后续也可记录上一轮使用的模型、时长、比例、参考素材，减少用户重复配置。
7. 桌面端拖拽上传：
   - 描述窗口/对话框需要支持 Drag & Drop。
   - 用户可以直接把桌面图片、视频、音频拖入输入区域，系统完成上传并预引用。
8. 时间线展示排序：
   - 视频结果列表/Feed 需要倒序排列。
   - 新生成的视频应显示在最上方，减少用户寻找最新结果的成本。

### 反馈转化后的产品优先级建议

1. 先处理视频工作台核心闭环：严格时长提示词约束、首尾帧入口、音频/视频参考入口、`@` 光标插入。
2. 再处理素材生命周期：上传保留本地文件名、素材重命名、素材引用名称一致。
3. 然后处理重试体验：重新生成回填上一轮参数，区分直接重跑和编辑后重跑。
4. 最后处理增强交互：拖拽上传、结果倒序、生成 Feed 细节。

### 已处理的客户反馈小项

- 已完成第 1 组低风险高收益优化：
  - 视频生成记录和已完成视频列表改为最新优先展示。
  - 上传素材默认保留本地文件名；素材名称输入框留空时使用文件名，不再默认覆盖为“角色参考图”。
  - 素材库增加重命名入口；有数据库记录的素材会通过 `/api/materials` PATCH 持久化，旧本地素材可本地改名。
  - 视频提示词里的 `@` 引用改为插入到光标当前位置，不再强制追加到结尾，并会保留输入框焦点。
- 已完成第 2 组视频工作台参考素材区域重构：
  - 视频工作台参考素材区从单一缩略图条改为四个明确入口：参考图、首尾帧、参考视频、参考音频。
  - 首尾帧不再拆成两个并列概念，而是作为一个完整的“首尾帧生成”能力呈现，内部包含首帧/尾帧两个槽位。
  - 每个入口只显示素材库中对应类型和用途的素材，避免用户找不到音频/视频参考位置。
  - 每个入口提供“上传对应素材”动作，会跳转到素材库并预设素材类型和素材角色。
  - 已沿用现有真实生成链路：`images/videos/audios` 会随任务提交，`first_frame/last_frame` 会触发 `first_last_frame` input type，没有新增空能力。
  - 已按火山/字节首尾帧格式收紧：前端必须同时选择首帧和尾帧才允许提交；后端在 `input_type=first_last_frame` 时要求至少 2 张图，并只传 `images: [首帧URL, 尾帧URL]`。
- 已验证：`npm run build` 通过，`npx tsc --noEmit` 通过，本地 5050 首页返回 200，未登录 `/api/materials` 和 `/api/video-tasks` 返回 JSON 401。
- 已完成第 3 组严格时长与重生成闭环：
  - 视频工作台普通生成不再自动把长提示词拆成多个分镜；拆分保留在“提示词拆分分镜”这个显式动作里，避免用户选择 6 秒却被系统拆成多个片段。
  - 前端在提交视频任务前会包装“严格时长控制”提示词，明确要求按用户选择的秒数生成一个完整连续单镜头，禁止自动分割、压缩成 3 秒或多段拼接。
  - 后端 `/api/video-tasks` 也增加同样的时长控制包装，并统一使用规范化后的 `duration` 写入上游 payload，防止旧客户端或绕过前端时丢失时长约束。
  - `VideoTask` 增加 `snapshot`，记录上一轮生成使用的提示词、模型、比例、时长、清晰度、内部素材、外部素材、全能参考状态和 input type。
  - 生成记录增加“直接重新生成”和“编辑后重新生成”两个动作：前者用上一轮 snapshot 立即新建并提交任务，后者把上一轮参数和参考素材回填到视频工作台，用户可微调后再点开始生成。
  - 直接重新生成已改为显式传入 `GenerationContext`，不依赖 React 状态刚回填后的异步读取，避免参考素材/模型被读成旧状态。
  - 生成记录中补充展示任务快照摘要，例如 `6s / 9:16 / 720p / 首尾帧 2 个`，让用户知道这条记录当时用的关键参数。
  - 已验证：`npm run build` 通过，`npx tsc --noEmit` 通过；本地 5050 清理 `.next` 后启动成功，首页返回 200；未登录 `/api/video-tasks` GET/POST 返回 JSON 401。
  - 带本地 seed 管理员登录后，测试 `first_last_frame` 缺少尾帧的请求没有进入上游；当前本地先被“没有启用渠道支持所选视频模型”挡住，说明本地需要先配置匹配视频模型后才能继续验证首尾帧 400 校验分支。该校验代码已在后端保留。
- 已完成视频工作台参考素材小优化：
  - 参考图片继续显示真实图片预览。
  - 参考视频、参考音频不再用 `<img>` 渲染，避免把视频/音频 URL 当图片导致破图；改为稳定的“视频/音频”类型标识。
  - 参考选择面板和全能参考面板同步使用类型标识逻辑。
  - 右上角按钮文案从 `@ 插入提示词` 改为 `@ 插入到提示词`，降低歧义。
  - 已验证：`npm run build` 通过，`npx tsc --noEmit` 通过；本地 5050 清理 `.next` 后启动成功，首页返回 200。
- 已完成首尾帧引用逻辑优化：
  - 首尾帧从“上传首帧图/尾帧图”改为“从已有参考图片中指定首帧/尾帧”。
  - 素材库图片上传只保留“参考图”角色，避免用户误以为首帧/尾帧是两种独立素材类型。
  - 视频工作台首尾帧槽位会记录指定的参考图片 ID，并在生成时按火山/字节 `first_last_frame` payload 透传为 `[首帧URL, 尾帧URL]`。
  - 重生成 snapshot 会保留首帧/尾帧指定关系，编辑后重生成和直接重生成都能恢复。
- 已完成多场景总时长提示词增强：
  - 严格时长提示词不再强调“单镜头”，改为“一个完整视频”。
  - 当提示词包含“场景1/2、场景2/2”或多个段落时，明确要求模型理解为同一个总时长视频内部的连续场景变化，不拆成多个独立视频。
  - 前端和 `/api/video-tasks` 后端兜底都已同步该提示词约束。
- 已完成素材库预览增强：
  - 图片素材点击预览区可放大查看。
  - 视频素材点击预览区可在弹层播放。
  - 音频素材点击预览区可在弹层播放。

### 客户反馈剩余待处理

1. 多场景总时长控制：严格时长的核心不是只做成片秒数检查，而是当提示词包含“场景1/2 ... 场景2/2 ...”这类结构时，仍然按用户选择的总时长生成一个完整视频。例如选择 6 秒，就应理解为 6 秒视频里包含两个场景，而不是自动拆成“场景1 3 秒 + 场景2 3 秒”的多个独立视频。后续需要继续优化提示词包装、UI 文案和模型调用描述。
2. 参考素材引用可视化：生成记录和分镜列表里展示本次用到的素材名称，而不只是数量。
3. 生成结果质量反馈：在已完成视频上增加“不满意/满意”或备注入口，用于后续模型渠道质量统计和人工优先级调整。
4. 重生成体验细化：后续可增加“使用同一 seed/随机 seed”的明确选项；当前上游 payload 暂未暴露 seed 控制，先保留直接重跑。
5. 拖拽上传：视频描述窗口/参考素材区域支持桌面拖拽上传，并自动预引用到当前生成上下文。当前先记录为后续锦上添花，不作为近期主线优先级。
