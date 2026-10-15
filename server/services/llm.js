// LLM 增强层：基于确定性转换结果做语义化增强（不改结构，只附加 _mae_meta）
// 接入 OpenAI 兼容 /chat/completions。未配置 key 时返回 null（规则结果不受影响）。

const DEFAULTS = {
  baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  apiKey: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
};

// 从 template.content 提取每个 section 的概览（供 LLM 分析，节省 token）
export function sectionSummaries(content) {
  return content.map((sec, i) => {
    const headings = [];
    const widgets = {};
    let containers = 0;
    (function walk(n, depth) {
      if (n.elType === "container") containers++;
      if (n.elType === "widget") {
        widgets[n.widgetType] = (widgets[n.widgetType] || 0) + 1;
        if (n.widgetType === "heading") headings.push(n.settings?.title ?? "");
      }
      (n.elements || []).forEach((c) => walk(c, depth + 1));
    })(sec, 0);
    return {
      idx: i,
      containers,
      widgets,
      headings: headings.slice(0, 6),
    };
  });
}

function buildPrompt(meta, summaries) {
  const list = summaries
    .map((s) => `- section #${s.idx}: widgets=${JSON.stringify(s.widgets)}, 容器=${s.containers}, 标题样例=${JSON.stringify(s.headings.slice(0, 4))}`)
    .join("\n");
  return {
    system: `你是资深前端架构师，分析一段由设计稿自动转译的 Elementor 页面结构概览，做语义化增强。页面信息：根=${meta.rootName}，尺寸=${meta.width}x${meta.height}。
对每个 section 输出 JSON 数组元素，字段：
- idx: section 序号
- type: 语义类型（hero/nav/features/products/industries/about/solution/cta/contact/form/certification/faq/partners/news/footer/privacy/other）
- displayName: 简短中文语义名（如"首页主视觉"）
- layout: 该 section 建议的 Elementor 布局策略（flex 方向/栅格/叠放要点）
- description: 一句话内容说明
只输出 JSON 数组，不要 Markdown 代码块，不要解释。`,
    user: list,
  };
}

async function callChat({ baseUrl, apiKey, model, messages }) {
  const url = `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LLM 请求失败 ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// 增强入口：llmCfg 为空/无 key 时返回 null（不启用）
export async function enhanceTemplate({ template, meta, cfg }) {
  const baseUrl = cfg?.baseUrl || DEFAULTS.baseUrl;
  const apiKey = cfg?.apiKey || DEFAULTS.apiKey;
  const model = cfg?.model || DEFAULTS.model;
  if (!apiKey) return null;

  const summaries = sectionSummaries(template.content);
  const { system, user } = buildPrompt(meta, summaries);
  const content = await callChat({ baseUrl, apiKey, model, messages: [{ role: "system", content: system }, { role: "user", content: user }] });

  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\[[\s\S]*\]/);
    parsed = m ? JSON.parse(m[0]) : null;
  }
  if (!Array.isArray(parsed)) throw new Error("LLM 输出不是数组，无法应用增强");

  const sections = parsed.map((s) => ({
    idx: s.idx,
    type: s.type || "other",
    displayName: s.displayName || "",
    layout: s.layout || "",
    description: s.description || "",
  }));

  return {
    model,
    enabled: true,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
