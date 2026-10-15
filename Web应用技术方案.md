# M-AI-E Web 应用技术方案

> 版本：v0.1　日期：2026-10-15
> 定位：把「MasterGo 设计稿 → AI → Elementor 页面」做成**本地单机 Web 工具**。
> 技术栈：Node.js（已确认）。

---

## 1. 产品形态（已确认决策）

| 决策点 | 结论 |
|---|---|
| 部署形态 | **本地单机工具**（`npm run` 起服务，浏览器 localhost 访问） |
| MasterGo 接入 | **双通道**：Magic MCP（首选，已验证）+ REST API（备选） |
| 站点导入 | **两者都做**：下载 `.json` 手动导入 + 填 WP 凭据一键写入 |
| 转译引擎 | **规则 + LLM 增强**：确定性规则打底，LLM 做布局智能还原/命名清洗 |

## 2. 整体架构

```
┌─ 浏览器界面（单页，原生 HTML/JS + fetch）────────────┐
│  ① MasterGo 输入（token + 文件链接）                │
│  ② 转换预览（生成的 Elementor 结构概览）            │
│  ③ 交付（下载 .json / 填 WP 凭据一键导入）          │
└───────────────────────────────┬────────────────────┘
                                │ HTTP
┌─ Node 后端（Express，静态服务 + REST API）───────────┐
│  GET  /                    前端页面                 │
│  POST /api/mastergo/parse  取数 → 返回 DSL 概览      │
│  POST /api/convert         转译 → 返回 Elementor JSON│
│  GET  /api/template/:id    下载 .json                │
│  POST /api/site/import     一键写入 WP               │
└──────┬──────────────────────┬───────────────────────┘
       │                      │
  MasterGo Magic MCP      WordPress REST API / 导入插件
  (token + fileId/layerId)  (创建页面 + 写 _elementor_data)
```

## 3. 目录结构

```
MAE/
├─ server/
│  ├─ index.js            # Express 入口：静态服务 + API 路由
│  ├─ routes/
│  │  ├─ mastergo.js      # POST /api/mastergo/parse
│  │  ├─ convert.js       # POST /api/convert
│  │  └─ site.js          # POST /api/site/import
│  ├─ services/
│  │  ├─ mg-client.js     # MasterGo 取数封装（MCP / REST 双通道）
│  │  ├─ converter.js     # DSL → Elementor（复用 translate 规则 + LLM 增强）
│  │  └─ wp-import.js     # WP 一键写入（REST API / 插件端点）
│  └─ store.js            # 内存会话：最近一次转换结果（含 .json）
├─ public/
│  ├─ index.html          # 前端单页
│  ├─ app.js
│  └─ style.css
├─ scripts/               # 保留 CLI 工具（fetch_all / translate / mcp_call）
├─ samples/               # 全量 DSL 样本（拉取缓存）
└─ package.json
```

## 4. API 设计

### POST /api/mastergo/parse
```
请求: { "source":"mcp"|"rest", "token":"MG_TOKEN", "fileId":"...", "layerId":"..." | "url":"https://mastergo.com/file/..." }
返回: {
  meta:{ rootName, totalSections, totalNodes, width, height },
  sections:[{ idx, name, type, nodes, y, w, h, preview }],
  textCount, imageCount, svgCount
}
```
后端解析 `url`（提取 fileId/layerId/page_id）或直接字段；拉取 DSL 缓存到 `samples/` 并返回概览。

### POST /api/convert
```
请求: { "sectionsDir"|"sessionId": ..., "llm":{ enabled:bool, key, baseUrl } | null }
返回: { template:{ title, version, content:[...] }, stats:{ containers, headings, images, svgs } }
```
复用规则转换（translate 逻辑）；`llm.enabled` 时对布局/命名做 LLM 增强。

### GET /api/template/:id
返回缓存的 Elementor `.json`（下载附件）。

### POST /api/site/import
```
请求: { "siteUrl":"https://example.com", "apiKey":"application password | 插件token", "mode":"rest"|"plugin", "page":{title,slug} }
返回: { success, pageId, editUrl, errors }
```
- `rest`：WP REST API 创建 page + 更新 `_elementor_data`（需站点插件放开私有 meta）。
- `plugin`：目标站点装「MAE 导入插件」，暴露 `/wp-json/mae/v1/import`，接收 Elementor JSON 创建页面。

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

## 7. MVP 范围（本次先做）

1. Express 后端：mastergo/parse（**MCP 通道**）、convert（规则）、template 下载。
2. 前端单页：填 MasterGo → 转换 → 概览预览 → 下载 `.json`。
3. 一键写入：REST 模式 + 生成 `mae-import.php` 插件（用户装到目标站）。

## 8. 后续路线

- MasterGo REST API 通道补全
- LLM 增强正式接入（布局/命名/动态识别）
- 绝对定位叠放还原、响应式三端适配
- 图片自动上传媒体库
- 多文件/整站批量、会话历史持久化（SQLite）

## 9. 待确认/待实测

- WP REST API 直接写私有 `_elementor_data` 的可行性 → 以「站点插件」为最终落地方式更稳。
- MasterGo REST API 取数的鉴权/返回结构（与 MCP 对比）。
- LLM 增强的 key/底座由用户提供（接 OpenAI 兼容）。
