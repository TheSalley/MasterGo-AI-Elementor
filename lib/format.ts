export function fmtTime(ts?: number) {
  return ts ? new Date(ts).toLocaleString("zh-CN", { hour12: false }) : "-";
}

export function widgetSummary(w?: Record<string, number>) {
  return Object.entries(w || {}).map(([k, v]) => `${k} ${v}`).join(" · ");
}

export function sumWidgets(w?: Record<string, number>) {
  return Object.values(w || {}).reduce((a, b) => a + b, 0);
}

export function escapeHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}
