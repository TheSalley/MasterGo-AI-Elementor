import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
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

// GET /api/sites  站点列表（登录用户可见，供「上传网站」自动填充）
export async function GET() {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ sites: sites.list() });
}

// POST /api/sites  新建站点（仅管理员）
export async function POST(req: Request) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = cleanBody((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!body.name) return NextResponse.json({ error: "缺少站点名称" }, { status: 400 });
  if (!body.url) return NextResponse.json({ error: "缺少站点地址" }, { status: 400 });

  sites.create({ id: randomBytes(8).toString("hex"), ...body });
  return NextResponse.json({ ok: true, sites: sites.list() });
}
