// HTML → Elementor 模板转换器
// 只做静态 HTML/CSS 转换：不执行页面脚本，输出 Elementor 原生 Container / Widget。
import postcss from "postcss";

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);
const SKIP_TAGS = new Set([
  "script", "style", "noscript", "template", "head", "meta", "link", "title",
  "iframe", "object", "embed", "canvas", "map", "area", "source", "track",
]);
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "details", "dialog",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1",
  "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main", "nav",
  "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);
const BUTTON_TAGS = new Set(["button"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const TEXT_TAGS = new Set(["p", "span", "strong", "b", "em", "i", "u", "small", "label", "time", "blockquote"]);
const OPTIONAL_CLOSE = new Map([
  ["p", new Set(["address", "article", "aside", "blockquote", "div", "dl", "fieldset", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul"])],
  ["li", new Set(["li"])],
  ["dt", new Set(["dt", "dd"])],
  ["dd", new Set(["dt", "dd"])],
  ["tr", new Set(["tr"])],
  ["td", new Set(["td", "th"])],
  ["th", new Set(["td", "th"])],
  ["option", new Set(["option"])],
]);

let uid = 0;
let currentBaseUrl = "";
const nextId = () => (++uid).toString(16).padStart(8, "0");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decode = (s) => String(s ?? "")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const norm = (s) => decode(s).replace(/\s+/g, " ").trim();

function resolveUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|mailto:|tel:|sms:|ftp:|data:|blob:|\/\/)/i.test(raw)) return raw.startsWith("//") ? `https:${raw}` : raw;
  if (!currentBaseUrl) return raw;
  try {
    return new URL(raw, currentBaseUrl).href;
  } catch {
    return raw;
  }
}

function safeLink(value) {
  const url = resolveUrl(value);
  return /^\s*(javascript|vbscript|data:text\/html)/i.test(url.replace(/[\u0000-\u0020]+/g, "")) ? "#" : url;
}

// ---------- 轻量 HTML 解析 ----------
function parseAttributes(source) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(source))) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}

export function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  const stack = [root];
  const source = String(html || "");
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  let last = 0, m;
  const addText = (text) => {
    if (text) stack[stack.length - 1].children.push({ tag: "#text", text: decode(text), parent: stack[stack.length - 1] });
  };
  while ((m = re.exec(source))) {
    addText(source.slice(last, m.index));
    last = re.lastIndex;
    if (!m[1] && !m[2]) continue;
    if (m[1]) {
      const close = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === close) { stack.length = i; break; }
      }
      continue;
    }
    const tag = m[2].toLowerCase();
    for (let i = stack.length - 1; i > 0 && OPTIONAL_CLOSE.get(stack[i].tag)?.has(tag); i = stack.length - 1) {
      stack.pop();
    }
    const node = { tag, attrs: parseAttributes(m[3] || ""), children: [], parent: stack[stack.length - 1] };
    stack[stack.length - 1].children.push(node);
    if (!m[4] && !VOID_TAGS.has(tag)) stack.push(node);
  }
  addText(source.slice(last));
  return root;
}

// ---------- CSS 解析与选择器匹配 ----------
function splitTopLevel(value, separator = ",") {
  const parts = [];
  let depth = 0, quote = "", current = "";
  for (const ch of String(value || "")) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === separator && depth === 0) { parts.push(current.trim()); current = ""; }
    else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

function parseDeclarations(text) {
  const out = {};
  for (const item of splitTopLevel(text, ";")) {
    const at = item.indexOf(":");
    if (at < 0) continue;
    const key = item.slice(0, at).trim().toLowerCase();
    const val = item.slice(at + 1).trim();
    if (key && val) out[key] = val.replace(/\s*!important\s*$/i, "").trim();
  }
  return out;
}

function mediaKind(params) {
  const q = String(params || "").toLowerCase();
  if (!q.includes("max-width")) return null;
  const n = parseFloat((q.match(/max-width\s*:\s*([\d.]+)/) || [])[1] || "0");
  if (!n) return null;
  if (n <= 767) return "mobile";
  if (n <= 1024) return "tablet";
  return null;
}

function specificity(selector) {
  const s = String(selector || "").replace(/:not\(([^)]*)\)/g, " $1 ");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:{1,2}[\w-]+/g) || []).length;
  const tags = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:{1,2}[\w-]+|[*>+~]/g, " ").match(/\b[a-zA-Z][\w-]*\b/g) || []).length;
  return ids * 100 + classes * 10 + tags;
}

export function parseStyles(css) {
  const rules = [];
  try {
    const root = postcss.parse(String(css || ""));
    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /media$/i.test(rule.parent.name) && /min-width/i.test(rule.parent.params)) return;
      if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
      const media = rule.parent?.type === "atrule" && rule.parent.name === "media" ? mediaKind(rule.parent.params) : null;
      if (rule.parent?.type === "atrule" && rule.parent.name === "media" && !media) return;
      const selectors = splitTopLevel(rule.selector, ",")
        .map((s) => s.trim())
        .filter((s) => s && !/::/.test(s) && !isDynamicSelector(s));
      if (!selectors.length) return;
      const declarations = {};
      rule.each((node) => {
        if (node.type === "decl" && node.prop && node.value) {
          declarations[node.prop.toLowerCase()] = node.value.replace(/\s*!important\s*$/i, "").trim();
        }
      });
      rules.push({ selectors, declarations, media, score: Math.max(...selectors.map(specificity)), order: rules.length });
    });
  } catch {
    // 非法 CSS 不阻断转换，保留内联样式即可。
  }
  return rules.sort((a, b) => a.score - b.score || a.order - b.order);
}

function resolveVars(value, vars, depth = 0) {
  if (depth > 8 || !String(value).includes("var(")) return String(value ?? "");
  return String(value).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, name, fallback) => {
    return vars[name] != null ? resolveVars(vars[name], vars, depth + 1) : resolveVars(fallback || "", vars, depth + 1);
  });
}

const INHERITED = new Set([
  "color", "font-family", "font-size", "font-weight", "font-style", "line-height",
  "letter-spacing", "text-align", "text-transform", "text-decoration", "text-decoration-line",
]);

function isDynamicSelector(selector) {
  const s = String(selector || "");
  if (/:(hover|focus|focus-within|focus-visible|active|visited|target|checked|disabled|enabled|required|placeholder|selection|before|after)\b/i.test(s)) return true;
  const rest = s
    .replace(/:root\b/gi, "")
    .replace(/:not\([^()]*\)/gi, "")
    .replace(/:is\([^()]*\)/gi, "")
    .replace(/:where\([^()]*\)/gi, "")
    .replace(/:(first-child|last-child|nth-child\([^()]*\))/gi, "");
  return /:[a-zA-Z-]+/.test(rest);
}

function cleanSelector(sel) {
  return sel.replace(/::[\w-]+(?:\([^)]*\))?/g, "").replace(/\s*([>+~])\s*/g, " $1 ").trim();
}

