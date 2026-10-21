// 把 Elementor _elementor_data 渲染为独立 HTML（用于可视化预览 iframe）

interface Dim {
  unit?: string;
  size?: number | string;
}

interface Settings {
  [key: string]: unknown;
}

interface ElementorNode {
  elType?: string;
  widgetType?: string;
  isInner?: boolean;
  settings?: Settings;
  elements?: ElementorNode[];
}

const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );

const escapeAttr = (s: unknown) => escapeHtml(s).replace(/`/g, "&#96;");

function num(v: unknown) {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v);
  return NaN;
}

function dim(v: Dim | number | string | undefined): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const s = num(v.size);
    return Number.isFinite(s) ? `${s}${v.unit || "px"}` : "";
  }
  const s = num(v);
  return Number.isFinite(s) ? `${s}px` : String(v);
}

function paddingCss(p: unknown): string {
  if (!p || typeof p !== "object") return "";
  const x = p as { top?: string; right?: string; bottom?: string; left?: string };
  return `padding:${x.top || 0}px ${x.right || 0}px ${x.bottom || 0}px ${x.left || 0}px;`;
}

function backgroundCss(s: Settings): string {
  const out: string[] = [];
  const bType = s.background_background;
  const color = typeof s.background_color === "string" ? s.background_color : "";
  const img = (s.background_image as { url?: string } | undefined)?.url;

  if (bType === "gradient" && s.background_gradient_type === "linear") {
    const c1 = (s.background_gradient_color as { color?: string } | undefined)?.color;
    const c2 = (s.background_gradient_color_b as { color?: string } | undefined)?.color;
    const a1 = dim(s.background_gradient_color_stop as Dim) || "0%";
    const a2 = dim(s.background_gradient_color_b_stop as Dim) || "100%";
    const ang = dim(s.background_gradient_angle as Dim) || "180deg";
    if (c1 || c2) {
      out.push(`background-image:linear-gradient(${ang},${c1 || "transparent"} ${a1},${c2 || "transparent"} ${a2});`);
    }
  }
  if (color) out.push(`background-color:${color};`);
  if (img) {
    out.push(
      `background-image:url("${escapeAttr(img)}");background-size:${String(s.background_size || "cover")};background-position:center;background-repeat:no-repeat;`
    );
  }
  return out.join("");
}

function borderCss(s: Settings): string {
  const r = s.border_radius as { top?: string; right?: string; bottom?: string; left?: string } | undefined;
  if (!r) return "";
  return `border-radius:${r.top || 0}px ${r.right || 0}px ${r.bottom || 0}px ${r.left || 0}px;`;
}

function positionCss(s: Settings): string {
  if (s.position === "absolute") {
    const out: string[] = ["position:absolute;"];
    for (const k of ["top", "left", "right", "bottom"] as const) {
      const v = s[k];
      if (v) out.push(`${k}:${dim(v as Dim)};`);
    }
    return out.join("");
  }
  if (s.position === "relative") return "position:relative;";
  return "";
}

function containerStyle(s: Settings): string {
  const out: string[] = ["box-sizing:border-box;"];
  if (s.flex_direction) {
    out.push("display:flex;");
    out.push(`flex-direction:${s.flex_direction};`);
    if (s.flex_gap) out.push(`gap:${dim(s.flex_gap as Dim)};`);
    if (s.justify_content) out.push(`justify-content:${String(s.justify_content)};`);
    if (s.align_items) out.push(`align-items:${String(s.align_items)};`);
  }
  out.push(positionCss(s));
  const pad = paddingCss(s.padding);
  if (pad) out.push(pad);
  if (s.width) out.push(`width:${dim(s.width as Dim)};`);
  if (s.height) out.push(`height:${dim(s.height as Dim)};`);
  if (s.min_height) out.push(`min-height:${dim(s.min_height as Dim)};`);
  out.push(backgroundCss(s));
  out.push(borderCss(s));
  return out.join("");
}

const HEADING_FONT: Record<string, string> = {
  h1: "48px",
  h2: "40px",
  h3: "28px",
  h4: "20px",
  h5: "16px",
};

function alignCss(align: unknown): string {
  const map: Record<string, string> = { left: "left", center: "center", right: "right", justify: "justify" };
  const a = map[String(align)];
  return a ? `text-align:${a};` : "";
}

function headingWidget(w: ElementorNode): string {
  const s = w.settings || {};
  const tag = typeof s.header_size === "string" ? s.header_size : "h3";
  const css: string[] = ["margin:0;white-space:pre-wrap;"];
  css.push(`font-size:${dim(s.typography_font_size as Dim) || HEADING_FONT[tag] || "28px"};`);
  if (s.typography_font_family) css.push(`font-family:${String(s.typography_font_family)};`);
  if (s.typography_font_weight) css.push(`font-weight:${String(s.typography_font_weight)};`);
  if (s.typography_line_height) css.push(`line-height:${dim(s.typography_line_height as Dim)};`);
  if (s.typography_letter_spacing) css.push(`letter-spacing:${dim(s.typography_letter_spacing as Dim)};`);
  if (s.title_color) css.push(`color:${String(s.title_color)};`);
  return `<div data-widget="heading" style="${alignCss(s.align)}"><${tag} style="${css.join("")}">${escapeHtml(s.title ?? "")}</${tag}></div>`;
}

function imageWidget(w: ElementorNode): string {
  const url = (w.settings?.image as { url?: string } | undefined)?.url;
  if (!url) return "";
  return `<div data-widget="image"><img src="${escapeAttr(url)}" alt="" loading="lazy" style="display:block;max-width:100%;height:auto;" /></div>`;
}

function htmlWidget(w: ElementorNode): string {
  const raw = w.settings?.html || "";
  return `<div data-widget="html" style="max-width:100%;overflow:hidden;">${raw}</div>`;
}

function buttonWidget(w: ElementorNode): string {
  const s = w.settings || {};
  const link = (s.link as { url?: string } | undefined)?.url || "#";
  const css = `display:inline-block;background-color:${String(s.background_color || "#0b5cad")};color:${String(s.button_text_color || "#fff")};padding:12px 24px;border-radius:${dim(s.border_radius as Dim) || "6px"};font-size:${dim(s.typography_font_size as Dim) || "15px"};text-decoration:none;font-weight:500;`;
  return `<div data-widget="button" style="${alignCss(s.align)}"><a href="${escapeAttr(link)}" style="${css}">${escapeHtml(s.text || "按钮")}</a></div>`;
}

function textEditorWidget(w: ElementorNode): string {
  return `<div data-widget="text-editor" style="${alignCss(w.settings?.align)}">${w.settings?.editor || ""}</div>`;
}

const WIDGETS: Record<string, (w: ElementorNode) => string> = {
  heading: headingWidget,
  image: imageWidget,
  html: htmlWidget,
  button: buttonWidget,
  "text-editor": textEditorWidget,
};

function widgetHtml(w: ElementorNode): string {
  const fn = WIDGETS[w.widgetType || ""];
  if (fn) return fn(w);
  return `<div data-widget="${escapeAttr(w.widgetType || "widget")}">${escapeHtml(w.widgetType || "widget")}</div>`;
}

function innerContainerHtml(n: ElementorNode): string {
  const children = (n.elements || []).map((c) => renderNode(c)).join("");
  return `<div class="e-inner" style="${containerStyle(n.settings || {})}">${children}</div>`;
}

export function renderNode(n: ElementorNode): string {
  if (n.elType === "widget") return widgetHtml(n);
  if (n.isInner) return innerContainerHtml(n);
  return sectionHtml(n, 0);
}

export function sectionHtml(sec: ElementorNode, idx: number): string {
  const s = sec.settings || {};
  const children = (sec.elements || []).map((c) => renderNode(c)).join("");
  const style = ["display:flex;flex-direction:column;box-sizing:border-box;", positionCss(s)];
  if (s.min_height) style.push(`min-height:${dim(s.min_height as Dim)};`);
  if (s.width) style.push(`width:${dim(s.width as Dim)};`);
  style.push(backgroundCss(s));
  const pad = paddingCss(s.padding);
  if (pad) style.push(pad);

  const body = s.content_width === "boxed" ? `<div style="width:100%;max-width:1140px;margin:0 auto;">${children}</div>` : children;
  return `<section data-section="${idx}" style="${style.join("")}">${body}</section>`;
}

const DESIGN_WIDTH_FALLBACK = 1920;
const PAGE_CSS = (innerMinWidth: number) => `
:root{color-scheme:light}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1f2933;background:#fff;font-size:16px;-webkit-font-smoothing:antialiased;min-width:${innerMinWidth || DESIGN_WIDTH_FALLBACK}px;overflow-x:auto}
img{max-width:100%}
.e-inner>*{max-width:100%}
`;

export function renderTemplateHtml(template: { title?: string; content?: ElementorNode[] }): string {
  const sections = (template.content || []).map((s, i) => sectionHtml(s, i)).join("\n");
  const body = sections || '<div style="padding:40px;color:#8492a6;">（空模板）</div>';
  // 探测内容中的固定宽度（描述符来自模板根容器）
  const rootW = (template.content?.[0]?.settings?.width as Dim | undefined)?.size || DESIGN_WIDTH_FALLBACK;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(template.title || "M-AI-E 预览")}</title>
  <style>${PAGE_CSS(Number(rootW))}</style>
</head>
<body>
${body}
</body>
</html>`;
}
