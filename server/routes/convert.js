import { Router } from "express";
import { convertSamples } from "../services/converter.js";
import { enhanceTemplate } from "../services/llm.js";
import { store } from "../store.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), "../../samples");
export const router = Router();

// POST /api/convert  把 samples 转换为 Elementor 模板（可选 LLM 增强）
router.post("/convert", async (req, res) => {
  const llmCfg = req.body?.llm;
  try {
    const { template, stats } = convertSamples(SAMPLES);

    let enhanced = false;
    if (llmCfg?.enabled) {
      let meta = { rootName: template.title, width: 0, height: 0 };
      try {
        const m = JSON.parse(readFileSync(join(SAMPLES, "mode1_sections.json"), "utf8"));
        meta = m.rootMetadata || meta;
      } catch { /* 无 meta 用默认 */ }
      try {
        const enh = await enhanceTemplate({ template, meta, cfg: llmCfg });
        template._mae_meta = enh;
        enhanced = true;
      } catch (e) {
        return res.status(502).json({ error: `LLM 增强失败：${e.message}` });
      }
    }

    const id = store.save(template);
    res.json({ id, title: template.title, stats, enhanced });
  } catch (e) {
    res.status(500).json({ error: e.message || "转换失败" });
  }
});

// GET /api/template/:id  下载缓存的 Elementor 模板 .json
router.get("/template/:id", (req, res) => {
  const t = store.get(req.params.id);
  if (!t) return res.status(404).json({ error: "模板不存在或已过期" });
  const filename = `${encodeURIComponent(t.title).replace(/%20/g, "_")}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(t, null, 2));
});

// GET /api/preview/:id  前端预览概览
router.get("/preview/:id", (req, res) => {
  const t = store.get(req.params.id);
  if (!t) return res.status(404).json({ error: "模板不存在或已过期" });
  const flat = [];
  (function walk(n, depth) {
    flat.push({ type: n.elType, widgetType: n.widgetType || "", title: n.settings?.title, depth });
    (n.elements || []).forEach((c) => walk(c, depth + 1));
  })({ elements: t.content }, 0);
  res.json({
    title: t.title,
    tree: flat,
    enhanced: t._mae_meta?.sections || null,
  });
});
