# 漫镜视频 Handoff

更新时间：2026-07-11

## 2026-07-11 生产发布

- 业务提交 `c7ffc16` 已推送并部署，主线是结束 `ProjectWorkspace.state` 业务数组双写，改用项目/分镜/任务/视频资产/素材关联的规范化表和细粒度 API。
- 新增 5 条 migration：移除旧工作区业务数组、项目素材关联、项目/分镜版本、任务评价、视频资产自增 ID。
- 已修复恢复审查发现的项目 version 丢失、无 Workspace 的规范化项目不返回、IPv6 内网 URL 漏拦截、客户端伪造 `storagePath` 可触发文件删除、供应商 `/v1/v1` 路径重复等问题。
- 本地 17 条 migration 已全部应用；Prisma validate/generate、TypeScript、生产 build 均通过。
- 已用临时数据实测项目/分镜 409 乐观锁、团队素材跨项目生命周期、文件路径安全和 IPv4/IPv6 内网 URL 拦截，临时业务数据均已清理。
- 生产 17 条 migration 已全部应用，构建通过，PM2 在线，公网首页 200，未登录鉴权 401。
- 生产临时项目已验证项目/分镜乐观锁、规范化读取和删除闭环，测试数据已清理。
- 发布备份位于 `/data/backups/manjing-video-db-pre-c7ffc16-20260711-104650.dump` 和 `/data/backups/manjing-video-code-pre-c7ffc16-20260711-104650.tar.gz`。
- 当前生产业务项目、素材、任务均为 0；账号、模型渠道和审计数据正常保留。

## 当前状态

- 项目路径：`/Users/keyang/Desktop/manjing_SaaS/manjing-video`
- 本地开发：`http://localhost:5050`
- 生产入口：`http://118.196.44.191`
- 生产域名 `console.manjingstudio.com` 备案前不要恢复访问。
- 最新生产提交：`c7ffc16 Normalize project workflows and material lifecycle`
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

1. 补 `Material` 到 `Project` 的数据库外键和级联删除。
2. 设计并逐步实现细粒度 API：
   - 项目基础信息
   - 剧本正文
   - 分镜
   - 视频任务
   - 视频结果
3. 把前端写入从整包 `/api/workspaces` 迁到细粒度 API，降低写放大。
4. 明确 `ProjectWorkspace.state` 退役策略：只作为旧数据兼容/归档，不再作为实时业务真相。
5. 继续处理客户反馈：
   - 多场景总时长控制。
   - 生成记录展示本次引用素材名称。
   - 拖拽上传作为后续增强项。

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
