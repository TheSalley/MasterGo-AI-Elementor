import { NextResponse } from "next/server";
import { sites } from "@/server/store";
import { requireApiUser, isAdmin } from "@/lib/server/guard";

export const runtime = "nodejs";

function cleanBody(raw: Record<string, unknown>) {
  return {
    name: String(raw.name || "").trim(),
    url: String(raw.url || "").trim().replace(/\/+$/, ""),
    apiKey: String(raw.apiKey || "").trim(),
    pageTitle: String(raw.pageTitle || "").trim(),
    basicAuth: {
      enabled: Boolean((raw.basicAuth as { enabled?: boolean } | undefined)?.enabled),
      username: String((raw.basicAuth as { username?: string } | undefined)?.username || "").trim(),
      password: String((raw.basicAuth as { password?: string } | undefined)?.password || ""),
    },
  };
}

// PUT /api/sites/:id  更新站点（仅管理员）
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await ctx.params;
  if (!sites.get(id)) return NextResponse.json({ error: "站点不存在" }, { status: 404 });

  const body = cleanBody((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!body.name) return NextResponse.json({ error: "缺少站点名称" }, { status: 400 });
  if (!body.url) return NextResponse.json({ error: "缺少站点地址" }, { status: 400 });

  sites.update(id, body);
  return NextResponse.json({ ok: true, sites: sites.list() });
}

// DELETE /api/sites/:id  删除站点（仅管理员）
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await ctx.params;
  if (!sites.remove(id)) return NextResponse.json({ error: "站点不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, sites: sites.list() });
}
