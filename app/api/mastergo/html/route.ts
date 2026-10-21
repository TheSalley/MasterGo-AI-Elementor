import { NextResponse } from "next/server";
import { renderMastergoHtml } from "@/lib/server/mastergo-html";
import { SAMPLES_DIR } from "@/lib/server/paths";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/mastergo/html  忠实还原渲染设计稿为独立 HTML（可视化预览 / 下载）
// ?download=1 下载 .html 文件；预览则 iframe 内嵌
export async function GET(req: Request) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let html = "";
  try {
    const fonts = new URL(req.url).searchParams.get("fonts") === "1";
    html = renderMastergoHtml(SAMPLES_DIR, { realImages: true, fonts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "渲染失败" }, { status: 500 });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (download) {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || "mastergo-design";
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(title).replace(/%20/g, "_")}.html"`;
  } else {
    headers["Content-Security-Policy"] =
      "default-src 'self'; img-src * data: blob:; style-src 'unsafe-inline'; script-src 'none'; frame-ancestors 'self'";
  }
  return new Response(html, { headers });
}
