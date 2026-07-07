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
  - 当前优先覆盖“本地上传素材”的记录持久化。
  - 上传成功后会保存素材名称、类型、角色、URL、预览地址、存储路径、项目 ID、共享范围和创建人。
  - 登录后进入项目会从数据库读取当前项目素材并合并到本地状态。
  - 删除素材会删除数据库记录，但暂不删除物理文件，避免误删共享或后续需要追溯的文件。
  - 生图结果、提示词素材、团队共享跨项目读取还需要后续继续完善。
- 视频工作台 UI 已完成一轮整理：
  - 参考素材独立成区域，不再和参数挤在一行。
  - 提示词输入框独立显示。
  - 设置项拆成网格：全能参考、模型、比例、清晰度、时长。
  - 提交区只保留 `@ 素材` 和 `开始生成`。
  - 去掉 `0 字` 字数显示和向上箭头。
  - 工具栏控件高度和水平线已统一。

## 仍需注意的问题

- `app/page.tsx` 仍然偏大，已先拆出左侧导航、项目列表、项目概览；后续继续拆剧本、生图、视频、资产和生成记录，并逐步拆业务 hooks。
- 项目、分镜、素材、生成记录大多仍在 localStorage，需要逐步迁移到数据库。
- 素材迁移已开始，但目前只有上传素材写入 PostgreSQL；项目、分镜、生成记录和生图/提示词素材仍需继续迁移。
- 模型渠道配置目前用 `.data/api-profiles.json`，后续应迁移到数据库并按租户/平台权限隔离。
- 上游生成视频没有自动转存到自有存储。
- 生图工作台目前还不是完整真实生图链路。
- 服务器部署现在已验证可用；涉及 Prisma migration 的部署必须显式加载服务器 `.env`。

## 建议下一步

优先级从高到低：

1. 在生产 IP 模式下再做一次完整用户路径：登录 -> 上传图片 -> 素材库显示 -> 视频工作台选为参考 -> 提交生成。
2. 完善素材数据库化：生图结果、提示词素材、团队共享跨项目读取都写入/读取 PostgreSQL。
3. 梳理项目/分镜/任务的数据模型，继续从 localStorage 迁移到 PostgreSQL。
4. 生成一条 ZJLJZN Seedance 任务，验证创建、同步状态、预览、下载完整闭环。
5. 设计生成视频自有转存：上游视频完成后拉取到 `/data/manjing/generated` 或对象存储，并保存自有 URL。
6. 备案完成后切回正式域名 HTTPS：`ASSET_PUBLIC_BASE_URL=https://console.manjingstudio.com`，恢复 Secure cookie。
