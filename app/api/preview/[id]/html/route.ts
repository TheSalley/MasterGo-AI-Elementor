import { NextResponse } from "next/server";
import { store } from "@/server/store";
import { renderTemplateHtml } from "@/lib/server/elementor-render";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/preview/:id/html  渲染 Elementor 模板为独立 HTML（可视化预览 iframe）
// 带 ?download=1 时作为附件下载独立 .html 文件
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t: any = store.get(id);
  if (!t) return NextResponse.json({ error: "模板不存在或已过期" }, { status: 404 });

  const html = renderTemplateHtml(t);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (download) {
    const filename = `${encodeURIComponent(t.title || "mae-page").replace(/%20/g, "_")}.html`;
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  } else {
    headers["Content-Security-Policy"] =
      "default-src 'self'; img-src * data: blob:; style-src 'unsafe-inline'; script-src 'none'; frame-ancestors 'self'";
  }
  return new Response(html, {
    headers,
  });
}
