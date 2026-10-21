import { NextResponse } from "next/server";
import { settings } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/settings  读取设置
export async function GET() {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(settings.get());
}

// PUT /api/settings  保存设置
export async function PUT(req: Request) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as object;
  return NextResponse.json(settings.set(body));
}
