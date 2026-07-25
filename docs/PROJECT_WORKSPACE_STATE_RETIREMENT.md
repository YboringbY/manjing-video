# ProjectWorkspace.state 只读依赖清单与退役设计

更新时间：2026-07-25

## 结论

`ProjectWorkspace.state` 目前不是项目、分镜、视频任务、视频资产或素材关系的业务权威。上述数据已经由规范化表和细粒度 API 提供；`state` 保留为项目工作区兼容元数据、乐观并发版本和旧客户端响应形状的过渡层。

本文件是只读设计清单，不修改 schema、不新增 migration、不删除 JSON 字段、不清理数据库行，也不改变生产 API 合约。

## 规范化权威来源

| 业务内容 | 当前权威来源 | `state` 的处理 |
| --- | --- | --- |
| 项目名称、类型、剧本、版本 | `Project` | GET 时覆盖同名字段；POST 只保留兼容 `project` 外壳和 `id` |
| 分镜 | `Shot` | POST 强制写入空数组；GET 从表组装 |
| 视频任务 | `VideoTask` | POST 强制写入空数组；GET 从表组装 |
| 视频资产 | `VideoAsset` | POST 强制写入空数组；GET 从表组装 |
| 项目素材和素材关系 | `Material`、`ProjectMaterial` | POST 强制写入空数组；页面单独请求 `/api/materials?projectId=...` |
| 生图任务 | `ImageTask` | 不在工作区 JSON 中；页面单独请求 `/api/image-tasks` |

## 当前运行时依赖

| 位置 | 读取或写入 | 目的 | 退役前要求 |
| --- | --- | --- | --- |
| `app/api/workspaces/route.ts` 的 `ProjectWorkspace` 查询/创建/更新 | 读写整行 `state` | 保留工作区记录、`updatedAt` 乐观并发、更新人和兼容返回形状 | 先定义最小工作区元数据 payload 与版本协议 |
| `compatibilityState()` | 写入 `project.id`，清空 `shots/tasks/assets/materials` | 阻止旧业务数组再次双写 | 必须保留此保护，直到所有客户端停止提交 JSON 快照 |
| `hydrateWorkspace()` | 读取兼容基础对象，覆盖并注入 `Project/Shot/VideoTask/VideoAsset` | 保持 `/api/workspaces` 对前端和 smoke 的现有响应形状 | 先为新的元数据端点和现有响应分别建立契约测试 |
| `workspaceStateForSync()` / `projectStatesForCache()` | 写入清空后的兼容状态到 localStorage 和 POST | 防止浏览器缓存重新成为业务权威 | 先确认离线/刷新/项目切换只需要项目元数据 |
| `projectStatesFromWorkspaces()` | 读取 GET 的水合状态 | 前端初始化项目列表、当前项目和剧本 | 前端改为组合 `/api/projects` 与细粒度资源前，不能移除水合字段 |
| 工作区自动同步 effect 与 `saveWorkspaceSnapshot()` | POST 兼容状态并携带 `lastUpdatedAt` | 工作区版本同步和新项目初始化 | 替换为明确的 metadata PATCH 前，不能删除 `updatedAt` 并发控制 |
| `scripts/production-smoke.mjs` | 读取水合 `shots/tasks/assets/project.materialCount` | 对比细粒度 API 与工作区响应，防素材/任务可见性回归 | 新 API 响应稳定后迁移 smoke，保留跨资源一致性断言 |
| `scripts/core-api-integration.mjs` | 创建和删除测试工作区 | 验证项目生命周期兼容路径 | 新元数据 API 完成后替换测试，不在生产删除历史工作区 |
| 备份与业务守恒脚本 | 统计 `ProjectWorkspace` 行数和主键指纹 | 发布保护与事故恢复审计 | 在表退役前持续保留；若未来迁移，先增加新旧双指标并审查备份恢复 |

## 已知非运行时引用

- 历史 migration、事故记录和项目记忆中存在 `ProjectWorkspace.state` 的旧双写/恢复背景；它们是审计证据，不能据此执行清理。
- 项目删除路由会删除对应 `ProjectWorkspace` 行，但这是项目删除流程的一部分；任何调整都属于高风险生产数据操作，需要单独影响报告、备份和批准。

## 分阶段退役方案

### 阶段 A：冻结并观察（当前）

- 保持 JSON 字段和行不变。
- 所有业务数组继续在 POST 时清空，GET 继续从规范化表水合。
- 继续使用新浏览器上下文验证项目、素材、任务和资产可见性。
- 为工作区响应建立明确契约：项目兼容元数据 + 规范化表水合数据，而不是持久化业务快照。

### 阶段 B：最小元数据契约

- 先定义客户端真正需要持久化的工作区字段清单；预计只包括项目兼容信息、工作区更新时间、更新人和未来明确的 UI 偏好。
- 新增明确的 metadata 读写接口或收敛现有 POST payload；不得在此阶段删除旧字段。
- 双读验证至少覆盖登录、刷新、项目切换、创建项目、剧本保存、素材上传、视频任务轮询和生成记录刷新。

### 阶段 C：迁移准备

- 连续稳定发布后，确认没有旧客户端、脚本或运营工具依赖 JSON 业务数组。
- 先以只读报表检查生产每行 `state` 的真实键集合、大小分布和最后更新时间；不得按项目名、ID 或 Demo 标识筛选或删除。
- 为数据库备份恢复、回滚和 API 兼容期制定新旧双向验证，且需要用户单独批准。

### 阶段 D：受控退役

- 仅在阶段 C 验收完成后，以独立 schema/migration 变更处理。
- 任何缩减 JSON 字段、删除 `ProjectWorkspace` 行或修改项目删除关系，都必须单独说明影响表与行数、备份位置、停机、回滚和浏览器验收，并获得明确批准。

## 当前禁止项

- 不删除 `state` 列、不执行 `DELETE`/`TRUNCATE`/清理 migration。
- 不恢复历史 JSON 业务数组为权威数据。
- 不用数据库行数、接口 `200` 或项目名替代真实页面验收。
- 不将本清单解释为已批准的数据库变更。
