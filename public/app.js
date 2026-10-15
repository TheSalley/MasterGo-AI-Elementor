const $ = (id) => document.getElementById(id);
const state = { templateId: null, title: null };

function setBtn(btn, on) { btn.disabled = !on; }
async function post(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `请求失败 ${r.status}`);
  return data;
}

function renderParse(d) {
  const m = d.meta;
  const rows = d.sections.map((s) =>
    `<tr><td>#${s.idx}</td><td>${escapeHtml(s.name || "-")}</td><td>${s.type}</td><td>${s.nodes}</td></tr>`
  ).join("");
  $("parse-result").innerHTML = `
    <p class="ok">✓ 拉取成功</p>
    <table class="meta">
      <tr><td>根节点</td><td>${escapeHtml(m.rootName)}</td></tr>
      <tr><td>画板尺寸</td><td>${m.width} × ${m.height}px</td></tr>
      <tr><td>Section 数</td><td>${m.totalSections}</td></tr>
      <tr><td>节点总数</td><td>${m.totalNodes}</td></tr>
      <tr><td>SVG 图标</td><td>${m.svgCount}</td></tr>
    </table>
    <details><summary>Section 列表（${d.sections.length}）</summary>
      <table class="sections"><thead><tr><th>#</th><th>名称</th><th>类型</th><th>节点</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </details>`;
  setBtn($("btn-convert"), true);
}

function renderConvert(d) {
  state.templateId = d.id;
  state.title = d.title;
  const w = d.stats.widgets;
  const widgetDesc = Object.entries(w || {}).map(([k, v]) => `${k} ${v}`).join(" · ");
  $("convert-result").innerHTML = `
    <p class="ok">✓ 模板已生成（${escapeHtml(d.title)}）${d.enhanced ? " · 已启用 LLM 增强" : ""}</p>
    <p class="stats">顶层 section <b>${d.stats.sections}</b> 个 · 容器 <b>${d.stats.containers}</b> · ${widgetDesc}</p>
    <button class="mini" id="btn-preview">预览结构</button>
    <div id="tree"></div>`;
  setBtn($("btn-download"), true);
  setBtn($("btn-import"), true);
  $("btn-preview").onclick = () => loadPreview(d.id);
}

async function loadPreview(id) {
  const r = await fetch(`/api/preview/${id}`);
  const d = await r.json();
  const tree = d.tree.map((n) => {
    const pad = n.depth * 14;
    const label = n.widgetType || "container";
    const title = n.title ? ` · ${escapeHtml(String(n.title).slice(0, 40))}` : "";
    return `<div style="padding-left:${pad}px"><span class="t-${n.type}">${label}</span>${title}</div>`;
  }).join("");
  $("tree").innerHTML = tree;
  if (d.enhanced) {
    const rows = d.enhanced.map((s) =>
      `<tr><td>#${s.idx}</td><td>${escapeHtml(s.displayName || "-")}</td><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.layout || "")}</td><td>${escapeHtml(s.description || "")}</td></tr>`
    ).join("");
    $("tree").innerHTML += `
      <h3 class="enh-title">LLM 语义增强</h3>
      <table class="enhance"><thead><tr><th>#</th><th>语义名</th><th>类型</th><th>布局建议</th><th>说明</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

$("btn-parse").onclick = async () => {
  setBtn($("btn-parse"), false);
  $("parse-result").innerHTML = "正在拉取设计数据…";
  try {
    const d = await post("/api/mastergo/parse", {
      token: $("mg-token").value.trim(),
      url: $("mg-file").value.trim(),
    });
    renderParse(d);
  } catch (e) {
    $("parse-result").innerHTML = `<p class="err">✗ ${escapeHtml(e.message)}</p>`;
  } finally {
    setBtn($("btn-parse"), true);
  }
};

$("btn-convert").onclick = async () => {
  setBtn($("btn-convert"), false);
  $("convert-result").innerHTML = "正在转译…";
  try {
    const d = await post("/api/convert", {
      llm: {
        enabled: $("llm-on").checked,
        baseUrl: $("llm-base").value.trim(),
        apiKey: $("llm-key").value.trim(),
        model: $("llm-model").value.trim(),
      },
    });
    renderConvert(d);
  } catch (e) {
    $("convert-result").innerHTML = `<p class="err">✗ ${escapeHtml(e.message)}</p>`;
  } finally {
    setBtn($("btn-convert"), true);
  }
};

// LLM 配置区显隐
$("llm-cfg").style.display = "none";
$("llm-on").onchange = () => { $("llm-cfg").style.display = $("llm-on").checked ? "block" : "none"; };

$("btn-download").onclick = () => {
  if (!state.templateId) return;
  const a = document.createElement("a");
  a.href = `/api/template/${state.templateId}`;
  a.download = `${(state.title || "page").replace(/\s+/g, "_")}.json`;
  a.click();
};

$("btn-import").onclick = async () => {
  setBtn($("btn-import"), false);
  $("import-result").innerHTML = "正在写入站点…";
  try {
    const d = await post("/api/site/import", {
      templateId: state.templateId,
      siteUrl: $("wp-site").value.trim(),
      apiKey: $("wp-key").value.trim(),
      pageTitle: $("wp-title").value.trim(),
      basicAuth: $("auth-on").checked ? { username: $("auth-user").value.trim(), password: $("auth-pass").value } : null,
    });
    $("import-result").innerHTML = `
      <p class="ok">✓ 已创建页面 #${d.pageId}${d.uploadedImages ? "（上传图片 " + d.uploadedImages + " 张）" : ""}</p>
      <p>标题：${escapeHtml(d.title)}　<a href="${d.editUrl}" target="_blank" rel="noopener">在 Elementor 编辑</a></p>
      ${d.imageErrors && d.imageErrors.length ? `<p class="err">⚠ ${d.imageErrors.length} 张图片上传失败</p>` : ""}`;
  } catch (e) {
    $("import-result").innerHTML = `<p class="err">✗ ${escapeHtml(e.message)}</p>`;
  } finally {
    setBtn($("btn-import"), true);
  }
};

// Basic Auth 区显隐
$("auth-fields").style.display = "none";
$("auth-on").onchange = () => { $("auth-fields").style.display = $("auth-on").checked ? "block" : "none"; };
