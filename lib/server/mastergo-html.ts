// 忠实还原层 v2：MasterGo DSL → HTML（按画布绝对坐标 1:1 还原，用于可视化预览与下载）
// 页面 = 1920×N 画布；每个顶层 section（帧）按设计稿 x/y 绝对摆放，z 顺序 = 导出顺序
// 与 converter.js 同源数据；Elementor 结构仍由 converter.js 生成
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { placeholderImage } from "@/server/services/converter.js";

interface DSLNode {
  type?: string;
  id?: string;
  name?: string;
  layoutStyle?: { width?: number; height?: number; relativeX?: number; relativeY?: number; flipV?: boolean; flipH?: boolean };
  flexContainerInfo?: { flexDirection?: string; gap?: number; justifyContent?: string; alignItems?: string; padding?: string };
  fill?: string;
  _color?: string;
  opacity?: number;
  borderRadius?: string | number;
  effect?: string;
  text?: { text: string; font: string }[];
  textAlign?: string;
  textMode?: string;
  svgName?: string;
  strokeWidth?: string | number;
  strokeType?: string;
  strokeColor?: string;
  children?: DSLNode[];
}

interface FontV {
  family?: string;
  size?: number;
  weight?: string | number;
  lineHeight?: string;
  letterSpacing?: string;
  decoration?: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const px = (n: number | undefined) => (Number.isFinite(n as number) ? `${Math.round(n as number)}px` : "");

const FONT_FALLBACK = '"PingFang SC", "Microsoft YaHei", -apple-system, sans-serif';
const GOOGLE_FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">';

// 递归内容包围盒（节点相对其所在帧）
function contentBottom(nodes: DSLNode[]): number {
  let bottom = 0;
  const walk = (n: DSLNode, accY: number) => {
    const L = n.layoutStyle || {};
    const y = accY + (L.relativeY || 0);
    const h = y + (L.height || 0);
    if (h > bottom) bottom = h;
    (n.children || []).forEach((c) => walk(c, y));
  };
  (nodes || []).forEach((n) => walk(n, 0));
  return bottom;
}

function fillInfo(node: DSLNode, styles: Record<string, { value?: unknown }>) {
  const items = node.fill && styles[node.fill] ? (styles[node.fill].value as unknown[]) : null;
  const out: { color?: string; gradient?: string; image?: string } = {};
  if (items) {
    for (const it of items) {
      if (typeof it === "string") {
        if (/gradient/i.test(it)) out.gradient = it;
        else if (/^#[0-9a-fA-F]{3,8}$/.test(it.trim())) out.color = it.trim();
      } else if (it && typeof it === "object" && (it as { url?: string }).url) {
        out.image = (it as { url: string }).url;
      }
    }
  }
  if (!out.color && !out.gradient && node._color && /^#[0-9a-fA-F]{3,8}$/.test(String(node._color).trim())) {
    out.color = String(node._color).trim();
  }
  return out;
}

function paintColor(name: string | undefined, styles: Record<string, { value?: unknown }>): string {
  if (!name) return "";
  const v = styles[name]?.value as unknown[] | undefined;
  const c = Array.isArray(v) ? v[0] : undefined;
  if (typeof c === "string" && /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/.test(c.trim())) return c.trim();
  return "";
}

function effectCss(node: DSLNode, styles: Record<string, { value?: unknown }>): string {
  if (!node.effect) return "";
  const v = styles[node.effect]?.value as unknown[] | undefined;
  const first = Array.isArray(v) ? v[0] : undefined;
  if (typeof first !== "string") return "";
  const m = first.match(/^([a-z-]+)\s*:\s*(.+?)\s*;?$/i);
  return m && /^(box-shadow|filter|backdrop-filter|drop-shadow|text-shadow)$/i.test(m[1]) ? `${m[1]}:${m[2]};` : "";
}

function strokeCss(node: DSLNode, styles: Record<string, { value?: unknown }>): string {
  if (!node.strokeWidth) return "";
  const w = String(node.strokeWidth);
  const color = paintColor(node.strokeColor, styles);
  if (!color) return "";
  const style = /^(solid|dashed|dotted|double)$/.test(String(node.strokeType || "")) ? node.strokeType : "solid";
  return `border:${w} ${style} ${color};`;
}

function bgCss(node: DSLNode, styles: Record<string, { value?: unknown }>, realImages: boolean, w?: number, h?: number): string {
  const f = fillInfo(node, styles);
  const out: string[] = [];
  if (f.gradient) out.push(`background-image:${f.gradient};`);
  else if (f.image) {
    const url = realImages ? f.image : placeholderImage(w, h);
    out.push(`background-image:url("${esc(url)}");background-size:cover;background-position:center;background-repeat:no-repeat;`);
  } else if (f.color) out.push(`background-color:${f.color};`);
  if (node.borderRadius) {
    const r = String(node.borderRadius);
    out.push(r.endsWith("px") || r.endsWith("%") ? `border-radius:${r};` : `border-radius:${r}px;`);
  }
  if (typeof node.opacity === "number" && node.opacity < 1) out.push(`opacity:${node.opacity};`);
  const ef = effectCss(node, styles);
  if (ef) out.push(ef);
  const st = strokeCss(node, styles);
  if (st) out.push(st);
  return out.join("");
}

function boxCss(node: DSLNode, asFlexItem = false, scale?: { sx: number; sy: number }): string {
  const L = node.layoutStyle || {};
  if (asFlexItem) {
    const out = ["box-sizing:border-box;flex-shrink:0"];
    if (L.width) out.push(`width:${Math.round(L.width)}px`);
    if (L.height) out.push(`height:${Math.round(L.height)}px`);
    if (scale && scale.sx !== 1) out.push(`transform:scale(${scale.sx},${scale.sy});transform-origin:0 0`);
    return out.join(";");
  }
  const out = ["position:absolute", `left:${px(L.relativeX) || "0"}`, `top:${px(L.relativeY) || "0"}`];
  if (L.width) out.push(`width:${Math.round(L.width)}px`);
  if (L.height) out.push(`height:${Math.round(L.height)}px`);
  if (L.flipV) out.push("transform:scaleY(-1)");
  if (L.flipH) out.push("transform:scaleX(-1)");
  if (scale && scale.sx !== 1) out.push(`transform:scale(${scale.sx},${scale.sy});transform-origin:0 0`);
  out.push("box-sizing:border-box");
  return out.join(";");
}

function lineHeightCss(v: string | undefined): string {
  if (!v || v === "auto") return "";
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n < 5 ? `line-height:${n};` : `line-height:${n}px;`;
}

const familyClause = (family: string | undefined) =>
  family ? `"${family.replace(/"/g, "")}",` : "";

function fontCss(text: DSLNode, styles: Record<string, { value?: unknown }>): string {
  const fk = text.text?.[0]?.font;
  const fv = (fk && styles[fk]?.value) as FontV | undefined;
  const out: string[] = [];
  const size = fv?.size || 42;
  out.push(`font-size:${size}px`);
  out.push(`font-family:${familyClause(fv?.family)}${FONT_FALLBACK}`);
  if (fv?.weight && Number.isFinite(parseFloat(String(fv.weight)))) out.push(`font-weight:${String(fv.weight)}`);
  const lh = lineHeightCss(fv?.lineHeight);
  if (lh) out.push(lh);
  if (fv?.letterSpacing && fv.letterSpacing !== "auto") out.push(`letter-spacing:${parseFloat(fv.letterSpacing)}px`);
  if (fv?.decoration && fv.decoration !== "none") out.push(`text-decoration:${fv.decoration}`);
  if (text._color && /^#[0-9a-fA-F]{3,8}$/.test(String(text._color).trim())) out.push(`color:${String(text._color).trim()}`);
  return out.join(";");
}

function renderNode(
  n: DSLNode,
  styles: Record<string, { value?: unknown }>,
  svgs: { name?: string; svg?: string }[],
  realImages: boolean,
  inFlex: boolean,
  scale?: { sx: number; sy: number }
): string {
  const L = n.layoutStyle || {};
  const type = n.type;

  if (type === "TEXT") {
    const raw = n.text?.[0]?.text || "";
    const txt = /^T\d+\|/.test(raw) ? (n.name || raw).replace(/\r/g, "") : raw.replace(/\r/g, "");
    if (!txt.trim()) return "";
    const css: string[] = inFlex
      ? ["box-sizing:border-box;flex-shrink:0"]
      : ["position:absolute", `left:${px(L.relativeX) || "0"}`, `top:${px(L.relativeY) || "0"}`];
    if (L.width) css.push(`width:${Math.round(L.width)}px`);
    if (L.height) css.push(`height:${Math.round(L.height)}px`);
    if (scale && scale.sx !== 1) css.push(`transform:scale(${scale.sx},${scale.sy});transform-origin:0 0`);
    css.push(fontCss(n, styles));
    if (n.textAlign) css.push(`text-align:${String(n.textAlign)}`);
    css.push(n.textMode === "single-line" ? "white-space:nowrap" : "white-space:pre-wrap");
    css.push("overflow:hidden");
    css.push("box-sizing:border-box");
    return `<div data-n="${esc(n.name || "")}" style="${css.join(";")}">${esc(txt)}</div>`;
  }

  if (type === "PATH") {
    const svg = n.svgName ? svgs.find((s) => s.name === n.svgName || s.name?.startsWith(String(n.svgName) + "_"))?.svg : null;
    if (!svg) return "";
    const sized = svg
      .replace(/width="[^"]*"/, `width="${L.width || 24}"`)
      .replace(/height="[^"]*"/, `height="${L.height || 24}"`);
    return `<div data-n="${esc(n.name || "")}" style="${boxCss(n, inFlex, scale)};overflow:hidden">${sized}</div>`;
  }

  if (type === "LAYER" || type === "SVG_ELLIPSE") {
    const f = fillInfo(n, styles);
    const st = strokeCss(n, styles);
    if (!f.color && !f.gradient && !f.image && !st) return ""; // 无可见内容
    const css = [`${boxCss(n, inFlex, scale)}`, bgCss(n, styles, realImages, L.width, L.height)];
    if (type === "SVG_ELLIPSE") css.push("border-radius:50%");
    return `<div data-n="${esc(n.name || "")}" style="${css.join(";")}"></div>`;
  }

  // GROUP / FRAME / INSTANCE 容器
  const own = bgCss(n, styles, realImages, L.width, L.height);
  // INSTANCE 子层若远大于实例盒（如超清 logo 源图），按实例盒等比缩放
  const scaleChild = (c: DSLNode): { sx: number; sy: number } | undefined => {
    if (type !== "INSTANCE") return undefined;
    const W = L.width || 0, H = L.height || 0, cw = c.layoutStyle?.width || 0, ch = c.layoutStyle?.height || 0;
    if (!W || !H || !cw || !ch) return undefined;
    if (cw <= W * 1.5 || ch <= H * 1.5) return undefined;
    return { sx: W / cw, sy: H / ch };
  };
  const rendered = (n.children || [])
    .map((c) => renderNode(c, styles, svgs, realImages, !!n.flexContainerInfo?.flexDirection, scaleChild(c)))
    .filter((x) => x !== "");
  const fci = n.flexContainerInfo;
  const isFlex = Boolean(fci?.flexDirection) && rendered.length > 0;
  let inner: string;
  let extraCss = "";
  if (isFlex && fci) {
    extraCss = `display:flex;flex-direction:${fci.flexDirection === "column" ? "column" : "row"};`;
    if (fci.gap) extraCss += `gap:${fci.gap}px;`;
    if (fci.justifyContent) extraCss += `justify-content:${fci.justifyContent};`;
    if (fci.alignItems) extraCss += `align-items:${fci.alignItems};`;
    const pad = fci.padding ? `padding:${fci.padding};` : "";
    if (pad) extraCss += pad;
    inner = rendered.join("");
  } else {
    inner = rendered.join("");
  }
  // 纯内容包裹层（无背景/无边框/无自身样式）可折叠，避免无谓嵌套
  const hasOwn = own !== "";
  const needBox = L.width || L.height || L.relativeX || L.relativeY || L.flipV || L.flipH;
  if (!hasOwn && !needBox && !isFlex) return inner; // 纯中转容器直接展开
  if (!hasOwn && !needBox && isFlex) return `<div data-n="${esc(n.name || "")}" style="${extraCss}">${inner}</div>`;
  const css = [boxCss(n, inFlex, scale), own, extraCss];
  return `<div data-n="${esc(n.name || "")}" style="${css.join(";")}">${inner}</div>`;
}

interface SecMeta { name?: string; x?: number; y?: number; width?: number; height?: number }

export function renderMastergoHtml(samplesDir: string, opts: { realImages?: boolean; fonts?: boolean } = {}): string {
  const realImages = opts.realImages !== false;
  const useFonts = opts.fonts === true;
  const mode1 = JSON.parse(readFileSync(join(samplesDir, "mode1_sections.json"), "utf8"));
  const svgs = (JSON.parse(readFileSync(join(samplesDir, "svgs.json"), "utf8")).svgs || []) as { name?: string; svg?: string }[];
  const root = mode1.rootMetadata || {};
  const rootW = root.width || 1920;
  const rootStyles = (root.styles || {}) as Record<string, { value?: unknown }>;
  const sectionMeta = (mode1.sections || []) as SecMeta[];
  const rootBg = paintColor(root.fill, rootStyles) || "#FFFFFF";

  const sections: string[] = [];
  let unionBottom = 0;
  for (let i = 0; i < (mode1.totalSections ?? 0); i++) {
    const meta = sectionMeta[i] || {};
    let data: { dsl?: { nodes?: DSLNode[]; styles?: Record<string, { value?: unknown }> } } | null = null;
    try { data = JSON.parse(readFileSync(join(samplesDir, `section_${i}.json`), "utf8")); } catch { /* 缺失跳过 */ }
    if (!data) continue;
    const dsl = data.dsl || {};
    const dslStyles = (dsl.styles || {}) as Record<string, { value?: unknown }>;
    const nodes = (dsl.nodes || []).map((n) => renderNode(n, dslStyles, svgs, realImages, false)).filter(Boolean);
    const box = contentBottom(dsl.nodes || []);
    if (!nodes.length && box === 0) continue; // 空帧跳过
    const secW = meta.width || rootW;
    const secCss = [
      "position:absolute",
      `left:${Math.round(meta.x || 0)}px`,
      `top:${Math.round(meta.y || 0)}px`,
      `width:${Math.round(secW)}px`,
      `min-height:${Math.round(box) || 1}px`,
    ].join(";");
    sections.push(`<section data-index="${i}" data-name="${esc(meta.name || "")}" style="${secCss}">${nodes.join("")}</section>`);
    const bottom = (meta.y || 0) + box;
    if (bottom > unionBottom) unionBottom = bottom;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(root.name || "MasterGo 设计稿")}</title>
${useFonts ? GOOGLE_FONTS : ""}
<style>
html,body{margin:0;padding:0}
body{min-width:${rootW}px;overflow-x:auto;background:#fff}
.page{position:relative;width:${rootW}px;min-height:${Math.round(unionBottom)}px;background:${rootBg};overflow:hidden}
svg{overflow:visible}
section{overflow:visible}
</style>
</head>
<body>
<div class="page">
${sections.join("\n")}
</div>
</body>
</html>`;
}
