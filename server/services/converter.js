// 转译服务 v3：DSL → Elementor 模板（提升视觉还原度）
// 升级点：fill 渐变/图片背景解析、背景图铺底叠放、容器尺寸、完整字体映射、冗余精简
import { readFileSync } from "node:fs";
import { join } from "node:path";

let _id = 0;
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
      const s = { position: "absolute", top: px(0), left: px(0), right: px(0), bottom: px(0), background_background: "classic", background_image: { url: f.image }, background_size: "cover" };
      if (L.width) s.width = px(L.width);
      if (L.height) s.height = px(L.height);
      return { id: nextId(), elType: "container", isInner: true, settings: s, elements: [] };
    }
    if (f.image) {
      return { id: nextId(), elType: "widget", widgetType: "image", settings: { image: { url: f.image, id: "" } } };
    }
    const bg = bgSettings(node, styles);
    if (bg.background_background || bg.background_gradient_type || bg.border_radius) {
      const s = { ...bg };
      if (L.width) s.width = px(L.width);
      if (L.height) s.height = px(L.height);
      return { id: nextId(), elType: "container", isInner: true, settings: s, elements: [] };
    }
    return null;
  }

  // GROUP / FRAME / INSTANCE 等容器
  const settings = { ...flexSettings(node.flexContainerInfo), ...bgSettings(node, styles) };
  const children = node.children ? node.children.map((c) => convertNode(c, styles, svgs, L)).filter(Boolean) : [];
  const hasAbs = children.some((c) => c.elType === "container" && c.settings?.position === "absolute");
  if (hasAbs) settings.position = "relative";
  if (!node.flexContainerInfo) { /* 容器无 flex 信息：保持块级 */ }
  if (L.width && !hasAbs) settings.width = px(L.width);
  if (L.height && !hasAbs) settings.height = px(L.height);

  return { id: nextId(), elType: "container", isInner: true, settings, elements: children };
}

// 转换一个 samplesDir → { template, stats }
export function convertSamples(samplesDir) {
  _id = 0;
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
    if (root.minHeight) settings.min_height = px(parseFloat(root.minHeight));
    if (root.background && /^#[0-9a-fA-F]{3,8}$/.test(root.background)) settings.background_background = "classic";
    if (root.background) settings.background_color = root.background;
    return {
      id: nextId(), elType: "container", isInner: false, settings,
      elements: (dsl.nodes || []).map((n) => convertNode(n, dsl.styles || {}, svgs, null)).filter(Boolean),
    };
  });

  const template = {
    title: mode1.rootMetadata?.name || "MasterGo Home",
    type: "page",
    version: "0.4",
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
