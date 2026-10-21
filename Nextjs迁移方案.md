# M-AI-E Next.js 迁移方案

> 版本：v1.0 　日期：2026-10-21
> 目标：把「Express + 原生 JS 单页」迁移为「Next.js 全栈管理后台」，产品需求与业务逻辑不变。

---

## 1. 需求梳理（保持不变）

| 模块 | 需求 |
|---|---|
| 取数 | 输入 MasterGo 令牌 + 文件链接/fileId，经 Magic MCP 拉取 Section DSL + SVG，缓存到 `samples/` |
| 转换 | 规则引擎把 DSL 转译为 Elementor `_elementor_data` 结构，可选 LLM 语义化增强 |
| MasterGo | 模板历史列表、结构预览、下载 `.json`、删除；新建转换（取数→转译→预览/上传） |
| 上传网站 | 一键写入 WordPress（REST/插件模式）、下载 `mae-import.zip` 导入插件 |
| 后台形态 | 登录 + 侧边栏导航 + 多页面：工作台 / MasterGo / 站点管理 / 用户管理 / 设置 |
| 持久化 | 模板、设置、用户、会话、站点存 SQLite（`server/data/mae.db`，node:sqlite），重启不丢 |

## 2. 技术选型

- Next.js 16（App Router）+ React 19 + TypeScript
- Tailwind CSS 4 + lucide-react（后台 UI）
- 服务端能力复用 `server/services/*.js`、`server/store.js`（不重写业务逻辑）
- Route Handlers 替代 Express；`next.config.ts` 配置 `serverExternalPackages`

## 3. 目录结构（迁移后）

```
app/
├─ layout.tsx / globals.css / page.tsx         # 根布局，/ 重定向到 /dashboard
├─ (admin)/
│  ├─ layout.tsx                               # 侧边栏 + 顶栏布局
│  └─ dashboard|convert|templates|deliver|settings/page.tsx
└─ api/
   ├─ mastergo/parse/route.ts
   ├─ convert/route.ts
   ├─ templates/route.ts
   ├─ template/[id]/route.ts                   # GET 下载 / DELETE
   ├─ preview/[id]/route.ts
   ├─ site/plugin|import/route.ts
   └─ settings/route.ts
components/                                    # 侧边栏等客户端组件
server/services/*.js  server/store.js          # 复用（不变）
samples/  server/data  scripts/                # 不变
```

## 4. API 设计（与旧版对齐）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/mastergo/parse | 取数，返回 meta + sections 概览 |
| POST | /api/convert | 转换（可选 LLM 增强），返回 { id, title, stats, enhanced } |
| GET | /api/templates | 模板历史列表（倒序） |
| GET / DELETE | /api/template/:id | 下载 .json / 删除 |
| GET | /api/preview/:id | 结构树 + LLM 增强预览 |
| GET | /api/site/plugin | 下载导入插件 zip |
| POST | /api/site/import | 一键写入 WP |
| GET / PUT | /api/settings | 读取/保存设置 |

## 5. 执行步骤

1. 编写方案文档（本文）
2. 搭建 Next.js 工程骨架（package.json / tsconfig / next.config / Tailwind）
3. 实现 8 个 Route Handler
4. 实现后台 UI（布局 + 5 页面）
5. 清理旧 Express 代码、更新技术方案文档
6. `npm run build` + API 冒烟验证

## 6. 验收标准

- `npm run build` 通过，`npm run dev` 可访问
- 转换 → 下载 → 导入链路可用（依赖 samples/ 数据）
- 模板历史与设置重启不丢（`server/data/mae.db` SQLite；旧 JSON 自动迁移）
- 侧边栏导航 + 5 个后台页面完整可切换
