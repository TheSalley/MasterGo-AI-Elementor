# M-AI-E Web 应用技术方案

> 版本：v1.1　日期：2026-10-21
> 定位：把「MasterGo 设计稿 → AI → Elementor 页面」做成**本地单机 Web 工具**。
> 技术栈：Next.js 16.4（App Router）+ React 19 + TypeScript + Tailwind CSS 4（2026-10-21 由 Express + 原生 JS 迁移；2026-10-21 升级至 Next 16）。

---

## 1. 产品形态（已确认决策）

| 决策点 | 结论 |
|---|---|
| 部署形态 | **本地单机工具**（`npm run dev/start` 起服务，浏览器 localhost:4300 访问） |
| 产品形态 | **管理后台**：登录 + 侧边栏导航；工作台 / MasterGo（模板列表·新建转换·上传网站）/ 站点管理 / 用户管理 / 设置 |
| 页面预览 | **可视化预览**：`_elementor_data` 服务端渲染为 HTML，iframe 实时预览（桌面/平板/手机三档宽度）+ 结构树双视图 |
| MasterGo 接入 | **双通道**：Magic MCP（首选，已验证）+ REST API（备选） |
| 站点导入 | **两者都做**：下载 `.json` 手动导入 + 填 WP 凭据一键写入 |
| 转译引擎 | **规则 + LLM 增强**：确定性规则打底，LLM 做布局智能还原/命名清洗 |
| 持久化 | 模板历史与设置存 SQLite（`server/data/mae.db`，Node 内置 `node:sqlite` 零依赖），重启不丢 |

## 2. 整体架构

```
┌─ Next.js 管理后台（App Router，React + Tailwind）────────┐
│  /dashboard   工作台（服务端组件，直读 store）           │
│  /templates   MasterGo（模板列表 / 新建转换 / 上传网站） │
│  /sites       站点管理（仅管理员）                      │
│  /users       用户管理（仅管理员）                      │
│  /settings    设置（令牌 / LLM / WP 默认值保存）         │
│  /login /register  登录 / 首次注册管理员                │
└───────────────────────────────┬─────────────────────────┘
                                │ HTTP（同源 Route Handlers）
┌─ Next.js Route Handlers（app/api/*/route.ts）────────────┐
│  POST /api/auth/login|logout  登录 / 退出（会话 Cookie）│
│  GET  /api/auth/me            当前登录用户              │
│  POST/GET /api/auth/register  首个用户注册（→ admin）   │
│  POST /api/mastergo/parse  取数 → 返回 DSL 概览          │
│  POST /api/convert         转译 → 返回 Elementor JSON    │
│  GET  /api/templates       模板历史列表                  │
│  GET/DELETE /api/template/:id  下载 .json / 删除        │
│  GET  /api/preview/:id     结构树 + LLM 增强预览         │
│  GET  /api/preview/:id/html  可视化预览（渲染为 HTML）   │
│  GET  /api/site/plugin     下载 mae-import.zip 插件      │
│  POST /api/site/import     一键写入 WP                   │
│  GET/PUT /api/settings     设置读写                      │
│  GET/POST /api/users · /api/users/:id  用户管理（admin）│
│  GET/POST /api/sites · /api/sites/:id  站点管理          │
│  POST /api/sites/:id/test             测试连接（插件/密钥）│
│  GET/DELETE /api/deliveries           上传交付记录         │
└──────┬──────────────────────┬───────────────────────────┘
       │                      │
  MasterGo Magic MCP      WordPress REST API / 导入插件
  (token + fileId/layerId)  (创建页面 + 写 _elementor_data)
```

## 3. 目录结构

```
MAE/
├─ app/                      # Next.js App Router
│  ├─ layout.tsx / page.tsx  # 根布局；/ 重定向到 /dashboard
│  ├─ globals.css            # Tailwind 入口
│  ├─ login|register/        # 登录 / 首次注册（首个用户→管理员）
│  ├─ (admin)/               # 后台布局 + 页面（layout 校验登录，未登录跳转 /login）
│  │  ├─ layout.tsx          # 侧边栏（含用户区/退出）+ 内容区（服务端组件）
│  │  └─ dashboard|templates|sites|users|settings/page.tsx
│  └─ api/                   # Route Handlers（见 §4）
│     ├─ mastergo/parse|convert|templates|template/[id]
│     ├─ preview/[id]（结构树）| preview/[id]/html（可视化渲染）
│     ├─ site/plugin|import|sites|settings
│     ├─ auth/login|logout|me|register
│     ├─ users|users/[id]
├─ components/               # 侧边栏、UI 基础组件、模板预览等
├─ lib/                      # 客户端 fetch / 格式化 / 服务端路径
├─ server/
│  ├─ services/              # 业务逻辑（mg-client 取数、converter 转译、
│  │                         #   llm 增强、wp-import 导入、images）
│  ├─ auth.js                # 密码哈希（scrypt）/ 会话 / 用户 CRUD（服务端）
│  ├─ store.js               # templates/settings/users/sessions/sites 持久化（node:sqlite，惰性连接）
│  └─ data/                  # 运行时生成：mae.db（gitignore）；旧 JSON 自动迁移为 .migrated
├─ scripts/                  # 保留 CLI 工具（fetch_all / translate / mcp_call）
├─ samples/                  # 全量 DSL 样本（拉取缓存）
└─ package.json
```

## 4. API 设计（Route Handlers）

### POST /api/mastergo/parse
```
请求: { "source":"mcp"|"rest", "token":"MG_TOKEN", "fileId":"...", "layerId":"..." | "url":"https://mastergo.com/file/..." }
返回: { meta:{ rootName, totalSections, totalNodes, width, height, svgCount }, sections:[{ idx, name, type, nodes, y, preview }] }
```
后端解析 `url`（提取 fileId/layerId/page_id）或直接字段；拉取 DSL 缓存到 `samples/` 并返回概览。

