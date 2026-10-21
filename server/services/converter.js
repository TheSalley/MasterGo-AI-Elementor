// 转译服务 v5：DSL → Elementor 模板
// v5：支持占位图模式（placeholderImages=true 时图片/背景图按原尺寸生成灰色占位 SVG，不上传媒体库也能保持布局）
import { readFileSync } from "node:fs";
import { join } from "node:path";

let _id = 0;
let _placeholderImages = false;
const nextId = () => (++_id).toString(16).padStart(8, "0");

const px = (n) => ({ unit: "px", size: parseFloat(n) });
const parsePadding = (str) => {
  const nums = String(str || "").split(/\s+/).map((x) => parseFloat(x));
  if (!nums.length || nums.every(isNaN)) return null;
  const [t = 0, r = t, b = t, l = r] = nums;
  return { unit: "px", top: String(t), right: String(r), bottom: String(b), left: String(l), isLinked: t === r && r === b && b === l };
};
const headerSize = (s) => (s >= 48 ? "h1" : s >= 40 ? "h2" : s >= 28 ? "h3" : s >= 20 ? "h4" : "h5");
const realText = (node) => { const t = node.text?.[0]?.text || ""; return /^T\d+\|/.test(t) ? (node.name || t).replace(/\r/g, "") : t; };

// 按原始宽高生成灰色占位图（data URI，零依赖零网络，保持图片区域尺寸）
export function placeholderImage(w, h) {
  const width = Math.max(1, Math.round(w || 800));
  const height = Math.max(1, Math.round(h || 600));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="#E2E8F0"/>` +
    `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="8 6"/>` +
    `<text x="50%" y="50%" fill="#94A3B8" font-family="sans-serif" font-size="${Math.max(14, Math.round(Math.min(width, height) / 12))}" ` +
    `text-anchor="middle" dominant-baseline="middle">${width}×${height}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// 计算一组 DSL 节点（相对其父容器）的内容包围盒底边：relativeY 逐级累加 + 自身高度
function contentBottom(nodes) {
  let bottom = 0;
  const walk = (n, accY) => {
    const L = n.layoutStyle || {};
    const y = accY + (L.relativeY || 0);
    const h = y + (L.height || 0);
    if (h > bottom) bottom = h;
    (n.children || []).forEach((c) => walk(c, y));
  };
  (nodes || []).forEach((n) => walk(n, 0));
  return bottom;
}

// ---- fill 解析：纯色 / 渐变 / 图片 ----
function parseFill(node, styles) {
  const items = node.fill && styles[node.fill] ? styles[node.fill].value : null;
  const out = { color: null, gradient: null, image: null };
  if (items) for (const it of items) {
    if (typeof it === "string") {
      if (/^(linear|radial)-gradient/i.test(it)) out.gradient = it;
      else if (/^#[0-9a-fA-F]{3,8}$/.test(it.trim())) out.color = it.trim();
    } else if (it && typeof it === "object" && it.url) out.image = it.url;
  }
  if (!out.color && !out.gradient && node._color) {
    const c = String(node._color).trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) out.color = c;
  }
  return out;
}

function splitStops(s) {
  const parts = []; let cur = "";
  for (let i = 0; i < s.length; i++) { cur += s[i]; if (s[i] === "%" && (i + 1 >= s.length || s[i + 1] === ",")) { parts.push(cur); i++; cur = ""; } }
  return parts;
}
function parseStop(s) {
  const mm = String(s).match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))\s*([\d.]+%)?/);
  return mm ? { color: mm[1], pos: mm[2] ? parseFloat(mm[2]) : null } : null;
}
function gradientSettings(grad) {
  const m = String(grad).match(/linear-gradient\(\s*([\d.]+)deg\s*,\s*(.*?)\s*\)/i);
  if (!m) return null;
  const angle = parseFloat(m[1]);
  const stops = splitStops(m[2]);
  const a = parseStop(stops[0]), b = parseStop(stops[1] || stops[0]);
  if (!a) return null;
  return {
    background_background: "gradient",
    background_gradient_type: "linear",
    background_gradient_angle: { unit: "deg", size: angle },
    background_gradient_color: { color: a.color },
    background_gradient_color_stop: { unit: "%", size: a.pos ?? 0 },
    background_gradient_color_b: { color: b ? b.color : a.color },
    background_gradient_color_b_stop: { unit: "%", size: (b && b.pos != null) ? b.pos : 100 },
  };
}

// 背景 settings：优先渐变 > 图片 > 纯色
function bgSettings(node, styles) {
  const f = parseFill(node, styles);
  const s = {};
  if (f.gradient) Object.assign(s, gradientSettings(f.gradient));
  else if (f.image) { s.background_background = "classic"; s.background_image = { url: f.image }; s.background_size = "cover"; }
  else if (f.color) { s.background_background = "classic"; s.background_color = f.color; }
  if (node.borderRadius) s.border_radius = { unit: "px", top: String(node.borderRadius), right: String(node.borderRadius), bottom: String(node.borderRadius), left: String(node.borderRadius), isLinked: true };
  return s;
}

