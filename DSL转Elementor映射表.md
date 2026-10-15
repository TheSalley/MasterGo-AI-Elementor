# DSL → Elementor 元素树 映射表

> 版本：v1（基于真实设计稿实测）　日期：2026-10-15
> 样本：杭州全盛机电官网首页 `01-Home`（1920×8232，483 节点 / 29 section）
> 取数通道：MasterGo Magic MCP `mcp__getDesignSections`（模式1 section 列表 + 模式2 单块 DSL）
> 目标：Elementor **Container（新版 Flexbox）** 结构

---

## 1. DSL 数据总览（已实测，非推测）

`mcp__getDesignSections` 返回结构：

| 字段 | 内容 | 转译用途 |
|---|---|---|
| `sections[]` | 每节 id/name/type/nodeCount + 页面**绝对坐标** x/y/w/h + textPreview | 页面骨架、section 切分、定位 |
| `rootMetadata` | 根 FRAME 尺寸/名称/fill + `styles`（全设计 token） | 页面容器 + Global Kit token |
| `rootContainer` | 外层 CSS（1920px/minHeight/background/position） | 顶层 Container |
| `splitContainers[]` | 大区域拆分（绝对坐标 + background） | footer 等大区块骨架 |
| `dsl.styles` | **token 表**：`font_*`（字体族/字号/字重/行高）、`paint_*`（色值/渐变/图片url）、`effect_*`（阴影） | → Elementor Kit 变量 |
| `dsl.nodes[]` | 递归节点树（见 2） | 转译主体 |
| `dsl.rowTexts[]` | 文本 + parentType/parentName + _placeholder | 文本精确落位 |
| `dsl.placeholderTexts[]` | 组件库占位文本白名单 | 防把占位当真实 UI |
| `rootMetadata.allTexts` | **全文白名单** | 防 LLM 幻觉（CLOSED-SET 校验） |

**节点通用字段**：`type`（GROUP/FRAME/LAYER/TEXT/INSTANCE/PATH…）、`id`、`name`、`layoutStyle{width,height,relativeX,relativeY}`、`fill`/`_color`/`_token`、`borderRadius`、`effect`、`opacity`、`strokeColor/strokeWidth/strokeAlign`、`flexContainerInfo`、`_placeholder`、`_variantProps`、`componentId`。

---

## 2. 节点 → Elementor 映射表（核心）

| MasterGo DSL 节点 | Elementor 元素 | 关键字段 → Elementor 设置 |
|---|---|---|
| **FRAME/GROUP 含 `flexContainerInfo`** | **Container**（`elType=container`，flex） | `flexDirection`→flex 方向；`gap`→列/行间隙；`justifyContent/alignItems`→对齐；`padding`→内边距；`mainSizing/crossSizing`→宽度策略；`layoutStyle`→尺寸/定位 |
| **LAYER 矩形**（`fill`+`borderRadius`，无内容） | **Container 背景 / Spacer** | `_color`→背景色；`borderRadius`→圆角；`effect`→box-shadow；`opacity`→背景 rgba（不设元素 opacity，避免子元素透） |
| **LAYER 图片**（`fill` 为图片 url） | **Image widget / 容器背景图** | url→上传媒体库；`layoutStyle`→尺寸/比例 |
| **TEXT 大字号标题**（`_placeholder` + 大 size） | **Heading widget** | `text`→标题；`font` token→Kit typography；`textAlign`→对齐；层级按 size 映射 h1/h2/… |
| **TEXT 正文段落**（`textMode:auto-height`） | **Text-editor widget** | `text`→正文；字体/颜色→Kit |
| **INSTANCE**（`componentId`+`_variantProps`） | **对应 widget / 组件复用** | `_variantProps`→状态样式（默认/选中/悬停，比较兄弟实例，不猜默认）；`componentInfo.properties`→变体 |
| **PATH**（图标，`svgShortKey`） | **Icon widget / SVG（HTML）** | `svgShortKey`→`@@SVG:{key}@@` 占位 → `mcp__applyDesign` 注入真 SVG；`svgName`→图标语义 |
| **GROUP 内重复同构卡片**（同 componentId/同结构平铺） | **Loop Grid（动态循环）/ 重复 Container** | 检测重复结构 → 动态绑定文章/产品；静态则展开为多个 Container |
| **TEXT 菜单项组**（导航栏 7 项） | **Menu widget / Heading+链接** | 菜单文本→WP 导航菜单项或静态项；动态目标用 Menu widget 绑 WP 菜单 |

