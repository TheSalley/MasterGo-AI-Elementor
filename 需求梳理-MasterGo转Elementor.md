# 需求梳理：MasterGo 设计稿 → AI → WordPress Elementor 页面

> 版本：v0.1（需求基线）　日期：2026-10-15　作者：M-AI-E 项目
> 定位：把 MasterGo 设计稿通过 AI 转译成 **Elementor 原生页面结构**，写入 WordPress，生成可在 Elementor 编辑器里继续编辑的真实页面（而非图片/HTML 快照）。

---

## 1. 一句话定义

输入 **MasterGo 设计稿（节点树 JSON + 图片资产）**，经 **AI 转译引擎** 输出 **Elementor `_elementor_data` 标准元素树**，最终落地为一个可导入、可编辑、可发布的 Elementor 页面。

## 2. 核心价值 / 目标

| 目标 | 说明 |
|---|---|
| 消灭"设计稿→落地页"的手工还原 | 设计/开发之间不再逐块手工重做布局与样式 |
| 产出 Elementor 原生结构 | 生成的页面是真实 widget（Section/Container + Heading/Button/Image…），可在 Elementor 编辑器中继续编辑，**不是锁死的图片或一次性导出** |
| 半自动为主 | AI 完成 80% 的还原，人工在 Elementor 里做校验与微调，保真度可人工兜底 |
| 可回滚、可审查 | 转换产物以文件/模板形式产出，审查通过后再写入站点 |

## 3. 使用者与典型场景

- **使用者**：WordPress / Elementor 建站工程师（项目负责人）、设计师、客户。
- **典型流程**：设计师给到 MasterGo 文件 → 工具拉取 → AI 生成 Elementor 页面 → 工程师在 Elementor 内校验微调 → 挂上真实内容/动态数据 → 发布。

## 4. 输入侧（MasterGo）——三种取数方式

| 方式 | 说明 | 适用 / 评价 |
|---|---|---|
| **A. Magic MCP（新增，推荐）** | 官方远程 MCP `@mastergo/magic-mcp`，是**完整 Design-to-Code 引擎**（12 个工具，见 4.1）：按 section 分区块返回 DSL + SVG 占位，`mcp__applyDesign` 注入真实数据写盘。Node 转译引擎可**直接作为 MCP client 连接**，省掉自建 API 鉴权/取数 | 需要团队版以上权限 + 个人令牌 `MG_MCP_TOKEN`；文件须在**团队项目**（草稿箱不可访问）；复杂页面按 section 分段取避免超时/429。**与 LLM 衔接最顺，作为首推交互路径** |
| **B. REST API** | `/openapi/v1/document/:documentId/...`，`X-MG-Authentication` 鉴权，拉取文件节点树 JSON + `exportImage` 导出图片 | 有文件访问权限、文件 key；**适合批量/无人值守**（Magic MCP 因需选中图层，不适合全自动批处理） |
| **C. 画布插件** | MasterGo 插件 SDK 在画布内读取选中节点，导出结构 + 图片 | 设计师圈选"本次要转的页面"更精确，交互在工具内完成；作为 A/B 的补充 |

> **结论**：交互式/人工驱动走 **Magic MCP（A）**，批量/无人值守走 **REST API（B）**，插件（C）为增强。三者并存，转译引擎按场景选择取数通道。

### 4.1 Magic MCP 能力清单（官方 Design-to-Code 引擎，12 个工具）

| 方法 | 作用 | 对本项目的意义 |
|---|---|---|
| `mcp__getDesignSections`（**主工具**） | 模式1：无索引返回全部 **section 列表**（id/name/type/nodeCount/textPreview + 页面绝对坐标 bbox，可做定位）；模式2：按 `sectionIndex`（单整数/次）返回**单块完整 DSL**。PATH 节点带 `svgShortKey`（SVG 不在 DSL 内，用 `@@SVG:{key}@@` 占位），INSTANCE 带 `_variantProps` 语义状态 | **直接对应我们的"分区块生成"策略**；DSL 分块取可规避上下文超限；bbox 可支撑绝对定位还原 |
| `mcp__applyDesign` | 把 `@@SVG:@@`（图标）和 `T{section}|{node}`（长文本）占位符替换为真实高精度数据，直接写盘；检测 AI 编造的 path 并报错 | 高精度注入 SVG/文本、防幻觉；可适配为写 Elementor JSON/资源 |
| `mcp__getDsl`（回退） | 返回完整 DSL（默认 VUE3），`format` 支持 `json/yaml/tree`（yaml/tree 省 token） | 取 IR 的兜底通道；yaml 输出对 LLM 上下文友好 |
| `mcp__getD2c` | 获取 D2C 数据：code 写 html、svg/image 按 `resourcePath` 落盘 | 可作为"还原度参考 HTML"，但非 Elementor 原生，不直接采用 |
| `mcp__getMeta` | 整站级配置信息 + 生成规则（markdown rules） | 对"整站"目标有用，可约束整站一致性 |
| `mcp__extractSvg` | 从设计层提取高精度 SVG（PATH + 颜色解析，支持分页） | 适配 Elementor 图标/Icon widget 很合适 |
| `mcp__getPageLayers` | 枚举页面下所有图层（id/name/type/depth/bbox），多图层逐层还原工作流 | 整站/多页面分批处理 |
| `mcp__C2d` | 代码转设计（HTML→同步回设计稿，需 fileId） | v3 级"Elementor 改动回同步设计稿"闭环 |
| `mcp__getComponentLink` / `mcp__getComponentGenerator` / `mcp__getFlutterGenerator` / `version` | 组件文档/开发工作流/Flutter 生成 | Flutter 非本项目目标，可忽略 |

