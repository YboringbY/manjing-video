# 漫镜视频项目记忆

更新时间：2026-07-04

## 项目定位

漫镜视频是面向短剧团队的 AI 视频生产工作台。当前处于本地快速迭代 MVP，目标是先跑通内部团队使用流程，再逐步演进为 SaaS 多租户产品。

当前核心流程：

- 登录进入工作空间。
- 创建/切换项目。
- 管理剧本、分镜、素材。
- 选择模型渠道和模型 ID。
- 调用 Seedance 2.0 生成视频。
- 同步生成任务状态，预览或下载生成视频。

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
- 文件型 `.data/api-profiles.json` 暂存模型渠道配置
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
  - 当前仍使用 `.data/api-profiles.json` 存储配置，并兼容旧的 `scriptModels` 字段；新配置使用 `textModels`。
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
- 模型渠道配置目前用 `.data/api-profiles.json`，后续应迁移到数据库并按租户/平台权限隔离。
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

## 建议下一步

优先级从高到低：

1. 在生产 IP 模式下再做一次完整用户路径：登录 -> 上传图片 -> 素材库显示 -> 视频工作台选为参考 -> 提交生成。
2. 验证跨浏览器共享：浏览器 A 生成任务后，浏览器 B 用同一账号登录能看到项目、分镜、生成记录和已生成视频。
3. 验证素材库数据库链路：上传图片 -> 刷新页面仍显示；生图结果 -> 当前项目素材库显示；提示词 -> 提示词分类显示；团队共享 -> 另一个项目可复用。
4. 将 `ProjectWorkspace` 快照逐步拆成规范化的 `Project / Shot / VideoTask / VideoAsset` 表，降低多人同时编辑时的覆盖风险。
5. 生成一条 ZJLJZN Seedance 任务，验证创建、同步状态、预览、下载完整闭环。
6. 继续拆分 `app/page.tsx`：优先拆素材库、生图工作台、视频工作台和生成记录。
7. 备案完成后切回正式域名 HTTPS：`ASSET_PUBLIC_BASE_URL=https://console.manjingstudio.com`，恢复 Secure cookie。
