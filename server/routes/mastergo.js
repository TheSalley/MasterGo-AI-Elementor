import { Router } from "express";
import { parseMastergoUrl, fetchMastergoDesign } from "../services/mg-client.js";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), "../../samples");
export const router = Router();

// 取 MasterGo 令牌：界面传入 > 进程环境变量 > Windows 用户级环境变量
function resolveMgToken(bodyToken) {
  if (bodyToken && String(bodyToken).trim()) return String(bodyToken).trim();
  if (process.env.MG_TOKEN) return process.env.MG_TOKEN;
  try {
    const u = execSync(`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('MG_TOKEN','User')"`, { encoding: "utf8" }).trim();
    if (u) return u;
  } catch { /* 读不到则忽略 */ }
  return "";
}

// POST /api/mastergo/parse  取数
router.post("/parse", async (req, res) => {
  const { url, fileId, layerId } = req.body || {};
  const token = resolveMgToken(req.body?.token);
  let fid = fileId, lid = layerId;
  if (url) {
    const p = parseMastergoUrl(url);
    if (p) { fid = p.fileId; lid = p.layerId || p.fileId; }
  }
  if (!token) return res.status(400).json({ error: "缺少 MasterGo 令牌（界面填写或配置环境变量 MG_TOKEN）" });
  if (!fid) return res.status(400).json({ error: "需要 fileId 或有效的 MasterGo 文件链接" });

  try {
    const result = await fetchMastergoDesign({ token, fileId: fid, layerId: lid || fid, outDir: SAMPLES });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || "取数失败" });
  }
});