### POST /api/convert
```
请求: { "llm":{ enabled:bool, baseUrl, apiKey, model } }
返回: { id, title, stats:{ sections, containers, widgets, abs, bgImgs }, enhanced:bool }
```
复用规则转换（translate 逻辑）；`llm.enabled` 时对布局/命名做 LLM 增强，结果存入模板历史。

### GET /api/templates
返回模板历史列表（倒序）：`{ templates:[{ id, createdAt, title, stats, enhanced }] }`。

### GET/DELETE /api/template/:id
- GET：返回缓存的 Elementor `.json`（下载附件）。
- DELETE：删除历史模板。

### GET /api/preview/:id / GET /api/preview/:id/html
- `GET /api/preview/:id`：返回结构树 + LLM 增强概览 `{ title, tree:[{type,widgetType,title,depth}], enhanced }`。
- `GET /api/preview/:id/html`：把模板渲染为独立 HTML（`lib/server/elementor-render.ts`），供 iframe 可视化预览；支持容器背景/渐变/绝对定位、heading/image/html/button 等 widget，带 CSP（禁脚本）。

### GET /api/site/plugin / POST /api/site/import
- GET：下载 `mae-import.zip` 插件包。
- POST：`{ templateId, siteUrl, apiKey, pageTitle, slug?, basicAuth? }` → `{ pageId, title, editUrl, uploadedImages, imageErrors }`。

### GET/PUT /api/settings
设置读写（令牌 / LLM 默认 / WP 默认），存 SQLite `settings` 表。

### POST /api/auth/login · GET /api/auth/me · POST /api/auth/logout
登录校验（scrypt）成功后写 httpOnly 会话 Cookie（`mae_session`，有效期 30 天）；
`/api/auth/me` 返回当前用户；logout 销毁会话。所有后台 API/页面均需登录，未登录返回 401 或跳转 `/login`。

### POST/GET /api/auth/register
仅系统首个用户可注册（自动成为管理员），其余账号由管理员在「用户管理」开通。

### GET/POST /api/users · PUT/DELETE /api/users/:id
仅管理员：用户列表 / 新建（密码至少 6 位）/ 编辑（可改昵称、角色、重置密码）/ 删除。
保护规则：不能删除当前登录账号；不能修改自己的角色；系统至少保留一名管理员。

### GET/POST /api/sites · PUT/DELETE /api/sites/:id
站点管理（名称 / 地址 / 插件密钥 / 页面标题 / Basic Auth）。读取对所有登录用户开放
（供「上传网站」选站自动填充），增删改仅管理员。

### POST /api/sites/:id/test · GET/DELETE /api/deliveries
- `POST /api/sites/:id/test`：调用站点插件 `/wp-json/mae/v1/test` 探测连通性
  （地址可达 / 插件已装 / 密钥正确 / nginx Basic Auth），结果与错误原因写回站点状态。
- `GET /api/deliveries`：上传交付记录（成功 / 失败、站点、模板、页面、图片数），
  一键上传自动写入；`DELETE /api/deliveries/:id` 仅管理员可删。

## 5. 转译引擎

- **规则层**（打底）：复用 `translate.mjs`——token→Kit、节点→容器/widget、长文本回填、SVG 注入、图片 url。
- **LLM 增强层**（可选，开关）：在规则结果上，LLM 做：
  - 布局智能还原（绝对定位叠放、响应式推理）
  - 命名/结构清洗（合并冗余容器、语义化 widget）
  - 动态内容识别（导航/表单 → WP 动态绑定建议）
- 校验：JSON Schema（id 唯一、widgetType 合法、_elementor_data 可导入）。

## 6. 站点一键导入（WP 侧）

一键写 `_elementor_data` 需要站点侧配合。提供两种：
- **REST 模式**：站点装轻量插件（`mae-import.php`），开放 `/wp-json/mae/v1/import`，接收 JSON → `wp_insert_post` + `update_post_meta(_elementor_data)` + `update_post_meta(_elementor_version)`。
- **Media 上传**：图片从 MasterGo 下载后 `media_handle_upload` 到媒体库，元素引用 media id。

## 7. MVP 范围（本次已完成）

1. Next.js 后台：mastergo/parse（MCP 通道）、convert（规则）、template 下载/删除、模板历史列表。
2. 后台 UI：工作台 / MasterGo（模板列表·新建转换·上传网站）/ 站点管理 / 用户管理 / 设置，侧边栏 + 顶栏布局。
3. 一键写入：REST 模式 + 生成 `mae-import.php` 插件（用户装到目标站）。
4. 持久化：模板历史与设置存 SQLite（`server/data/mae.db`），重启不丢；旧 JSON 数据首次启动自动迁移。
5. 账号体系：登录 / 首个用户注册 / 会话（30 天）；用户管理（admin，含防删防降权保护）；站点管理（保存站点供上传页复用）。

## 8. 后续路线

- MasterGo REST API 通道补全
- 注册邀请码 / 邮箱验证、登录二次验证
- 站点健康检查（连通性 / 插件版本探测）
- LLM 增强正式接入（布局/命名/动态识别）
- 绝对定位叠放还原、响应式三端适配
- 图片自动上传媒体库
- 多文件/整站批量、模板搜索分页

## 9. 待确认/待实测

- WP REST API 直接写私有 `_elementor_data` 的可行性 → 以「站点插件」为最终落地方式更稳。
- MasterGo REST API 取数的鉴权/返回结构（与 MCP 对比）。
- LLM 增强的 key/底座由用户提供（接 OpenAI 兼容）。