> **关键判断**：Magic MCP 的 D2C 目标是 **HTML/Vue/React/Flutter**，**不含 Elementor**。因此本项目**取它的 DSL 结构化数据（IR），自建「DSL → Elementor 元素树」转译层**；不能直接把它的 HTML 产物当交付，否则失去 Elementor 原生可编辑性。

**需要提取的数据字段**：节点 `type`、坐标/尺寸、auto-layout 约束、fills/strokes/effects（色值、阴影、圆角）、typography（字号/字重/行高）、组件实例（ComponentNode）、以及图片/图标资产。**DSL 字段已实测确认，见《DSL转Elementor映射表.md》**（含 token、flexContainerInfo、svgShortKey、rowTexts/placeholderTexts、allTexts 白名单）。

## 5. 输出侧（Elementor）——三种交付形态

| 形态 | 机制 | 优劣 |
|---|---|---|
| **A. Elementor 模板 .json（推荐起步）** | 生成标准模板 JSON，在 Elementor 模板库导入 | 离线、安全、可审查；缺点是不能一步到位 |
| **B. 直接写入站点** | 通过 WP REST API / 自定义插件写入 `_elementor_data`（post meta） | 一键到位；需站点凭据/插件，风险更高 |
| **C. HTML widget** | AI 生成 HTML/CSS 塞进 HTML widget | 简单，但失去 Elementor 组件编辑能力，**不推荐**（违背核心目标） |

> 建议路线：**MVP 用 A（离线生成 .json → 模板库导入）**，v2 再上 B（一键写入）。

## 6. AI 转译引擎（项目核心）

**输入**：设计树子集 + 图片资产 + 站点上下文（主题、Elementor Kit/全局样式、动态字段）。
**输出**：Elementor 元素树（标准 JSON，可过 JSON Schema 校验）。

### 6.1 节点 → Widget 映射规则（初始映射表）

| MasterGo 节点 | Elementor 元素 |
|---|---|
| Frame / auto-layout 容器 | Section / Container（flex 布局） |
| 文本节点 | Heading（识别 h1/h2/标题层级）/ Text-editor |
| 图片节点 | Image widget（同步上传媒体库） |
| 按钮/可点击组件 | Button widget |
| 图标节点 | Icon widget / 图标库 |
| 表单类组件 | Form widget |
| 导航/菜单组件 | Menu widget（绑定 WordPress 菜单） |
| 卡片/列表/重复项 | Loop Grid / 动态内容 |

### 6.2 转译策略（防幻觉、保稳定）

- **分区块生成（直接复用 Magic MCP 的 section 机制）**：用 `mcp__getDesignSections` 先拿全页面 section 列表，再逐 `sectionIndex` 取单块 DSL，每块独立一次 LLM 调用，配 **JSON Schema 输出约束 + 结构校验**，避免整页一次生成超长、非法 JSON；与官方"不许跳 section、分批 3-5 并发、SVG/长文本用占位符最后注入"的工作流对齐。
- **样式 Token 抽取**：先全局抽取色板/字体/间距为 token，再映射到 Elementor Global/Kit，保证整页一致。
- **每块校验**：生成后即校验（Schema、widget 名、id 唯一性、引用完整性），不合格自动重试一次。

### 6.3 核心难点

1. **布局保真**：MasterGo 绝对定位/auto-layout → Elementor flex 容器的等价还原；复杂嵌套与负间距难精确复刻。
2. **响应式**：设计稿通常只有桌面 1440px；需 AI 推理平板/移动端的列宽、堆叠、隐藏规则。
3. **动态内容绑定**：真实导航、文章列表、WooCommerce 产品要绑定到 WP 动态数据 / Loop Grid，而非写死。
4. **样式还原**：色值（ΔE 容差）、字体、间距、圆角、阴影的精度控制。
5. **幻觉控制**：非法 widget 名、漏 id、无效 JSON、字段类型错误。

## 7. 系统架构

```
MasterGo 文件（设计稿）
        │ ① 取数层
        │    ├─ Magic MCP client（@mastergo/magic-mcp，交互式 DSL/D2C）★推荐
        │    └─ REST API 拉取器（批量/无人值守，节点树 JSON + 图片）
        ▼
设计树中间表示（IR，清洗/降噪/剪枝）
        │ ② AI 转译引擎（LLM：分块 + Schema 约束 + 校验）
        ▼
Elementor 元素树（标准 JSON）
        │ ③ 写入器（模板 .json / WP REST API）
        ▼
WordPress 站点 Elementor 页面
        │ ④ 校验器（浏览器渲染截图 对比设计稿）
        ▼
验收通过 → 发布
```

