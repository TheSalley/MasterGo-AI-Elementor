import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { parseMastergoUrl, fetchMastergoDesign } from "@/server/services/mg-client.js";
import { SAMPLES_DIR } from "@/lib/server/paths";
import { settings } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// 取 MasterGo 令牌：界面传入 > 进程环境变量 > Windows 用户级环境变量
function resolveMgToken(bodyToken: unknown) {
  if (typeof bodyToken === "string" && bodyToken.trim()) return bodyToken.trim();
  if (process.env.MG_TOKEN) return process.env.MG_TOKEN;
  try {
    const u = execSync(
      `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('MG_TOKEN','User')"`,
      { encoding: "utf8" }
    ).trim();
    if (u) return u;
  } catch {
    // 读不到则忽略
  }
  return "";
}

// POST /api/mastergo/parse  取数
export async function POST(req: Request) {
  try {
    const me = await requireApiUser();
    if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { url, fileId, layerId } = body;
    const token = resolveMgToken(body.token);
    let fid = typeof fileId === "string" ? fileId : "";
    let lid = typeof layerId === "string" ? layerId : "";
    if (typeof url === "string" && url) {
      const p = parseMastergoUrl(url);
      if (p) {
        fid = p.fileId;
        lid = p.layerId || p.fileId;
      }
    }
    if (!token) {
      return NextResponse.json(
        { error: "缺少 MasterGo 令牌（界面填写或配置环境变量 MG_TOKEN）" },
        { status: 400 }
      );
    }
    if (!fid) {
      return NextResponse.json({ error: "需要 fileId 或有效的 MasterGo 文件链接" }, { status: 400 });
    }
    const result = await fetchMastergoDesign({ token, fileId: fid, layerId: lid || fid, outDir: SAMPLES_DIR });
    // 记住最近一次取数：设计稿链接 + 界面填写的令牌（环境变量令牌不回写）
    settings.set({
      mastergo: {
        lastUrl: typeof url === "string" && url ? url : "",
        lastToken: typeof body.token === "string" && body.token.trim() ? body.token.trim() : "",
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取数失败" },
      { status: 500 }
    );
  }
}
