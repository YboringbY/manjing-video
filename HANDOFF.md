# 漫镜视频平台交付说明

## 项目路径

```bash
/Users/sarah/Documents/日常/manjing-video
```

## 技术栈

- Next.js 14
- React
- TypeScript
- App Router

## 本地启动

```bash
npm install
npm run dev
```

默认端口为 `3000`。如果 `3000` 被占用，Next.js 会自动切到 `3001`。

## 构建验证

```bash
npm run build
```

当前交付前已验证构建通过。

## 第三方 API Profile

入口在平台的 `第三方 API Profile` 区域。

功能：

1. 当前使用接口下拉框支持选择：
   - 已保存 Profile
   - `+ 添加第三方 API`

2. 选择 `+ 添加第三方 API` 后：
   - 平台名称为空
   - 当前 Base URL 为空
   - API Base URL 为空
   - API Key 为空
   - 模型名为空

3. 填写 Base URL / API Key 后，会自动尝试补齐平台名称和模型名：
   - Ark v3：`/api/v3`、`43.159.135.17`、`arkr_`
   - AIfastgate：URL 包含 `aifastgate`
   - 其它第三方：按 URL hostname 推断名称

4. 保存 Profile 后：
   - 真实 API Key 只保存在服务端
   - 前端不会展示 API Key 明文或片段
   - 列表只显示 `已隐藏` / `未配置`

## 服务端 API Profile 存储

相关文件：

```bash
app/api/api-profiles/route.ts
app/api/api-profiles/store.ts
```

服务端存储位置：

```bash
.data/api-profiles.json
```

注意：

- `.data/` 已加入 `.gitignore`
- 交付 zip 不包含 `.data/api-profiles.json`
- 默认 Ark v3 API Key 不写在源码里，可通过环境变量 `ARK_V3_API_KEY` 配置，或部署后通过 UI 添加 Profile
- 部署时可以通过 UI 重新添加 Profile，或由部署人员在服务器上安全写入 `.data/api-profiles.json`

## 防止误用其它 API

以下接口都使用 `profile_id` 精确查找服务端 Profile：

```bash
/api/video-tasks
/api/video-tasks/status
/api/video-files
```

如果选中的 `profile_id` 不存在，后端会直接报错，不会自动回退到 Ark 或 AIfastgate。

## Ark v3 说明

当前默认 Ark v3 测试 Profile：

```text
名称：Ark v3 测试平台
Base URL：http://43.159.135.17/api/v3
模型：doubao-seedance-2-0-fast-260128
```

Ark v3 注意事项：

- 创建任务：`/contents/generations/tasks`
- 任务列表：`/contents/generations/tasks?page=1&page_size=500`
- 成功视频一般在：`content.video_url`
- 单任务详情接口可能返回 `invalid job id`，因此状态查询有列表兜底
- Ark 视频文件域名：`ark-acg-cn-beijing.tos-cn-beijing.volces.com`
- 代理 signed TOS mp4 URL 时不要附加 Authorization header

## 任务/视频恢复规则

- 不全量导入第三方账号历史任务，避免导入无关视频
- `同步本页任务状态` 只同步本页已有 `providerTaskId` 的任务
- `按 task_id 恢复` 只恢复输入的精确任务 ID
- `cgt-...` 会优先按 Ark v3 Profile 查询

## 生成任务管理

- 生成中任务可删除
- 删除任务会：
  - 从任务列表移除
  - 删除对应 `providerTaskId` 的本地资产记录
  - 如果分镜没有其它任务，状态恢复为待生成

## 打包排除项

交付 zip 应排除：

```text
node_modules/
.next/
out/
.data/
.env*.local
.DS_Store
*.zip
```

## 交付前检查

```bash
npm run build
```

当前已通过。

## GitHub 与生产部署

GitHub 仓库：

```text
https://github.com/YboringbY/manjing-video
```

本地开发目录：

```text
/Users/keyang/Desktop/manjing_SaaS/manjing-video
```

本地开发启动：

```bash
npm run dev -- -p 5050
```

生产服务器：

```text
118.196.44.191
```

生产部署目录：

```text
/opt/manjing-video
```

生产访问地址：

```text
http://118.196.44.191/
```

生产部署命令：

```bash
cd /opt/manjing-video
./scripts/deploy.sh
```

部署脚本会从 GitHub `main` 分支拉取代码、安装依赖、构建并重启 PM2 应用。

运行方式：

- PM2 应用名：`manjing-video`
- Next.js 监听：`127.0.0.1:3000`
- nginx 监听公网 80 端口并反代到 Next.js
- `.data/api-profiles.json` 是线上数据文件，不进入 Git

密钥注意：

- 服务器 SSH 私钥：`/Users/keyang/Desktop/manjing_SaaS/manjing.pem`
- 本地 GitHub key：`/Users/keyang/Desktop/manjing_SaaS/github_manjing_local`
- 服务器 deploy key：`/root/.ssh/github_manjing_deploy`
- 不要提交 `.env*.local`、`.data/`、API Key 或任何私钥文件。
