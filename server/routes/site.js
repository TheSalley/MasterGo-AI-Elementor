import { Router } from "express";
import { pluginZip, importToSite } from "../services/wp-import.js";
import { store } from "../store.js";

export const router = Router();

// GET /api/site/plugin  下载 mae-import.zip 插件包（WP 上传安装）
router.get("/plugin", async (_req, res) => {
  try {
    const buf = await pluginZip();
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="mae-import.zip"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message || "打包失败" });
  }
});

// POST /api/site/import  一键写入目标 WP 站点（可选带 nginx Basic Auth）
router.post("/import", async (req, res) => {
  const { templateId, siteUrl, apiKey, pageTitle, slug, basicAuth } = req.body || {};
  const template = store.get(templateId);
  if (!template) return res.status(404).json({ error: "模板不存在，请先转换" });
  if (!siteUrl) return res.status(400).json({ error: "缺少站点地址" });
  if (!apiKey) return res.status(400).json({ error: "缺少接口密钥（插件中配置的密钥）" });

  try {
    const result = await importToSite({ siteUrl, apiKey, template, pageTitle, slug, basicAuth });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || "导入失败" });
  }
});