function flexSettings(fci) {
  const s = {};
  if (!fci) return s;
  if (fci.flexDirection) s.flex_direction = fci.flexDirection === "column" ? "column" : "row";
  if (fci.gap) s.flex_gap = px(fci.gap);
  if (fci.justifyContent) s.justify_content = fci.justifyContent;
  if (fci.alignItems) s.align_items = fci.alignItems;
  const pad = parsePadding(fci.padding);
  if (pad) s.padding = pad;
  return s;
}

// 判断 LAYER 是否铺满父容器（作背景）
function isCover(node, parentLayout) {
  if (!parentLayout) return false;
  const near = (a, b) => Math.abs(a - b) < 2;
  return near(node.layoutStyle?.width ?? 0, parentLayout.width ?? 0)
    && near(node.layoutStyle?.height ?? 0, parentLayout.height ?? 0)
    && near(node.layoutStyle?.relativeX ?? 0, 0)
    && near(node.layoutStyle?.relativeY ?? 0, 0);
}

// 递归转换：parentLayout 用于判断背景铺底
function convertNode(node, styles, svgs, parentLayout) {
  const type = node.type;
  const L = node.layoutStyle || {};

  if (type === "TEXT") {
    const txt = realText(node);
    if (!txt) return null;
    const fv = styles[node.text[0].font]?.value || {};
    const el = { id: nextId(), elType: "widget", widgetType: "heading", settings: { title: txt } };
    const sz = fv.size || 42;
    el.settings.header_size = headerSize(sz);
    // typography_typography 未设 custom 时 Elementor 会忽略全部字体覆盖
    el.settings.typography_typography = "custom";
    if (fv.family) el.settings.typography_font_family = fv.family;
    el.settings.typography_font_size = px(sz);
    if (fv.weight) el.settings.typography_font_weight = String(fv.weight);
    if (fv.lineHeight && fv.lineHeight !== "auto") el.settings.typography_line_height = { unit: "px", size: parseFloat(fv.lineHeight) };
    if (fv.letterSpacing && fv.letterSpacing !== "auto") el.settings.typography_letter_spacing = { unit: "px", size: parseFloat(fv.letterSpacing) };
    if (node.textAlign) el.settings.align = node.textAlign;
    if (node._color && /^#[0-9a-fA-F]{3,8}$/.test(String(node._color).trim())) el.settings.title_color = node._color;
    return el;
  }

  if (type === "PATH") {
    const svg = node.svgName ? svgs.find((s) => s.name === node.svgName || s.name.startsWith(node.svgName + "_"))?.svg : null;
    if (!svg) return null;
    return { id: nextId(), elType: "widget", widgetType: "html", settings: { html: svg } };
  }

  if (type === "LAYER") {
    const f = parseFill(node, styles);
    if (f.image && isCover(node, parentLayout)) {
      // 铺底背景：absolute 容器铺满父，不占 flex 流
      const s = { position: "absolute", top: px(0), left: px(0), right: px(0), bottom: px(0), background_background: "classic", background_image: { url: _placeholderImages ? placeholderImage(L.width, L.height) : f.image }, background_size: "cover" };
      if (L.width) s.width = px(L.width);
      if (L.height) s.height = px(L.height);
      return { id: nextId(), elType: "container", isInner: true, settings: s, elements: [] };
    }
    if (f.image) {
      // 内容图：保持 flow widget（照片/插图等）
      const url = _placeholderImages ? placeholderImage(L.width, L.height) : f.image;
      return { id: nextId(), elType: "widget", widgetType: "image", settings: { image: { url, id: "" } } };
    }
    const bg = bgSettings(node, styles);
    if (bg.background_background || bg.background_gradient_type || bg.border_radius) {
      // 纯色/渐变背景图层：按设计稿坐标绝对定位（不占 flex 流），z-index 由后处理按序分配
      const s = { position: "absolute", top: px(L.relativeY || 0), left: px(L.relativeX || 0), ...bg };
      if (L.width) s.width = px(L.width);
      if (L.height) s.height = px(L.height);
      return { id: nextId(), elType: "container", isInner: true, settings: s, elements: [] };
    }
    return null;
  }

  // GROUP / FRAME / INSTANCE 等容器
  const settings = { ...flexSettings(node.flexContainerInfo), ...bgSettings(node, styles) };
  const isFlex = Boolean(node.flexContainerInfo?.flexDirection);
  // 非 flex 容器：把文本/图片/图标等 widget 按设计稿坐标包一层绝对定位容器，
  // 与「忠实 HTML 还原层」一致，避免内容全部塌到容器左上角
  const children = node.children
    ? node.children
        .map((c) => {
          const r = convertNode(c, styles, svgs, L);
          if (!r) return null;
          if (!isFlex && r.elType === "widget") {
            const lc = c.layoutStyle || {};
            const pos = { position: "absolute", top: px(lc.relativeY || 0), left: px(lc.relativeX || 0) };
            if (lc.width) pos.width = px(lc.width);
            if (lc.height) pos.height = px(lc.height);
            return { id: nextId(), elType: "container", isInner: true, settings: pos, elements: [r] };
          }
          return r;
        })
        .filter(Boolean)
    : [];
  const hasAbs = children.some((c) => c.elType === "container" && c.settings?.position === "absolute");
  if (hasAbs) settings.position = "relative";
  // 宽度保留；高度策略：有可见背景的容器保留固定高（背景块），纯内容容器不设固定高，
  // 由内容自然撑开 —— 消除设计稿画布留白，页面更紧凑
  const ownBg = bgSettings(node, styles);
  const visibleBg = ownBg.background_background || ownBg.background_gradient_type || ownBg.border_radius;
  if (L.width && !hasAbs) settings.width = px(L.width);
  if (L.height && !hasAbs && visibleBg) settings.height = px(L.height);
  if (hasAbs) {
    // 有绝对定位子层时按内容包围盒兜底高度，避免父容器塌陷
    const box = contentBottom([node]);
    if (box > 0) settings.min_height = px(Math.round(box));
  }

  return { id: nextId(), elType: "container", isInner: true, settings, elements: children };
}

// 递归剔除无用空容器（无子元素、无背景、非绝对定位）
function hasVisibleStyle(s) {
  return !!(
    s && (s.background_image?.url || s.background_gradient_type || s.background_color || s.border_radius)
  );
}

function pruneTree(node) {
  if (node.elements) {
    node.elements = node.elements
      .map(pruneTree)
      .filter(Boolean)
      .filter((el) => {
        if (el.elType !== "container" || el.elements.length > 0) return true;
        if (el.settings?.position === "absolute") return true;
        return hasVisibleStyle(el.settings);
      });
  }
  return node;
}

// 按文档顺序为绝对定位层分配 z-index；铺底背景恒为 0（垫底）
function assignZ(containers) {
  const walk = (arr) => {
    let zi = 0;
    arr.forEach((el) => {
      if (el.elType === "container" && el.settings?.position === "absolute") {
        const s = el.settings;
        const isBg =
          s.background_image?.url &&
          s.top?.size === 0 && s.left?.size === 0 &&
          s.right?.size === 0 && s.bottom?.size === 0;
        s.z_index = isBg ? 0 : ++zi;
      }
      if (el.elements) walk(el.elements);
    });
  };
  walk(containers);
}

// 转换一个 samplesDir → { template, stats }
export function convertSamples(samplesDir, opts = {}) {
  _id = 0;
  _placeholderImages = !!opts.placeholderImages;
  const read = (f) => JSON.parse(readFileSync(join(samplesDir, f), "utf8"));
  const mode1 = read("mode1_sections.json");
  const svgs = (read("svgs.json").svgs || []);

  const yMap = {};
  (mode1.sections || []).forEach((s, i) => { yMap[i] = s.y ?? i; });

  const order = [];
  for (let i = 0; i < (mode1.totalSections ?? 0); i++) {
    try { order.push({ y: yMap[i] ?? i, data: read(`section_${i}.json`) }); } catch { /* 跳过缺失 */ }
  }
  order.sort((a, b) => a.y - b.y);

  const content = order.map((o) => {
    const dsl = o.data.dsl || {};
    const root = o.data.rootContainer || {};
    const settings = { content_width: "full" };
    // v4：section 高度收敛到内容实际包围盒，不再套整页画布高度
    const box = contentBottom(dsl.nodes || []);
    if (box > 0) settings.min_height = px(Math.round(box));
    if (root.background && /^#[0-9a-fA-F]{3,8}$/.test(root.background)) settings.background_background = "classic";
    if (root.background) settings.background_color = root.background;
    const sectionKids = (dsl.nodes || [])
      .map((n) => {
        const r = convertNode(n, dsl.styles || {}, svgs, null);
        if (!r) return null;
        if (r.elType === "widget") {
          const ln = n.layoutStyle || {};
          const pos = { position: "absolute", top: px(ln.relativeY || 0), left: px(ln.relativeX || 0) };
          if (ln.width) pos.width = px(ln.width);
          if (ln.height) pos.height = px(ln.height);
          return { id: nextId(), elType: "container", isInner: true, settings: pos, elements: [r] };
        }
        return r;
      })
      .filter(Boolean);
    return {
      id: nextId(), elType: "container", isInner: false, settings,
      elements: sectionKids,
    };
  });

  content.forEach(pruneTree);
  assignZ(content);

  const template = {
    title: mode1.rootMetadata?.name || "MasterGo Home",
    type: "page",
    version: "0.5",
    page_settings: {},
    content,
  };

  let containers = 0, abs = 0, bgImgs = 0;
  const widgets = {};
  (function walk(n) {
    if (n.elType === "container") { containers++; if (n.settings?.position === "absolute") abs++; if (n.settings?.background_image) bgImgs++; }
    if (n.elType === "widget") widgets[n.widgetType] = (widgets[n.widgetType] || 0) + 1;
    (n.elements || []).forEach(walk);
  })({ elements: content });

  return { template, stats: { sections: content.length, containers, widgets, abs, bgImgs } };
}
