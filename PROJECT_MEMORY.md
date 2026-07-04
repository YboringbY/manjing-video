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
- 当前不要动服务器，除非用户明确说部署或同步服务器。

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

线上对象存储尚未接入。用户目前有 500G 服务器存储，但最终仍建议使用对象存储承载图片/视频。

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

## 仍需注意的问题

- `app/page.tsx` 仍然过大，后续需要拆组件和拆业务逻辑。
- 项目、分镜、素材、生成记录大多仍在 localStorage，需要逐步迁移到数据库。
- 模型渠道配置目前用 `.data/api-profiles.json`，后续应迁移到数据库并按租户/平台权限隔离。
- 上游生成视频没有自动转存到自有存储。
- 生图工作台目前还不是完整真实生图链路。
- 服务器环境不要贸然同步，需先在本地完成一轮稳定验证。

## 建议下一步

优先级从高到低：

1. 确认 `super_admin` 登录后左侧“模型渠道管理”可见，渠道列表、编辑、设为当前、并发数都可用。
2. 确认视频工作台模型下拉来自当前渠道的视频模型列表。
3. 生成一条 ZJLJZN Seedance 任务，验证创建、同步状态、预览、下载完整闭环。
4. 梳理项目/分镜/素材/任务的数据模型，准备从 localStorage 迁移到 PostgreSQL。
5. 设计自有对象存储方案，明确图片、视频、参考素材、生成结果的存储生命周期。
6. 本地稳定后再推 GitHub，最后由服务器拉取更新。
