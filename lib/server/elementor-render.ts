// 把 Elementor _elementor_data 渲染为独立 HTML（用于可视化预览 iframe）

interface Dim {
  unit?: string;
  size?: number | string;
}

interface Settings {
  [key: string]: unknown;
}

interface ElementorNode {
  id?: string;
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
    if (v.unit === "custom") return String(v.size ?? "");
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

function marginCss(p: unknown): string {
  if (!p || typeof p !== "object") return "";
  const x = p as { top?: string; right?: string; bottom?: string; left?: string };
  return `margin:${x.top || 0}px ${x.right || 0}px ${x.bottom || 0}px ${x.left || 0}px;`;
}

function backgroundCss(s: Settings): string {
  const out: string[] = [];
  const bType = s.background_background;
  const color = typeof s.background_color === "string" ? s.background_color : "";
  const img = (s.background_image as { url?: string } | undefined)?.url;

  if (bType === "gradient" && s.background_gradient_type === "linear") {
    const raw1 = s.background_color ?? s.background_gradient_color;
    const raw2 = s.background_color_b ?? s.background_gradient_color_b;
    const c1 = typeof raw1 === "object" ? (raw1 as { color?: string } | undefined)?.color : raw1;
    const c2 = typeof raw2 === "object" ? (raw2 as { color?: string } | undefined)?.color : raw2;
    const a1 = dim((s.background_color_stop ?? s.background_gradient_color_stop) as Dim) || "0%";
    const a2 = dim((s.background_color_b_stop ?? s.background_gradient_color_b_stop) as Dim) || "100%";
    const ang = dim(s.background_gradient_angle as Dim) || "180deg";
    if (c1 || c2) {
      out.push(`background-image:linear-gradient(${ang},${c1 || "transparent"} ${a1},${c2 || "transparent"} ${a2});`);
    }
  }
  if (color) out.push(`background-color:${color};`);
  if (img) {
    out.push(
      `background-image:url("${escapeAttr(img)}");background-size:${String(s.background_size || "cover")};background-position:${String(s.background_position || "center")};background-repeat:${String(s.background_repeat || "no-repeat")};`
    );
  }
  return out.join("");
}

function borderCss(s: Settings): string {
  const r = s.border_radius as { top?: string; right?: string; bottom?: string; left?: string } | undefined;
  const out: string[] = [];
  if (r) out.push(`border-radius:${r.top || 0}px ${r.right || 0}px ${r.bottom || 0}px ${r.left || 0}px;`);
  const w = s.border_width as { top?: string; right?: string; bottom?: string; left?: string } | undefined;
  if (w && [w.top, w.right, w.bottom, w.left].some((v) => parseFloat(String(v || 0)) > 0)) {
    out.push(`border-width:${w.top || 0}px ${w.right || 0}px ${w.bottom || 0}px ${w.left || 0}px;border-style:${String(s.border_border || "solid")};border-color:${String(s.border_color || "#000")};`);
  }
  return out.join("");
}

function positionCss(s: Settings): string {
  const pos = s._position ?? s.position;
  if (pos === "absolute" || pos === "fixed") {
    const out: string[] = [`position:${pos};`];
    const h = s._offset_orientation_h;
    const v = s._offset_orientation_v;
    const x = dim((s._offset_x ?? s.left) as Dim);
    const xe = dim((s._offset_x_end ?? s.right) as Dim);
    const y = dim((s._offset_y ?? s.top) as Dim);
    const ye = dim((s._offset_y_end ?? s.bottom) as Dim);
    if (x) out.push(`${h === "end" ? "right" : "left"}:${x};`);
    if (xe) out.push(`right:${xe};`);
    if (y) out.push(`${v === "end" ? "bottom" : "top"}:${y};`);
    if (ye) out.push(`bottom:${ye};`);
    if (s._z_index ?? s.z_index) out.push(`z-index:${String(s._z_index ?? s.z_index)};`);
    return out.join("");
  }
  if (pos === "relative") return "position:relative;";
  return "";
}

function containerStyle(s: Settings): string {
  const out: string[] = ["box-sizing:border-box;"];
  if (s.container_type === "grid") {
    out.push("display:grid;");
    const cols = s.grid_columns_grid as Dim | undefined;
    const rows = s.grid_rows_grid as Dim | undefined;
    const gaps = (s.grid_gaps || s.grid_gap) as { row?: string; column?: string } | undefined;
    if (cols?.size) out.push(`grid-template-columns:${String(cols.size)};`);
    if (rows?.size) out.push(`grid-template-rows:${String(rows.size)};`);
    if (gaps?.row || gaps?.column) out.push(`gap:${gaps.row || 0}px ${gaps.column || 0}px;`);
  } else if (s.flex_direction) {
    out.push("display:flex;");
    out.push(`flex-direction:${s.flex_direction};`);
    const gaps = s.flex_gap as { row?: string; column?: string } | undefined;
    if (gaps?.row || gaps?.column) out.push(`gap:${gaps.row || 0}px ${gaps.column || 0}px;`);
    const justify = s.flex_justify_content ?? s.justify_content;
    const align = s.flex_align_items ?? s.align_items;
    if (justify) out.push(`justify-content:${String(justify)};`);
    if (align) out.push(`align-items:${String(align)};`);
    if (s.flex_wrap) out.push(`flex-wrap:${String(s.flex_wrap)};`);
  } else {
    out.push("display:flex;flex-direction:column;");
  }
  out.push(positionCss(s));
  const pad = paddingCss(s.padding);
  if (pad) out.push(pad);
  const margin = marginCss(s.margin);
  if (margin) out.push(margin);
  if (s.width) out.push(`width:${dim(s.width as Dim)};`);
  if (s.max_width) out.push(`max-width:${dim(s.max_width as Dim)};`);
  if (s.height) out.push(`height:${dim(s.height as Dim)};`);
  if (s.min_height) out.push(`min-height:${dim(s.min_height as Dim)};`);
  if (s.overflow) out.push(`overflow:${String(s.overflow)};`);
  out.push(backgroundCss(s));
  out.push(borderCss(s));
  if (s.z_index) out.push(`z-index:${String(s.z_index)};`);
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

function widgetBoxStyle(s: Settings): string {
  const out: string[] = [];
  const margin = marginCss(s._margin ?? s.margin);
  const padding = paddingCss(s._padding ?? s.padding);
  if (margin) out.push(margin);
  if (padding) out.push(padding);
  if (s._flex_grow) out.push(`flex-grow:${String(s._flex_grow)};`);
  if (s._flex_shrink != null) out.push(`flex-shrink:${String(s._flex_shrink)};`);
  if (s._flex_align_self) out.push(`align-self:${String(s._flex_align_self)};`);
  if (s._grid_column_custom) out.push(`grid-column:${String(s._grid_column_custom)};`);
  if (s._grid_row_custom) out.push(`grid-row:${String(s._grid_row_custom)};`);
  out.push(positionCss(s));
  if (s._element_width === "initial" && s._element_custom_width) {
    out.push(`width:${dim(s._element_custom_width as Dim)};`);
  }
  if (s._flex_size === "grow") out.push("flex-grow:1;");
  return out.join("");
}

function responsiveValue(s: Settings, baseKey: string, deviceKey: string): unknown {
  const v = s[deviceKey];
  if (v == null) return s[baseKey];
  if (typeof v === "object" && v !== null && "size" in v) {
    if ((v as Dim).unit === "custom") return String((v as Dim).size ?? "");
  }
  return v;
}

function headingWidget(w: ElementorNode): string {
  const s = w.settings || {};
  const tag = typeof s.header_size === "string" ? s.header_size : "h3";
  const css: string[] = ["margin:0;white-space:pre-wrap;"];
  css.push(`font-size:${dim(responsiveValue(s, "typography_font_size", "typography_font_size_desktop") as Dim) || HEADING_FONT[tag] || "28px"};`);
  if (s.typography_font_family) css.push(`font-family:${String(s.typography_font_family)};`);
  if (s.typography_font_weight) css.push(`font-weight:${String(s.typography_font_weight)};`);
  if (s.typography_line_height) {
    const lh = s.typography_line_height as Dim;
    css.push(`line-height:${lh.unit === "custom" ? String(lh.size) : dim(lh)};`);
  }
  if (s.typography_letter_spacing) css.push(`letter-spacing:${dim(s.typography_letter_spacing as Dim)};`);
  if (s.title_color) css.push(`color:${String(s.title_color)};`);
  return `<div data-widget="heading" class="e-heading e-heading-${tag}" style="${alignCss(s.align)}${widgetBoxStyle(s)}"><${tag} style="${css.join("")}">${escapeHtml(s.title ?? "")}</${tag}></div>`;
}

function imageWidget(w: ElementorNode): string {
  const s = w.settings || {};
  const url = (s.image as { url?: string } | undefined)?.url;
  if (!url) return "";
  const radius = s.image_border_radius as { top?: string; right?: string; bottom?: string; left?: string } | undefined;
  const imgStyle = `display:block;max-width:100%;height:auto;${s.object_fit ? `object-fit:${String(s.object_fit)};` : ""}${radius ? `border-radius:${radius.top || 0}px ${radius.right || 0}px ${radius.bottom || 0}px ${radius.left || 0}px;` : ""}`;
  return `<div data-widget="image" style="${widgetBoxStyle(s)}"><img src="${escapeAttr(url)}" alt="${escapeAttr(s.image_alt ?? "")}" loading="lazy" style="${imgStyle}" /></div>`;
}

function htmlWidget(w: ElementorNode): string {
  const raw = w.settings?.html || "";
  return `<div data-widget="html" style="max-width:100%;overflow:hidden;">${raw}</div>`;
}

function buttonWidget(w: ElementorNode): string {
  const s = w.settings || {};
  const link = (s.link as { url?: string } | undefined)?.url || "#";
  const pad = paddingCss(s.text_padding) || "padding:12px 24px;";
  const border = borderCss(s);
  const css = `display:inline-block;background-color:${String(s.background_color || "transparent")};color:${String(s.button_text_color || "#0b5cad")};${pad}border-radius:${dim(s.border_radius as Dim) || "6px"};font-size:${dim(s.typography_font_size as Dim) || "15px"};text-decoration:none;font-weight:${String(s.typography_font_weight || "500")};${border}`;
  return `<div data-widget="button" style="${alignCss(s.align)}${widgetBoxStyle(s)}"><a href="${escapeAttr(link)}" style="${css}">${escapeHtml(s.text || "按钮")}</a></div>`;
}

function textEditorWidget(w: ElementorNode): string {
  const s = w.settings || {};
  const css = [alignCss(s.align), widgetBoxStyle(s)];
  if (s.text_color) css.push(`color:${String(s.text_color)};`);
  if (s.typography_font_size) css.push(`font-size:${dim(s.typography_font_size as Dim)};`);
  return `<div data-widget="text-editor" style="${css.join("")}">${s.editor || ""}</div>`;
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

function innerContainerHtml(n: ElementorNode, cls = ""): string {
  const children = (n.elements || []).map((c) => renderNode(c)).join("");
  const idClass = n.id ? `eid-${n.id}` : "";
  const s = n.settings || {};
  const tag = s.html_tag === "a" ? "a" : "div";
  const link = s.link && typeof s.link === "object" ? (s.link as { url?: string; is_external?: string }) : null;
  const attrs = tag === "a"
    ? ` href="${escapeAttr(link?.url || "#")}"${link?.is_external ? ' target="_blank" rel="noopener"' : ""}`
    : "";
  return `<${tag}${attrs} class="e-inner ${[idClass, cls].filter(Boolean).join(" ")}" style="${containerStyle(s)}">${children}</${tag}>`;
}

function responsiveRules(content: ElementorNode[]): string {
  const out: string[] = [];
  (function walk(n: ElementorNode, path: number[]) {
    const s = n.settings || {};
    const visibility = (device: "desktop" | "tablet" | "mobile") => {
      if (device === "desktop" && s.hide_desktop) return "display:none!important;";
      if (device === "tablet" && s.hide_tablet) return "display:none!important;";
      if (device === "mobile" && s.hide_mobile) return "display:none!important;";
      return "";
    };
    const visibleDisplay = n.elType === "widget" ? "block" : (s.container_type === "grid" ? "grid" : "flex");
    const rules: Record<string, string[]> = { tablet: [], mobile: [] };
    const add = (device: "tablet" | "mobile", prop: string, val: unknown, map: (v: unknown) => string) => {
      if (val == null) return;
      rules[device].push(`${prop}:${map(val)};`);
    };
    add("tablet", "flex-direction", s.flex_direction_tablet, (v) => String(v));
    add("mobile", "flex-direction", s.flex_direction_mobile, (v) => String(v));
    add("tablet", "flex-wrap", s.flex_wrap_tablet, (v) => String(v));
    add("mobile", "flex-wrap", s.flex_wrap_mobile, (v) => String(v));
    add("tablet", "justify-content", s.flex_justify_content_tablet ?? s.justify_content_tablet, (v) => String(v));
    add("mobile", "justify-content", s.flex_justify_content_mobile ?? s.justify_content_mobile, (v) => String(v));
    add("tablet", "align-items", s.flex_align_items_tablet ?? s.align_items_tablet, (v) => String(v));
    add("mobile", "align-items", s.flex_align_items_mobile ?? s.align_items_mobile, (v) => String(v));
    for (const device of ["tablet", "mobile"] as const) {
      const pad = s[`padding_${device}`] ?? s[`_padding_${device}`];
      const margin = s[`margin_${device}`] ?? s[`_margin_${device}`];
      if (pad) rules[device].push(paddingCss(pad));
      if (margin) rules[device].push(marginCss(margin));
      if (n.elType === "widget") {
        const fs = s[`typography_font_size_${device}`];
        const lh = s[`typography_line_height_${device}`];
        if (fs) rules[device].push(`font-size:${dim(fs as Dim)};`);
        if (lh) rules[device].push(`line-height:${(lh as Dim).unit === "custom" ? String((lh as Dim).size) : dim(lh as Dim)};`);
      }
    }
    if (n.elType !== "widget" && s.container_type === "grid") {
      for (const device of ["tablet", "mobile"] as const) {
        const cols = s[`grid_columns_grid_${device}`] as Dim | undefined;
        if (cols?.size) rules[device].push(`grid-template-columns:${String(cols.size)};`);
        const gaps = s[`grid_gaps_${device}`] as { row?: string; column?: string } | undefined;
        if (gaps?.row || gaps?.column) rules[device].push(`gap:${gaps.row || 0}px ${gaps.column || 0}px;`);
      }
    }
    const selector = n.id ? `.eid-${n.id}` : "";
    const isWidget = n.elType === "widget";
    if (!selector) { (n.elements || []).forEach((child, i) => walk(child, [i])); return; }
    if (visibility("desktop")) out.push(`${selector}{display:none!important;}`);
    for (const device of ["tablet", "mobile"] as const) {
      const vis = visibility(device);
      if (vis) {
        const media = device === "tablet" ? "max-width:1024px" : "max-width:767px";
        out.push(`@media(${media}){${selector}{${vis}}}`);
      } else if ((device === "tablet" && s.hide_desktop) || (device === "mobile" && (s.hide_desktop || s.hide_tablet))) {
        const media = device === "tablet" ? "max-width:1024px" : "max-width:767px";
        out.push(`@media(${media}){${selector}{display:${visibleDisplay}!important;}}`);
      }
      const width = isWidget ? s[`_element_custom_width_${device}`] : s[`width_${device}`];
      if (width && typeof width === "object" && "size" in width) {
        const media = device === "tablet" ? "max-width:1024px" : "max-width:767px";
        out.push(`@media(${media}){${selector}{width:${dim(width as Dim)}!important;}}`);
      }
    }
    for (const device of ["tablet", "mobile"] as const) {
      if (rules[device].length) {
        const media = device === "tablet" ? "max-width:1024px" : "max-width:767px";
        const css = rules[device]
          .join("")
          .split(";")
          .filter(Boolean)
          .map((decl) => `${decl}!important;`)
          .join("");
        if (isWidget) out.push(`@media(${media}){${selector} :is(h1,h2,h3,h4,h5,h6,p,div,a,span){${css}}}`);
        else out.push(`@media(${media}){${selector}{${css}}}`);
      }
    }
    (n.elements || []).forEach((child, i) => walk(child, [...path, i]));
  })({ elType: "root", elements: content } as ElementorNode, []);
  return out.join("\n");
}

export function renderNode(n: ElementorNode, cls = ""): string {
  if (n.elType === "widget") {
    const classes = [n.id ? `eid-${n.id}` : "", cls].filter(Boolean).join(" ");
    return classes ? `<div class="${classes}">${widgetHtml(n)}</div>` : widgetHtml(n);
  }
  return innerContainerHtml(n, cls);
}

export function sectionHtml(sec: ElementorNode, idx: number, cls = ""): string {
  const s = sec.settings || {};
  const children = (sec.elements || []).map((c, i) => renderNode(c, `e-node-${idx}-${i}`)).join("");
  const style = [containerStyle(s)];

  const boxedWidth = dim(s.boxed_width as Dim) || "1140px";
  const body = s.content_width === "boxed" ? `<div style="width:100%;max-width:${boxedWidth};margin-left:auto;margin-right:auto;">${children}</div>` : children;
  const idClass = sec.id ? `eid-${sec.id}` : "";
  const html = `<section data-section="${idx}" class="${[idClass, cls].filter(Boolean).join(" ")}" style="${style.join("")}">${body}</section>`;
  if (s.html_tag === "a" && s.link && typeof s.link === "object") {
    const link = s.link as { url?: string; is_external?: string };
    return `<a href="${escapeAttr(link.url || "#")}"${link.is_external ? ' target="_blank" rel="noopener"' : ""} style="display:block;color:inherit;text-decoration:none;">${html}</a>`;
  }
  return html;
}

const DESIGN_WIDTH_FALLBACK = 1920;
const PAGE_CSS = (innerMinWidth: number) => `
:root{color-scheme:light}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1f2933;background:#fff;font-size:16px;-webkit-font-smoothing:antialiased;min-width:${innerMinWidth ? `${innerMinWidth}px` : "0"};overflow-x:auto}
img{max-width:100%}
.e-inner>*{max-width:100%}
`;

export function renderTemplateHtml(template: { title?: string; content?: ElementorNode[] }): string {
  const sections = (template.content || []).map((s, i) => sectionHtml(s, i)).join("\n");
  const responsive = responsiveRules(template.content || []);
  const body = sections || '<div style="padding:40px;color:#8492a6;">（空模板）</div>';
  // 探测内容中的固定宽度（描述符来自模板根容器）
  const rootW = (template.content?.[0]?.settings?.width as Dim | undefined)?.size || 0;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(template.title || "M-AI-E 预览")}</title>
  <style>${PAGE_CSS(Number(rootW))}${responsive}</style>
</head>
<body>
${body}
</body>
</html>`;
}