---

## 3. Token 抽取 → Elementor Global/Kit

`dsl.styles` 里的设计 token 直接映射为 Elementor **全局变量**（Elementor 3.x Kit：Global Colors + Global Typography）：

| DSL token | 值（实测） | Elementor Kit |
|---|---|---|
| `font_86:4957` `Q-H2` | Noto Sans SC / 42px / SemiBold / 600 / 行高120 | 全局字体 H2 |
| `font_86:4961` `Q-H3` | Noto Sans SC / 32px / SemiBold | 全局字体 H3 |
| `font_86:5004` `Q-text` | Noto Sans SC / 16px / Regular | 全局字体 body |
| `paint_86:5157` `Q-主蓝` | `#004EA2` | 全局颜色（变量） |
| `paint_86:5186` `Q-标题黑` | `#121212` | 全局颜色 |
| `paint_86:5196` `Q-背景浅` | `#EEEEEE` | 全局颜色 |
| `effect_134:6424` | `box-shadow: 0 4px 10px rgba(0,0,0,.2)` | 全局阴影 token |

> 生成时保留 `_token` 名（如 `Q-主蓝`）作为 Elementor 变量名，保证整站一致。

---

## 4. 布局策略（Elementor Container）

1. **顶层**：`rootContainer`（1920px）→ 一个全宽 Container；每个 section → 一个独立 Container（顺序按页面 y 坐标），内嵌子 Container。
2. **优先 flex**：含 `flexContainerInfo` 的节点 → Elementor Container 的 flex 布局（方向/间隙/对齐/内边距一一对应），最贴合 Elementor 原生。
3. **绝对定位兜底**：无 flexContainerInfo 的纯定位节点（`relativeX/Y`）→ 用 Container 内 `position:absolute` 或按坐标换算成外层 Container 的 flex/偏移对齐；复杂绝对定位可归并进背景容器。
4. **响应式（P1）**：设计稿只有桌面 1920 画板，移动端由 LLM 推理：多列 Container → 移动端堆叠（Elementor 默认 `flex-wrap` 响应式断点）、隐藏装饰层。
5. **图片**：DSL 里的图片 url（`image-resource.mastergo.com`）下载后上传 WP 媒体库，元素引用 media_id。

---

## 5. 防幻觉 / 保真规则（来自官方 rules + 实测）

| 规则 | 执行 |
|---|---|
| **CLOSED-SET 文本** | 任何渲染文本必须存在于 `allTexts`；超过即幻觉，删除 |
| **占位文本** | `_placeholder:true` 的文本（在 `placeholderTexts` 内）不渲染为真实 UI 标签 |
| **SVG 精确注入** | PATH 必须用 `@@SVG:{svgShortKey}@@` 占位，最后 `mcp__applyDesign` 注入真 SVG，**禁止手写 `<path>`** |
| **变体状态** | INSTANCE 用 `_variantProps` 比较兄弟判定 active/selected/hover，不用默认索引 |
| **渲染数** | 按 `structureSiblingCount`，ssc=1 不虚构额外行/项 |
| **透明度** | FRAME/GROUP opacity 转背景 rgba，不设 CSS opacity |
| **token 变量化** | token 字段必须生成变量并在注释展示 |

---

## 6. 已取样本（samples/）

| 文件 | 内容 |
|---|---|
| `mode1_sections.json` | 29 个 section 列表 + rootMetadata + rootContainer + splitContainers + rules |
| `mode2_sec1.json` | 产品中心区（50 节点：标题、筛选按钮组、产品卡片、简介、图标） |
| `mode2_sec28_top.json` | 顶部导航（logo INSTANCE、7 菜单项、语言切换、7 PATH 图标） |
| `mode2_sec17_contact.json` | 联系表单（contact INSTANCE，32 节点） |

> 下一步：确认 `mcp__applyDesign` 的 SVG 注入落盘机制；表单 section 映射到 Elementor Form widget 的字段核对；用 Elementor JSON Schema 固化输出模板。