function nthChildMatch(node, expr) {
  const list = node.parent?.children?.filter((c) => c.tag !== "#text") || [];
  const index = list.indexOf(node) + 1;
  if (index < 1) return false;
  const raw = String(expr || "").trim().toLowerCase().replace(/\s+/g, "");
  if (raw === "odd") return index % 2 === 1;
  if (raw === "even") return index % 2 === 0;
  if (/^-?\d+$/.test(raw)) return index === Number(raw);
  const m = raw.match(/^([+-]?\d*)n([+-]\d+)?$/);
  if (!m) return false;
  const a = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : Number(m[1]);
  const b = Number(m[2] || 0);
  if (a === 0) return index === b;
  const n = (index - b) / a;
  return Number.isInteger(n) && n >= 0;
}

function matchSimple(node, part) {
  if (!part) return true;
  if (/:root\b/i.test(part) && node.tag !== "html") return false;
  for (const not of part.matchAll(/:not\(([^()]*)\)/gi)) {
    if (splitTopLevel(not[1], ",").some((s) => matchSelector(node, s.trim()))) return false;
  }
  for (const is of part.matchAll(/:is\(([^()]*)\)/gi)) {
    if (!splitTopLevel(is[1], ",").some((s) => matchSelector(node, s.trim()))) return false;
  }
  for (const is of part.matchAll(/:where\(([^()]*)\)/gi)) {
    if (!splitTopLevel(is[1], ",").some((s) => matchSelector(node, s.trim()))) return false;
  }
  if (/:first-child\b/i.test(part)) {
    const list = node.parent?.children?.filter((c) => c.tag !== "#text") || [];
    if (list.indexOf(node) !== 0) return false;
  }
  if (/:last-child\b/i.test(part)) {
    const list = node.parent?.children?.filter((c) => c.tag !== "#text") || [];
    if (list.indexOf(node) !== list.length - 1) return false;
  }
  for (const nth of part.matchAll(/:nth-child\(([^()]*)\)/gi)) {
    if (!nthChildMatch(node, nth[1])) return false;
  }

  const core = part
    .replace(/:root\b/gi, "")
    .replace(/:not\([^()]*\)/gi, "")
    .replace(/:is\([^()]*\)/gi, "")
    .replace(/:where\([^()]*\)/gi, "")
    .replace(/:first-child\b/gi, "")
    .replace(/:last-child\b/gi, "")
    .replace(/:nth-child\([^()]*\)/gi, "");
  const tag = (core.match(/^[a-zA-Z][\w-]*/) || [])[0]?.toLowerCase();
  if (tag && tag !== "*" && node.tag !== tag) return false;
  const id = (core.match(/#([\w-]+)/) || [])[1];
  if (id && node.attrs.id !== id) return false;
  for (const cls of core.match(/\.[\w-]+/g) || []) {
    const set = new Set(String(node.attrs.class || "").split(/\s+/).filter(Boolean));
    if (!set.has(cls.slice(1))) return false;
  }
  for (const am of core.matchAll(/\[([\w:-]+)(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g)) {
    const [, name, op, a, b, c] = am;
    const actual = node.attrs[name];
    const expected = a ?? b ?? c ?? "";
    if (actual == null) return false;
    if (op === "=" && actual !== expected) return false;
    if (op === "~=" && !actual.split(/\s+/).includes(expected)) return false;
    if (op === "^=" && !actual.startsWith(expected)) return false;
    if (op === "$=" && !actual.endsWith(expected)) return false;
    if (op === "*=" && !actual.includes(expected)) return false;
  }
  return true;
}

function matchSelector(node, selector) {
  const parts = cleanSelector(selector).split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  const sibling = (el, dir) => {
    const list = el.parent?.children?.filter((c) => c.tag !== "#text") || [];
    const i = list.indexOf(el);
    return list[i + dir] || null;
  };
  let current = node;
  for (let i = parts.length - 1; i >= 0; i--) {
    let part = parts[i];
    let combinator = "";
    if (part === ">" || part === "+" || part === "~") { combinator = part; i--; part = parts[i]; }
    if (!part) return false;
    if (combinator === ">") {
      current = current.parent;
      if (!current || !matchSimple(current, part)) return false;
    } else if (combinator === "+") {
      current = sibling(current, -1);
      if (!current || !matchSimple(current, part)) return false;
    } else if (combinator === "~") {
      let prev = sibling(current, -1);
      while (prev && !matchSimple(prev, part)) prev = sibling(prev, -1);
      if (!prev) return false;
      current = prev;
    } else if (i === parts.length - 1) {
      if (!matchSimple(current, part)) return false;
    } else {
      let ancestor = current.parent;
      while (ancestor && !matchSimple(ancestor, part)) ancestor = ancestor.parent;
      if (!ancestor) return false;
      current = ancestor;
    }
  }
  return true;
}

function expandDeclarations(input) {
  const out = {};
  const putBox = (prefix, value) => {
    const p = String(value).trim().split(/\s+/).filter(Boolean);
    if (!p.length) return;
    const [t, r = t, b = t, l = r] = p;
    out[`${prefix}-top`] = t;
    out[`${prefix}-right`] = r;
    out[`${prefix}-bottom`] = b;
    out[`${prefix}-left`] = l;
  };
  for (const [key, raw] of Object.entries(input || {})) {
    const value = String(raw).trim();
    if (!value || key.startsWith("--")) continue;
    if (value.includes("var(")) continue;
    if (key === "display" && value === "none") { out[key] = value; continue; }
    if (key === "padding" || key === "margin") { putBox(key, value); continue; }
    if (key === "border-radius") {
      const p = value.split(/\s+/);
      const [a, b = a, c = a, d = b] = p;
      out["border-top-left-radius"] = a;
      out["border-top-right-radius"] = b;
      out["border-bottom-right-radius"] = c;
      out["border-bottom-left-radius"] = d;
      continue;
    }
    if (key === "border" || key === "border-top" || key === "border-right" || key === "border-bottom" || key === "border-left") {
      const sides = key === "border" ? ["top", "right", "bottom", "left"] : [key.slice(7)];
      const width = value.match(/(?:^|\s)([\d.]+(?:px|rem|em|vw)?)(?=\s|$)/)?.[1] || "0px";
      const style = value.match(/\b(none|solid|dashed|dotted|double|groove|ridge|inset|outset)\b/)?.[0] || "solid";
      const color =
        value.match(/(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/i)?.[0] ||
        value.split(/\s+/).find((x) => /^[a-zA-Z]+$/.test(x) && !/^(none|solid|dashed|dotted|double|groove|ridge|inset|outset|thin|medium|thick)$/i.test(x)) ||
        "currentColor";
      for (const side of sides) {
        out[`border-${side}-width`] = width;
        out[`border-${side}-style`] = style;
        out[`border-${side}-color`] = color;
      }
      continue;
    }
    if (key === "gap") {
      const [row, col = row] = value.split(/\s+/);
      out["row-gap"] = row;
      out["column-gap"] = col;
      continue;
    }
    if (key === "flex") {
      const p = value.split(/\s+/).filter(Boolean);
      let grow = "0", shrink = "1", basis = "auto";
      if (value === "none") { grow = "0"; basis = "auto"; }
      else if (value === "auto") { grow = "1"; basis = "auto"; }
      else if (p.length === 1) { grow = p[0]; basis = "0%"; }
      else if (p.length === 2) {
        grow = p[0];
        if (/^[\d.]+$/.test(p[1])) shrink = p[1];
        else basis = p[1];
      } else {
        [grow, shrink = "1", basis = "auto"] = p;
      }
      Object.assign(out, { "flex-grow": grow, "flex-shrink": shrink, "flex-basis": basis });
      continue;
    }
    if (key === "flex-flow") {
      const p = value.split(/\s+/).filter(Boolean);
      if (p.length) out["flex-direction"] = p[0];
      if (p[1]) out["flex-wrap"] = p[1];
      continue;
    }
    if (key === "background") {
      const url = value.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1];
      const color = value.match(/(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:transparent|currentColor)\b)/i)?.[0];
      if (/(linear|radial)-gradient\(/i.test(value)) out["background-image"] = value;
      if (url) out["background-image"] = `url("${url}")`;
      if (color) out["background-color"] = color;
      continue;
    }
    if (key === "inset") {
      const [t, r = t, b = t, l = r] = value.split(/\s+/);
      Object.assign(out, { top: t, right: r, bottom: b, left: l });
      continue;
    }
    out[key] = value;
  }
  return out;
}

function applyRules(node, rules, bucket, vars) {
  for (const rule of rules) {
    if (rule.media && rule.media !== bucket) continue;
    if (!rule.media && bucket !== "base") continue;
    if (!rule.selectors.some((s) => matchSelector(node, s))) continue;
    const decls = {};
    for (const [k, v] of Object.entries(rule.declarations)) decls[k] = resolveVars(v, vars);
    Object.assign(node.style[bucket], expandDeclarations(decls));
  }
}

function applyStyles(root, rules) {
  const vars = {};
  for (const rule of rules) {
      if (!rule.selectors.some((s) => /(^|,)\s*(:root|html|body)\b/.test(s))) continue;
    for (const [k, v] of Object.entries(rule.declarations)) if (k.startsWith("--")) vars[k] = v;
  }
  for (const key of Object.keys(vars)) vars[key] = resolveVars(vars[key], vars);

  const walk = (node, parent) => {
    if (node.tag === "#text") return;
    node.style = { base: {}, tablet: {}, mobile: {} };
    if (parent?.style) {
      for (const bucket of ["base", "tablet", "mobile"]) {
        for (const key of INHERITED) if (parent.style[bucket][key] != null) node.style[bucket][key] = parent.style[bucket][key];
      }
    }
    applyRules(node, rules, "base", vars);
    if (node.attrs?.style) {
      const inline = parseDeclarations(node.attrs.style);
      for (const [k, v] of Object.entries(inline)) inline[k] = resolveVars(v, vars);
      Object.assign(node.style.base, expandDeclarations(inline));
    }
    node.style.tablet = { ...node.style.base };
    applyRules(node, rules, "tablet", vars);
    node.style.mobile = { ...node.style.tablet };
    applyRules(node, rules, "mobile", vars);
    (node.children || []).forEach((child) => walk(child, node));
  };
  walk(root, null);
}

// ---------- 样式到 Elementor ----------
const pxNum = (v) => {
  const m = String(v ?? "").trim().match(/^(-?[\d.]+)(px|rem|em)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  return unit === "rem" || unit === "em" ? n * 16 : n;
};
const size = (v) => {
  const m = String(v ?? "").trim().match(/^(-?[\d.]+)([a-z%]*)$/i);
  return m ? { unit: m[2] || "px", size: Number(m[1]), sizes: [] } : undefined;
};
const customDim = (v) => {
  const raw = String(v ?? "").trim();
  if (!raw || !(/^-?[\d.]+[a-z%]*$/i.test(raw) || /^(calc|min|max|clamp)\(/i.test(raw))) return undefined;
  return { unit: "custom", size: raw, sizes: [] };
};
const lineHeight = (v) => {
  const raw = String(v ?? "").trim();
  if (!raw) return undefined;
  if (/^-?[\d.]+$/.test(raw)) return { unit: "custom", size: raw, sizes: [] };
  return size(raw);
};
const box = (values) => ({
  unit: "px",
  top: String(values[0] ?? 0), right: String(values[1] ?? values[0] ?? 0),
  bottom: String(values[2] ?? values[0] ?? 0), left: String(values[3] ?? values[1] ?? values[0] ?? 0),
  isLinked: false,
});
const spacing = (style, side) => {
  const names = [`${side}-top`, `${side}-right`, `${side}-bottom`, `${side}-left`];
  const values = names.map((key) => pxNum(style[key]));
  if (!values.some((n) => n != null)) return null;
  return box(values.map((n) => n ?? 0));
};
const LINK_MAP = { left: "left", center: "center", right: "right", justify: "justify" };
const JUSTIFY_MAP = { "flex-start": "flex-start", start: "flex-start", left: "flex-start", center: "center", "flex-end": "flex-end", end: "flex-end", right: "flex-end", "space-between": "space-between", "space-around": "space-around", "space-evenly": "space-evenly" };
const ALIGN_MAP = { "flex-start": "flex-start", start: "flex-start", center: "center", "flex-end": "flex-end", end: "flex-end", stretch: "stretch", baseline: "baseline" };

function gapBox(style) {
  const row = pxNum(style["row-gap"]);
  const col = pxNum(style["column-gap"]);
  if (row == null && col == null) return null;
  const primary = col ?? row ?? 0;
  return {
    unit: "px",
    row: String(row ?? col ?? 0),
    column: String(primary),
    size: String(primary),
    isLinked: (row ?? col) === (col ?? row),
  };
}

function boxShadow(v) {
  if (!v || v === "none") return null;
  const color = String(v).match(/(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8})/)?.[0] || "rgba(0,0,0,.2)";
  const nums = String(v).replace(color, "").match(/-?[\d.]+/g)?.map(Number) || [];
  if (nums.length < 2) return null;
  return {
    horizontal: nums[0] || 0, vertical: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0,
    color, position: /\binset\b/i.test(v) ? "inset" : "",
  };
}

function gradientSettings(v) {
  const m = String(v || "").match(/linear-gradient\((.+)\)/i);
  if (!m) return null;
  const parts = splitTopLevel(m[1], ",");
  if (parts.length < 2) return null;
  const angle = /(-?[\d.]+)deg/.test(parts[0]) ? Number(parts[0].match(/-?[\d.]+/)[0]) : 180;
  const stops = parts.filter((p) => !/(deg|to\s)/i.test(p));
  const parseStop = (s) => ({ color: s.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/)?.[0] || "transparent", pos: Number((s.match(/([\d.]+)%/) || [])[1] ?? (parseStop.p || 0)) });
  const a = parseStop(stops[0]), b = parseStop(stops[1] || stops[0]);
  return {
    background_background: "gradient", background_gradient_type: "linear",
    background_gradient_angle: { unit: "deg", size: angle },
    background_color: a.color, background_color_stop: { unit: "%", size: a.pos || 0 },
    background_color_b: b.color, background_color_b_stop: { unit: "%", size: b.pos || 100 },
  };
}

function backgroundSettings(style) {
  const out = {};
  const image = String(style["background-image"] || "").trim();
  if (image && image !== "none") {
    const url = resolveUrl(image.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1] || "");
    const grad = gradientSettings(image);
    if (grad) Object.assign(out, grad);
    else if (url && !url.startsWith("data:")) {
      Object.assign(out, {
        background_background: "classic",
        background_image: { url, id: "", source: "library" },
        background_size: style["background-size"] || "cover",
        background_position: style["background-position"] || "center center",
        background_repeat: style["background-repeat"] || "no-repeat",
      });
    }
  }
  const bg = style["background-color"];
  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
    if (!out.background_background) {
      out.background_background = "classic";
      out.background_color = bg;
    }
  }
  return out;
}

function borderSettings(style) {
  const out = {};
  const radius = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"].map((k) => pxNum(style[k]) || 0);
  if (radius.some(Boolean)) out.border_radius = box(radius);
  const widths = ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"].map((k) => pxNum(style[k]) || 0);
  if (widths.some(Boolean)) {
    Object.assign(out, {
      border_border: style["border-top-style"] || "solid",
      border_width: box(widths),
      border_color: /^currentcolor$/i.test(style["border-top-color"] || "")
        ? (style.color || "#000000")
        : (style["border-top-color"] || style["border-color"] || "#000000"),
    });
  }
  return out;
}

function typographySettings(style) {
  const out = {};
  const fs = style["font-size"];
  if (fs) { out.typography_typography = "custom"; out.typography_font_size = size(fs); }
  if (style["font-family"]) { out.typography_typography = "custom"; out.typography_font_family = style["font-family"].replace(/['"]/g, "").split(",")[0].trim(); }
  if (style["font-weight"]) { out.typography_typography = "custom"; out.typography_font_weight = String(style["font-weight"]); }
  if (style["line-height"]) { out.typography_typography = "custom"; out.typography_line_height = lineHeight(style["line-height"]); }
  if (style["letter-spacing"]) { out.typography_typography = "custom"; out.typography_letter_spacing = size(style["letter-spacing"]); }
  if (style["text-transform"]) { out.typography_typography = "custom"; out.typography_text_transform = style["text-transform"]; }
  if (style["font-style"]) { out.typography_typography = "custom"; out.typography_font_style = style["font-style"]; }
  if (style["text-decoration-line"] || style["text-decoration"]) {
    const d = style["text-decoration-line"] || style["text-decoration"];
    out.typography_text_decoration = d.includes("underline") ? "underline" : d.includes("line-through") ? "line-through" : "";
  }
  return out;
}

function responsive(base, tablet, mobile, key, transform = (v) => v) {
  const out = {};
  const target = key.replace(/-/g, "_");
  if (tablet?.[key] != null && tablet[key] !== base?.[key]) out[`${target}_tablet`] = transform(tablet[key]);
  if (mobile?.[key] != null && mobile[key] !== tablet?.[key]) out[`${target}_mobile`] = transform(mobile[key]);
  return out;
}

function responsiveTypography(base, tablet, mobile) {
  const out = {};
  if (tablet?.["font-size"] && tablet["font-size"] !== base["font-size"]) out.typography_font_size_tablet = size(tablet["font-size"]);
  if (mobile?.["font-size"] && mobile["font-size"] !== tablet?.["font-size"]) out.typography_font_size_mobile = size(mobile["font-size"]);
  if (tablet?.["line-height"] && tablet["line-height"] !== base["line-height"]) out.typography_line_height_tablet = lineHeight(tablet["line-height"]);
  if (mobile?.["line-height"] && mobile["line-height"] !== tablet?.["line-height"]) out.typography_line_height_mobile = lineHeight(mobile["line-height"]);
  if (tablet?.["letter-spacing"] && tablet["letter-spacing"] !== base["letter-spacing"]) out.typography_letter_spacing_tablet = size(tablet["letter-spacing"]);
  if (mobile?.["letter-spacing"] && mobile["letter-spacing"] !== tablet?.["letter-spacing"]) out.typography_letter_spacing_mobile = size(mobile["letter-spacing"]);
  return out;
}

function responsiveBox(base, tablet, mobile, key, prefix) {
  const out = {};
  const values = (s) => spacing(s, key);
  const b = values(base), t = values(tablet), m = values(mobile);
  if (b) out[prefix] = b;
  if (t && JSON.stringify(t) !== JSON.stringify(b)) out[`${prefix}_tablet`] = t;
  if (m && JSON.stringify(m) !== JSON.stringify(t || b)) out[`${prefix}_mobile`] = m;
  return out;
}

const display = (style) => String(style?.display || "").toLowerCase();
const isFlex = (style) => display(style).includes("flex");
const isGrid = (style) => display(style).includes("grid");
const position = (style) => String(style?.position || "static").toLowerCase();
const isAbsolute = (style) => ["absolute", "fixed"].includes(position(style));

function containerSettings(node, childCount) {
  const base = node.style.base, tablet = node.style.tablet, mobile = node.style.mobile;
  const flex = isFlex(base), grid = isGrid(base);
  const maxWidth = base["max-width"];
  const maxWidthSize = maxWidth && maxWidth !== "none" && maxWidth !== "100%" ? size(maxWidth) : undefined;
  const out = {
    content_width: maxWidthSize ? "boxed" : "full",
    container_type: grid ? "grid" : "flex",
  };
  if (node.tag === "a" && (node.attrs?.href || node.attrs?.["data-href"])) {
    out.html_tag = "a";
    out.link = {
      url: safeLink(node.attrs.href || node.attrs["data-href"]),
      is_external: node.attrs.target === "_blank" ? "on" : "",
      nofollow: /nofollow/i.test(node.attrs.rel || "") ? "on" : "",
      custom_attributes: "",
    };
  }
  if (maxWidthSize) out.boxed_width = maxWidthSize;
  if (grid) {
    const cols = base["grid-template-columns"] || "";
    const rows = base["grid-template-rows"] || "";
    if (cols && cols !== "none") out.grid_columns_grid = { unit: "custom", size: cols, sizes: [] };
    if (rows && rows !== "none") out.grid_rows_grid = { unit: "custom", size: rows, sizes: [] };
    const gap = gapBox(base);
    if (gap) out.grid_gaps = gap;
  } else {
    out.flex_direction = flex
      ? (base["flex-direction"] === "column" || base["flex-direction"] === "column-reverse" ? "column" : "row")
      : "column";
    const gap = gapBox(base);
    if (gap) out.flex_gap = gap;
  const justify = JUSTIFY_MAP[base["justify-content"]];
  const align = ALIGN_MAP[base["align-items"]];
  if (justify) out.flex_justify_content = justify;
  if (align) out.flex_align_items = align;
  }
  if (flex) out.flex_wrap = base["flex-wrap"] === "wrap" || base["flex-wrap"] === "wrap-reverse" ? "wrap" : "nowrap";
  Object.assign(out, backgroundSettings(base), borderSettings(base));
  Object.assign(out, responsiveBox(base, tablet, mobile, "padding", "padding"));
  Object.assign(out, responsiveBox(base, tablet, mobile, "margin", "margin"));
  const minHeight = base["min-height"];
  if (minHeight && minHeight !== "auto") out.min_height = size(minHeight);
  if (tablet["min-height"] && tablet["min-height"] !== minHeight && tablet["min-height"] !== "auto") out.min_height_tablet = size(tablet["min-height"]);
  if (mobile["min-height"] && mobile["min-height"] !== tablet["min-height"] && mobile["min-height"] !== "auto") out.min_height_mobile = size(mobile["min-height"]);
  const width = base.width;
  if (width && width !== "auto" && width !== "100%" && !isAbsolute(base)) out.width = customDim(width) || size(width);
  const basis = flex && base["flex-basis"];
  if (!out.width && basis && basis !== "auto" && basis !== "0%" && basis !== "0px") {
    out.width = customDim(basis) || size(basis);
  }
  if (!isAbsolute(base)) {
    const tw = tablet.width, mw = mobile.width;
    if (tw && tw !== "auto" && tw !== "100%" && tw !== width) out.width_tablet = customDim(tw) || size(tw);
    if (mw && mw !== "auto" && mw !== "100%" && mw !== tw) out.width_mobile = customDim(mw) || size(mw);
  }
  if (base["overflow"] === "hidden") out.overflow = "hidden";
  if (isAbsolute(base)) {
    Object.assign(out, {
      position: "absolute",
      _offset_orientation_h: base.right && !base.left ? "end" : "start",
      _offset_orientation_v: base.bottom && !base.top ? "end" : "start",
    });
    for (const [key, target] of [["top", "_offset_y"], ["bottom", "_offset_y_end"], ["left", "_offset_x"], ["right", "_offset_x_end"]]) {
      if (base[key]) out[target] = size(base[key]) || { unit: "px", size: 0, sizes: [] };
    }
    if (base["z-index"] && base["z-index"] !== "auto") out.z_index = Number(base["z-index"]) || 1;
  }
  if (flex) Object.assign(out, responsive(base, tablet, mobile, "flex-direction", (v) => v === "column" || v === "column-reverse" ? "column" : "row"));
  const gridCols = (s) => s["grid-template-columns"];
  if (grid && tablet["grid-template-columns"] && tablet["grid-template-columns"] !== gridCols(base)) {
    out.grid_columns_grid_tablet = { unit: "custom", size: tablet["grid-template-columns"], sizes: [] };
  }
  if (grid && mobile["grid-template-columns"] && mobile["grid-template-columns"] !== tablet["grid-template-columns"]) {
    out.grid_columns_grid_mobile = { unit: "custom", size: mobile["grid-template-columns"], sizes: [] };
  }
  const gapT = gapBox(tablet), gapM = gapBox(mobile);
  if (grid && gapT && JSON.stringify(gapT) !== JSON.stringify(gapBox(base))) out.grid_gaps_tablet = gapT;
  if (grid && gapM && JSON.stringify(gapM) !== JSON.stringify(gapT || gapBox(base))) out.grid_gaps_mobile = gapM;
  if (flex && tablet["flex-wrap"] && tablet["flex-wrap"] !== base["flex-wrap"]) out.flex_wrap_tablet = tablet["flex-wrap"].startsWith("wrap") ? "wrap" : "nowrap";
  if (flex && mobile["flex-wrap"] && mobile["flex-wrap"] !== tablet["flex-wrap"]) out.flex_wrap_mobile = mobile["flex-wrap"].startsWith("wrap") ? "wrap" : "nowrap";
  if (tablet["justify-content"] && tablet["justify-content"] !== base["justify-content"] && JUSTIFY_MAP[tablet["justify-content"]]) out.flex_justify_content_tablet = JUSTIFY_MAP[tablet["justify-content"]];
  if (mobile["justify-content"] && mobile["justify-content"] !== tablet["justify-content"] && JUSTIFY_MAP[mobile["justify-content"]]) out.flex_justify_content_mobile = JUSTIFY_MAP[mobile["justify-content"]];
  if (tablet["align-items"] && tablet["align-items"] !== base["align-items"] && ALIGN_MAP[tablet["align-items"]]) out.flex_align_items_tablet = ALIGN_MAP[tablet["align-items"]];
  if (mobile["align-items"] && mobile["align-items"] !== tablet["align-items"] && ALIGN_MAP[mobile["align-items"]]) out.flex_align_items_mobile = ALIGN_MAP[mobile["align-items"]];
  const tg = gapBox(tablet), mg = gapBox(mobile);
  if (tg && JSON.stringify(tg) !== JSON.stringify(gapBox(base))) out.flex_gap_tablet = tg;
  if (mg && JSON.stringify(mg) !== JSON.stringify(tg || gapBox(base))) out.flex_gap_mobile = mg;
  const shadow = boxShadow(base["box-shadow"]);
  if (shadow) Object.assign(out, { box_shadow_box_shadow_type: "yes", box_shadow_box_shadow: shadow });
  return out;
}

function widgetTypography(style, tablet, mobile, prefix) {
  const base = { ...typographySettings(style), ...responsiveTypography(style, tablet, mobile) };
  if (prefix === "title") {
    if (style.color) base.title_color = style.color;
    if (style["text-align"]) base.align = LINK_MAP[style["text-align"]] || style["text-align"];
    if (tablet?.["text-align"] && tablet["text-align"] !== style["text-align"]) base.align_tablet = LINK_MAP[tablet["text-align"]] || tablet["text-align"];
    if (mobile?.["text-align"] && mobile["text-align"] !== tablet?.["text-align"]) base.align_mobile = LINK_MAP[mobile["text-align"]] || mobile["text-align"];
  }
  if (prefix === "button") {
    if (style.color) base.button_text_color = style.color;
    if (style["background-color"]) base.background_color = style["background-color"];
    if (style["border-top-left-radius"] || style["border-top-right-radius"] || style["border-bottom-right-radius"] || style["border-bottom-left-radius"]) {
      base.border_radius = box(["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"].map((k) => pxNum(style[k]) || 0));
    }
    const border = borderSettings(style);
    if (border.border_width) Object.assign(base, { border_border: border.border_border, border_width: border.border_width, border_color: border.border_color });
    const pad = spacing(style, "padding");
    if (pad) base.text_padding = pad;
    if (style["box-shadow"]) {
      const shadow = boxShadow(style["box-shadow"]);
      if (shadow) Object.assign(base, { box_shadow_box_shadow_type: "yes", box_shadow_box_shadow: shadow });
    }
  }
  return base;
}

function boxSettings(style, tablet, mobile) {
  const out = {};
  const margin = spacing(style, "margin");
  const padding = spacing(style, "padding");
  if (margin) out._margin = margin;
  if (padding) out._padding = padding;
  const tm = spacing(tablet, "margin"), mm = spacing(mobile, "margin");
  const tp = spacing(tablet, "padding"), mp = spacing(mobile, "padding");
  if (tm && JSON.stringify(tm) !== JSON.stringify(margin)) out._margin_tablet = tm;
  if (mm && JSON.stringify(mm) !== JSON.stringify(tm || margin)) out._margin_mobile = mm;
  if (tp && JSON.stringify(tp) !== JSON.stringify(padding)) out._padding_tablet = tp;
  if (mp && JSON.stringify(mp) !== JSON.stringify(tp || padding)) out._padding_mobile = mp;
  return out;
}

function boxWrap(widget) {
  return { widget };
}

function childSettings(node, isWidget = false) {
  const s = node.style?.base || {};
  const tablet = node.style?.tablet || {};
  const mobile = node.style?.mobile || {};
  const out = {};
  const grow = Number(s["flex-grow"]);
  const shrink = Number(s["flex-shrink"]);
  const basis = s["flex-basis"];
  if (Number.isFinite(grow) && grow !== 0) out._flex_grow = grow;
  if (Number.isFinite(shrink) && shrink !== 1) out._flex_shrink = shrink;
  if (basis && basis !== "auto" && basis !== "0%" && basis !== "0px") {
    out._flex_size = "custom";
    if (isWidget) {
      out._element_width = "initial";
      out._element_custom_width = { unit: "custom", size: basis, sizes: [] };
    } else if (!out.width) {
      out.width = customDim(basis) || size(basis);
    }
  } else if (grow > 0) {
    out._flex_size = "grow";
  }
  if (isWidget) {
    if (isAbsolute(s)) {
      Object.assign(out, {
        _position: s.position,
        _offset_orientation_h: s.right && !s.left ? "end" : "start",
        _offset_orientation_v: s.bottom && !s.top ? "end" : "start",
      });
      for (const [key, target] of [["top", "_offset_y"], ["bottom", "_offset_y_end"], ["left", "_offset_x"], ["right", "_offset_x_end"]]) {
        if (s[key]) out[target] = size(s[key]) || { unit: "px", size: 0, sizes: [] };
      }
      if (s["z-index"] && s["z-index"] !== "auto") out._z_index = Number(s["z-index"]) || 1;
    }
    const width = s.width;
    const customWidth = width && width !== "auto" && width !== "100%" ? customDim(width) : undefined;
    if (customWidth && !out._element_custom_width) {
      out._element_width = "initial";
      out._element_custom_width = customWidth;
    }
    const tw = tablet.width, mw = mobile.width;
    if (tw && tw !== "auto" && tw !== "100%" && tw !== width) {
      out._element_width_tablet = "initial";
      out._element_custom_width_tablet = customDim(tw);
    }
    if (mw && mw !== "auto" && mw !== "100%" && mw !== tw) {
      out._element_width_mobile = "initial";
      out._element_custom_width_mobile = customDim(mw);
    }
  }
  if (s["align-self"] && ALIGN_MAP[s["align-self"]]) out._flex_align_self = ALIGN_MAP[s["align-self"]];
  if (s["grid-column"]) {
    out._grid_column = "custom";
    out._grid_column_custom = s["grid-column"];
  }
  if (s["grid-row"]) {
    out._grid_row = "custom";
    out._grid_row_custom = s["grid-row"];
  }
  return out;
}

function buttonWidget(node, text, imageUrl, imageId) {
  const anchor = node.tag === "a" ? node : findDescendant(node, (c) => c.tag === "a" && Boolean(c.attrs?.href));
  const base = anchor?.style?.base || node.style.base;
  const tablet = anchor?.style?.tablet || node.style.tablet;
  const mobile = anchor?.style?.mobile || node.style.mobile;
  const link = safeLink(anchor?.attrs?.href || node.attrs.href || node.attrs["data-href"] || "#");
  const target = anchor?.attrs?.target || node.attrs.target;
  const icon = imageUrl ? { selected_icon: { value: { url: imageUrl, id: imageId || "" }, library: "svg" } } : {};
  return boxWrap({
    id: nextId(), elType: "widget", isInner: false, widgetType: "button",
    settings: {
      text: text || "按钮",
      link: { url: link, is_external: target === "_blank" ? "on" : "", nofollow: /nofollow/i.test(anchor?.attrs?.rel || node.attrs.rel || "") ? "on" : "" },
      ...widgetTypography(base, tablet, mobile, "button"),
      ...boxSettings(base, tablet, mobile),
      ...childSettings(node, true),
      ...icon,
    },
    elements: [],
  }).widget;
}

function headingWidget(node, text, tag) {
  return boxWrap({
    id: nextId(), elType: "widget", isInner: false, widgetType: "heading",
    settings: {
      title: text,
      header_size: HEADING_TAGS.has(tag) ? tag : "h3",
      ...widgetTypography(node.style.base, node.style.tablet, node.style.mobile, "title"),
      ...boxSettings(node.style.base, node.style.tablet, node.style.mobile),
      ...childSettings(node, true),
    },
    elements: [],
  }).widget;
}

function textWidget(node, html) {
  const htmlWithLink = node.tag === "a" && node.attrs?.href && !/<a\b/i.test(html)
    ? `<a href="${esc(safeLink(node.attrs.href))}">${html || esc(textContent(node))}</a>`
    : html;
  return boxWrap({
    id: nextId(), elType: "widget", isInner: false, widgetType: "text-editor",
    settings: {
      editor: htmlWithLink,
      ...typographySettings(node.style.base),
      ...responsiveTypography(node.style.base, node.style.tablet, node.style.mobile),
      ...(node.style.base["text-align"] ? { align: LINK_MAP[node.style.base["text-align"]] || node.style.base["text-align"] } : {}),
      ...(node.style.tablet["text-align"] && node.style.tablet["text-align"] !== node.style.base["text-align"] ? { align_tablet: LINK_MAP[node.style.tablet["text-align"]] || node.style.tablet["text-align"] } : {}),
      ...(node.style.mobile["text-align"] && node.style.mobile["text-align"] !== node.style.tablet["text-align"] ? { align_mobile: LINK_MAP[node.style.mobile["text-align"]] || node.style.mobile["text-align"] } : {}),
      ...(node.style.base.color ? { text_color: node.style.base.color } : {}),
      ...boxSettings(node.style.base, node.style.tablet, node.style.mobile),
      ...childSettings(node, true),
    },
    elements: [],
  }).widget;
}

function imageWidget(node, url) {
  const style = node.style.base;
  const radius = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"].map((k) => pxNum(style[k]) || 0);
  return boxWrap({
    id: nextId(), elType: "widget", isInner: false, widgetType: "image",
    settings: {
      image: { url, id: "" },
      image_size: "full",
      ...(node.attrs.alt ? { image_alt: node.attrs.alt } : {}),
      ...(style["object-fit"] ? { object_fit: style["object-fit"] } : {}),
      ...(style.width && !style.width.includes("%") ? { image_custom_dimension: { width: String(pxNum(style.width) || ""), height: String(pxNum(style.height) || "") } } : {}),
      ...(radius.some(Boolean) ? { image_border_radius: box(radius) } : {}),
      ...boxSettings(style, node.style.tablet, node.style.mobile),
      ...childSettings(node, true),
    },
    elements: [],
  }).widget;
}

function htmlWidget(html) {
  return { id: nextId(), elType: "widget", isInner: false, widgetType: "html", settings: { html: cleanHtml(html) }, elements: [] };
}

function cleanHtml(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<(iframe|object|embed)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|(?:javascript|vbscript|data:text\/html):[^\s>]+)/gi, ' $1="#"')
    .replace(/\s(?:javascript|vbscript):[^\s>]+/gi, "");
}

function cssValue(value) {
  return resolveUrl(String(value || ""));
}

function styledHtml(node) {
  if (node.tag === "#text") return esc(node.text);
  const style = node.style?.base || {};
  const attrs = { ...(node.attrs || {}) };
  if (node.tag === "img") attrs.src = cssValue(attrs.src || attrs["data-src"] || "");
  const keep = ["src", "alt", "href", "title", "target", "rel", "type", "name", "value", "placeholder", "colspan", "rowspan"];
  const attrText = Object.entries(attrs)
    .filter(([k, v]) => keep.includes(k) && v !== "")
    .map(([k, v]) => ` ${k}="${esc(k === "href" ? safeLink(v) : k === "src" ? cssValue(v) : v)}"`)
    .join("");
  const css = [
    style.color ? `color:${style.color}` : "",
    style["background-color"] ? `background-color:${style["background-color"]}` : "",
    style["font-size"] ? `font-size:${style["font-size"]}` : "",
    style["font-weight"] ? `font-weight:${style["font-weight"]}` : "",
    style["text-align"] ? `text-align:${style["text-align"]}` : "",
    style["line-height"] ? `line-height:${style["line-height"]}` : "",
    style["border-top-width"] ? `border:${style["border-top-width"]} ${style["border-top-style"] || "solid"} ${style["border-top-color"] || "#000"}` : "",
    style["padding-top"] ? `padding:${style["padding-top"]} ${style["padding-right"] || "0"} ${style["padding-bottom"] || "0"} ${style["padding-left"] || "0"}` : "",
  ].filter(Boolean).join(";");
  const styleAttr = css ? ` style="${esc(css)}"` : "";
  if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrText}${styleAttr}>`;
  return `<${node.tag}${attrText}${styleAttr}>${(node.children || []).map(styledHtml).join("")}</${node.tag}>`;
}

function hasOwnBox(style) {
  return Boolean(style && (
    style["background-color"] || style["background-image"] || style["border-top-width"] ||
    style["border-top-left-radius"] || style["box-shadow"] || style["padding-top"] ||
    style["padding-right"] || style["padding-bottom"] || style["padding-left"] ||
    style["margin-top"] || style["margin-right"] || style["margin-bottom"] || style["margin-left"] ||
    style.position || style["min-height"]
  ));
}

function hasVisualBox(style) {
  return Boolean(style && (
    style["background-color"] || style["background-image"] || style["border-top-width"] ||
    style["border-top-left-radius"] || style["box-shadow"] || style["padding-top"] ||
    style["padding-right"] || style["padding-bottom"] || style["padding-left"] ||
    style.position || style["min-height"] || style.width || style.height
  ));
}

function textContent(node) {
  if (node.tag === "#text") return norm(node.text);
  return norm((node.children || []).map(textContent).join(" "));
}

const RICH_TAGS = new Set(["a", "strong", "b", "em", "i", "u", "small", "span", "br"]);

function inlineHtml(node) {
  if (node.tag === "#text") return esc(node.text);
  if (node.tag === "br") return "<br>";
  if (!RICH_TAGS.has(node.tag)) return esc(textContent(node));
  if (node.tag === "span") {
    const children = (node.children || []).map(inlineHtml).join("");
    const style = node.style?.base || {};
    const css = [
      style.color ? `color:${style.color}` : "",
      style["font-size"] ? `font-size:${style["font-size"]}` : "",
      style["font-weight"] ? `font-weight:${style["font-weight"]}` : "",
    ].filter(Boolean).join(";");
    return css ? `<span style="${esc(css)}">${children}</span>` : children;
  }
  const attrs = node.tag === "a" && node.attrs.href ? ` href="${esc(safeLink(node.attrs.href))}"` : "";
  return `<${node.tag}${attrs}>${(node.children || []).map(inlineHtml).join("")}</${node.tag}>`;
}

function richText(node) {
  return (node.children || []).map(inlineHtml).join("").trim();
}

function isRichOnly(node) {
  if (!node.children?.length) return false;
  return node.children.every((child) => child.tag === "#text" || (RICH_TAGS.has(child.tag) && isRichOnly(child)));
}

function isTinyIcon(node) {
  const s = node.style?.base || {};
  const w = pxNum(s.width), h = pxNum(s.height);
  return (w && w <= 32 && (!h || h <= 32)) || (h && h <= 32 && !w);
}

function findDescendant(node, predicate) {
  for (const child of node.children || []) {
    if (child.tag !== "#text" && predicate(child)) return child;
    const found = findDescendant(child, predicate);
    if (found) return found;
  }
  return null;
}

function visibilitySettings(node) {
  const hidden = (style) => String(style?.display || "").toLowerCase() === "none";
  const out = {};
  if (hidden(node.style?.base)) out.hide_desktop = "hidden-desktop";
  if (hidden(node.style?.tablet)) out.hide_tablet = "hidden-tablet";
  if (hidden(node.style?.mobile)) out.hide_mobile = "hidden-mobile";
  return out;
}

function withVisibility(nodes, settings) {
  if (!nodes.length || !Object.keys(settings).length) return nodes;
  return nodes.map((n) => ({ ...n, settings: { ...(n.settings || {}), ...settings } }));
}

function buildElement(node) {
  if (node.tag === "#text") return buildElementInner(node);
  const visibility = visibilitySettings(node);
  if (Object.keys(visibility).length === 3) return null;
  const built = buildElementInner(node);
  if (Array.isArray(built)) return withVisibility(built, visibility);
  return built ? withVisibility([built], visibility)[0] : null;
}

function buildElementInner(node) {
  if (node.tag === "#text") {
    const text = norm(node.text);
    return text ? textWidget(node.parent || node, esc(text)) : null;
  }
  if (SKIP_TAGS.has(node.tag)) return null;
  const style = node.style?.base || {};
  if (style.display === "contents") return (node.children || []).map(buildElement).filter(Boolean);

  if (node.tag === "br") return null;
  if (node.tag === "hr") return { id: nextId(), elType: "widget", isInner: false, widgetType: "divider", settings: { color: style["border-top-color"] || style["background-color"] || "#e5e7eb" }, elements: [] };

  if (node.tag === "img") {
    const src = cssValue(node.attrs["data-src"] || node.attrs["data-original"] || node.attrs["data-lazy-src"] || node.attrs.src || "");
    return src ? imageWidget(node, src) : null;
  }
  if (node.tag === "svg") {
    const html = node.rawSvg || "";
    return html && !isTinyIcon(node) ? htmlWidget(html) : null;
  }

  // 按钮里的图片只作为按钮图标，避免出现「按钮 + 嵌套图片」。
  if (BUTTON_TAGS.has(node.tag) || (node.tag === "a" && /(^|\s)(btn|button|cta)(\s|$)/i.test(node.attrs.class || ""))) {
    const img = findDescendant(node, (c) => c.tag === "img");
    const label = textContent(node);
    return buttonWidget(node, label, cssValue(img?.attrs?.src || ""), "");
  }

  if (HEADING_TAGS.has(node.tag)) {
    const text = textContent(node);
    return text ? headingWidget(node, text, node.tag) : null;
  }
  if ((node.tag === "p" || (TEXT_TAGS.has(node.tag) && !node.children.some((c) => c.tag !== "#text" && BLOCK_TAGS.has(c.tag)))) && !hasVisualBox(style)) {
    const html = richText(node);
    return textContent(node) ? textWidget(node, html) : null;
  }
  if (["ul", "ol", "table", "pre", "blockquote", "form", "video", "audio"].includes(node.tag)) return htmlWidget(styledHtml(node));
  if (BLOCK_TAGS.has(node.tag) && isRichOnly(node) && !hasVisualBox(style)) {
    const html = richText(node);
    return textContent(node) ? textWidget(node, html) : null;
  }

  const children = (node.children || []).flatMap((c) => {
    const r = buildElement(c);
    return Array.isArray(r) ? r : r ? [r] : [];
  });

  // span / strong 等内联元素若没有自己的盒子，直接把内容提上来，避免多余嵌套。
  if (TEXT_TAGS.has(node.tag) && !hasOwnBox(style) && children.length === 1) return children[0];

  if (!children.length && !hasOwnBox(style) && !textContent(node)) return null;
  if (!BLOCK_TAGS.has(node.tag) && node.tag !== "a" && !hasOwnBox(style)) return children;

  // 纯文本链接在没有独立盒子时保持链接语义，避免 href 被丢掉。
  if (node.tag === "a" && node.attrs?.href && children.length === 1 && children[0].widgetType === "text-editor") {
    return textWidget(node, richText(node) || esc(textContent(node)));
  }

  const settings = containerSettings(node, children.length);
  if (!children.length && !hasOwnBox(style)) return null;
  if (!children.length && textContent(node)) children.push(textWidget(node, esc(textContent(node))));
  const isInner = !["body", "#root"].includes(node.parent?.tag);
  return { id: nextId(), elType: "container", isInner, settings: { ...settings, ...childSettings(node) }, elements: children };
}

function absorbText(root) {
  const walk = (n) => {
    if (!n || n.tag === "#text") return;
    const textKids = (n.children || []).filter((c) => c.tag === "#text" && norm(c.text));
    if (!textKids.length) { (n.children || []).forEach(walk); return; }
    const kept = [];
    let run = "";
    for (const child of n.children || []) {
      if (child.tag === "#text") run += child.text;
      else { if (norm(run)) kept.push({ tag: "#text", text: run.replace(/\s+/g, " "), parent: n }); run = ""; kept.push(child); walk(child); }
    }
    if (norm(run)) kept.push({ tag: "#text", text: run.replace(/\s+/g, " "), parent: n });
    n.children = kept;
  };
  walk(root);
}

function serializeNode(node) {
  if (node.tag === "#text") return esc(node.text);
  const attrs = Object.entries(node.attrs || {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${(node.children || []).map(serializeNode).join("")}</${node.tag}>`;
}

function captureSvgSource(html) {
  const svgs = [];
  const replaced = String(html || "").replace(/<svg\b[\s\S]*?<\/svg>/gi, (svg) => {
    const token = `__MAE_SVG_${svgs.length}__`;
    svgs.push(svg);
    return `<span data-mae-svg="${token}"></span>`;
  });
  return { html: replaced, svgs };
}

function restoreSvgSource(root, svgs) {
  const walk = (n) => {
    if (n.tag === "span" && /^__MAE_SVG_\d+__$/.test(n.attrs?.["data-mae-svg"] || "")) {
      n.tag = "svg";
      n.rawSvg = svgs[Number(n.attrs["data-mae-svg"].match(/\d+/)[0])] || "";
      n.attrs = {};
      n.children = [];
      return;
    }
    (n.children || []).forEach(walk);
  };
  walk(root);
}

function findBody(root) {
  let body = null;
  const walk = (n) => {
    if (body) return;
    if (n.tag === "body") { body = n; return; }
    (n.children || []).forEach(walk);
  };
  walk(root);
  return body || root;
}

function findTitle(root) {
  let title = "";
  const walk = (n) => {
    if (title) return;
    if (n.tag === "title") { title = norm(textContent(n)); return; }
    (n.children || []).forEach(walk);
  };
  walk(root);
  return title;
}

function wrapTopLevelWidgets(nodes) {
  return nodes.map((node) => {
    if (node.elType === "container") return node;
    return {
      id: nextId(), elType: "container", isInner: false,
      settings: { content_width: "full", container_type: "flex", flex_direction: "column" },
      elements: [node],
    };
  });
}

function countStats(content) {
  const widgets = {};
  let containers = 0, absolute = 0, images = 0;
  (function walk(n) {
    if (n.elType === "container") {
      containers++;
      if (n.settings?.position === "absolute") absolute++;
    }
    if (n.elType === "widget") {
      widgets[n.widgetType] = (widgets[n.widgetType] || 0) + 1;
      if (n.widgetType === "image") images++;
    }
    (n.elements || []).forEach(walk);
  })({ elements: content });
  return { source: "html", sections: content.length, containers, widgets, abs: absolute, images };
}

export function convertHtml(html, opts = {}) {
  uid = 0;
  const source = String(html || "").trim();
  if (!source) throw new Error("HTML 内容为空");
  if (source.length > 2 * 1024 * 1024) throw new Error("HTML 超过 2MB，请先拆分页面");
  currentBaseUrl = String(opts.baseUrl || "").trim();

  try {
    return convertHtmlSource(source, opts);
  } finally {
    currentBaseUrl = "";
  }
}

function convertHtmlSource(source, opts) {

  const captured = captureSvgSource(source);
  const root = parseHtml(captured.html);
  restoreSvgSource(root, captured.svgs);
  // SVG 在解析阶段会变成空节点，因此序列化前保留原节点文本。
  root.children?.forEach((n) => { if (n.tag === "style") n.rawSvg = ""; });

  const styles = [];
  const collectStyles = (n) => {
    if (n.tag === "style" && n.children?.length) styles.push(n.children.map((c) => c.text || "").join(""));
    (n.children || []).forEach(collectStyles);
  };
  collectStyles(root);

  const css = [styles.join("\n"), String(opts.css || "")].filter(Boolean).join("\n");

  // 序列化 SVG 原串，防止 HTML 解析器把内部标签拆散。
  const annotateSvg = (n) => {
    if (n.tag === "svg" && !n.rawSvg) n.rawSvg = serializeNode(n);
    (n.children || []).forEach(annotateSvg);
  };
  annotateSvg(root);

  applyStyles(root, parseStyles(css));
  absorbText(root);
  const body = findBody(root);
  let count = 0;
  (function countNodes(n) { if (n.tag !== "#text" && ++count > 15000) throw new Error("HTML 节点超过 15000 个，请拆分页面"); (n.children || []).forEach(countNodes); })(root);
  const nodes = (body.children || []).flatMap((n) => {
    const r = buildElement(n);
    return Array.isArray(r) ? r : r ? [r] : [];
  });

  const content = nodes.length ? wrapTopLevelWidgets(nodes) : [htmlWidget(source)];
  const title = opts.title || findTitle(root) || body.attrs?.["data-title"] || "HTML 页面";
  const template = { title: String(title).slice(0, 80), type: "page", version: "0.5", page_settings: {}, content };
  return { template, stats: countStats(content) };
}

export function convertHtmlSections(sections, opts = {}) {
  const content = (sections || []).map((section) => {
    const { template } = convertHtml(section.html || "", { title: section.title });
    return { id: nextId(), elType: "container", isInner: false, settings: { content_width: "full", container_type: "flex", flex_direction: "column" }, elements: template.content };
  }).flat();
  const template = { title: opts.title || "HTML 页面", type: "page", version: "0.5", page_settings: {}, content };
  return { template, stats: countStats(content) };
}
