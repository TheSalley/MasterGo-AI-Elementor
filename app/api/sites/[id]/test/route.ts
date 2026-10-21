import { NextResponse } from "next/server";
import { sites } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";
import { testSite } from "@/server/services/wp-import.js";

export const runtime = "nodejs";

// POST /api/sites/:id/test  测试连接（登录用户可用）：地址可达 / 插件已装 / 密钥正确
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await ctx.params;
  const site = sites.get(id);
  if (!site) return NextResponse.json({ error: "站点不存在" }, { status: 404 });

  try {
    const result = await testSite({
      siteUrl: site.url,
      apiKey: site.apiKey,
      basicAuth: site.basicAuth.enabled
        ? { username: site.basicAuth.username, password: site.basicAuth.password }
        : null,
    });
    sites.updateTestResult(id, {
      status: result.ok ? "ok" : "fail",
      error: result.ok ? "" : result.error || "连接失败",
    });
    return NextResponse.json({ ...result, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "连接失败";
    sites.updateTestResult(id, { status: "fail", error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