**建议技术栈**：Node.js/TypeScript 或 Python；LLM API（多模态，图像辅助理解布局）；可先做 CLI，再加简单 Web 界面。
**MCP 集成**：转译引擎用 `@modelcontextprotocol/sdk` 作为 MCP client 连接 `mastergo-magic-mcp`，调用 `mcp_getDsl` / `mcp_getD2c` 取数；也可让项目跑在一个支持 MCP 的 LLM Agent 内。

## 8. 验收标准（保真度指标）

| 维度 | 指标 |
|---|---|
| 结构完整性 | 区块/层级/组件对应率 ≥ 90% |
| 样式还原 | 色值 ΔE<5、间距误差 <2px、字体正确 |
| 可编辑性 | 产出均为原生 widget，可在 Elementor 直接修改 |
| 响应式 | 桌面/平板/移动三档均可看 |
| 性能 | 无冗余嵌套、图片压缩、上线基础性能达标 |
| 可回滚 | 生成产物可审查、可退回 |

## 9. 范围与阶段规划（Roadmap）

> 已确认目标：**整站 + 动态内容**；输入**双通道**（REST API + 插件）；输出**双形态**（模板 .json + 直接写入）；技术栈 **Node.js/TypeScript**。
> 这些需求量大，**不建议一次性全做**。按可执行顺序分三阶段，每阶段都能独立交付价值：

**P0 —— 端到端单页试点（先跑通全链路，建议第一版就做这个）**
- 选一个落地页为试点：REST API 拉取设计树 → AI 分块转译 → 输出 Elementor 模板 `.json` → 模板库导入 → 人工在 Elementor 微调验收
- 内容以静态为主（文本/图片/按钮/图标），**动态内容只做导航菜单试点**（Menu widget 绑定 WP 菜单）
- 半自动：AI 生成 + 人校验
- 目标：用最小成本验证"设计稿→Elementor 原生页"的可行性、保真度和转译质量，再决定要不要加量

**P1 —— 加量 + 动态内容**
- 直接写入站点（WP REST API / 自定义插件，写 `_elementor_data`）
- 动态内容：Loop Grid（文章/产品列表）、导航菜单、WooCommerce 绑定
- 响应式自动适配（桌面→平板/移动）
- 截图自动回归对比（渲染对齐设计稿）

**P2 —— 双通道补齐 + 全自动化**
- MasterGo 画布插件（圈选导出）
- Elementor Kit / 全局样式同步、组件库映射（设计组件 ↔ 站点组件复用）
- 多页面/整站批处理、交互动效基础还原
- 全自动流程（校验通过即发布）

## 10. 风险与待验证项

- MasterGo 权限与配额：REST API 需实测 documentId 与鉴权流程；**Magic MCP 需团队版以上权限 + 个人令牌 `MG_MCP_TOKEN`**，且 `mcp_getDsl` 依赖画布选中图层（无法无人值守批处理），复杂节点可能超时/429，需分段获取并控制频率。**（已于 2026-10-15 用真实设计稿实测通过：令牌有效、按 section 分批取数正常、token/文本白名单/SVG 占位机制齐全）**。
- Elementor 版本差异：新版 Flexbox **Container** 结构 vs 旧版 Section/Column，需锁定目标 Elementor 版本。
- 复杂交互动效（原型交互）无法通过静态转换还原，需明确"动效不在此范围"。
- 设计稿图层命名不规范 → 组件/区块识别依赖布局启发式，需对命名做规范化建议。
- 设计稿质量差（未用 auto-layout、间距杂乱）会显著降低还原率，需在上游给出"设计规范"约束。

## 11. 已确认决策（2026-10-15）

| 决策点 | 结论 |
|---|---|
| 输入方式 | 三通道：**Magic MCP（推荐，交互式 DSL/D2C）** + REST API（批量）+ 画布插件（增强） |
| 输出方式 | 两者都做：MVP 先模板 `.json` 导入，后续加直接写入站点 |
| 页面范围 | 含动态/整站（导航、文章、WooCommerce），第一版收敛为单页试点 + 导航试点 |
| 技术栈 | Node.js / TypeScript |

**建议的下一步**：已产出《DSL转Elementor映射表.md》并实测通过 Magic MCP 取数。接下来：**搭最小转译原型**——取 1~2 个 section 的 DSL → LLM 按映射表生成 Elementor 模板 `.json`（Container 版）→ 校验 → 导入 Elementor 验证可编辑性。涉及：Elementor JSON Schema 固化、LLM 转译 Prompt（含 allTexts 白名单/SVG 占位约束）、`mcp__applyDesign` SVG 注入落盘验证。

---

*本文档为需求基线，决策点确认后补充为可执行的 PRD / 技术方案。*
